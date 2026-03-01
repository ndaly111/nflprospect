"""
Fetch college stats from the College Football Data API (cfbd).
Returns dict keyed by player name: {year: {stat: value, ...}}

CFBD API format: flat list of {player, team, category, statType, stat}
One row per (player, statType). Must pivot to get per-player stats.
"""
import os
import logging
import requests
from collections import defaultdict

logger = logging.getLogger(__name__)
CFBD_BASE = 'https://api.collegefootballdata.com'
TIMEOUT = 20

# positionGroup → CFBD category
POSITION_CATEGORY = {
    'QB': 'passing',
    'RB': 'rushing',
    'WR': 'receiving',
    'TE': 'receiving',
    'DB': 'defensive',
    'LB': 'defensive',
    'DL': 'defensive',
    'EDGE': 'defensive',
    'OL': None,
}

# CFBD statType strings → our schema keys (per category)
# Covers both abbreviated (CMP/ATT) and full-word (completions/att) variants
STAT_MAP = {
    'passing': {
        # abbreviated
        'CMP': 'completions', 'ATT': 'attempts', 'YDS': 'passingYards',
        'TD': 'passingTDs', 'INT': 'interceptions',
        # full-word (cfbfastR-style)
        'completions': 'completions', 'att': 'attempts', 'yds': 'passingYards',
        'td': 'passingTDs', 'int': 'interceptions',
        'completionAttempts': 'completions',  # alternative format
    },
    'rushing': {
        'CAR': 'rushingAttempts', 'YDS': 'rushingYards', 'TD': 'rushingTDs',
        'car': 'rushingAttempts', 'yds': 'rushingYards', 'td': 'rushingTDs',
        'rushingAttempts': 'rushingAttempts', 'rushingYards': 'rushingYards',
        'rushingTDs': 'rushingTDs',
    },
    'receiving': {
        'REC': 'receptions', 'YDS': 'receivingYards', 'TD': 'receivingTDs',
        'rec': 'receptions', 'yds': 'receivingYards', 'td': 'receivingTDs',
        'receptions': 'receptions', 'receivingYards': 'receivingYards',
        'receivingTDs': 'receivingTDs',
    },
    'defensive': {
        'TOT': 'tackles', 'SACKS': 'sacks', 'TFL': 'tfls',
        'INT': 'interceptions', 'PD': 'pbus',
        'tot': 'tackles', 'sacks': 'sacks', 'tfl': 'tfls',
        'int': 'interceptions', 'pd': 'pbus',
        'tackles': 'tackles', 'tacklesForLoss': 'tfls',
        'passesDefended': 'pbus', 'interceptions': 'interceptions',
    },
}


def _headers() -> dict:
    key = os.environ.get('CFBD_API_KEY', '')
    return {'Authorization': f'Bearer {key}'} if key else {}


def _get(endpoint: str, params: dict) -> list:
    try:
        r = requests.get(
            f'{CFBD_BASE}{endpoint}',
            params=params,
            headers=_headers(),
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f'CFBD {endpoint} {params} failed: {e}')
        return []


def _pivot_stats(rows: list, category: str) -> dict:
    """
    Pivot flat CFBD rows into {(player, team): {our_key: value}}.
    Rows look like: {player, team, category, statType, stat}
    """
    stat_map = STAT_MAP.get(category, {})
    out: dict = defaultdict(dict)
    for row in rows:
        if row.get('category') != category:
            continue
        stat_type = row.get('statType', '')
        our_key = stat_map.get(stat_type)
        if not our_key:
            continue
        player_key = (row.get('player', ''), row.get('team', ''))
        try:
            out[player_key][our_key] = float(row['stat'])
        except (KeyError, TypeError, ValueError):
            pass
    return dict(out)


def _name_only_index(by_category: dict) -> dict:
    """
    Build a fallback index keyed by player name only (ignoring team).
    CFBD uses full team names ('Indiana Hoosiers') but our prospects store
    short names ('Indiana'), so exact (name, school) lookups often miss.
    """
    out = {}
    for cat, cat_dict in by_category.items():
        name_dict: dict = {}
        for (pname, _team), stats in cat_dict.items():
            if pname not in name_dict:
                name_dict[pname] = stats
            else:
                # Merge duplicate-name rows (rare but possible)
                for k, v in stats.items():
                    if k not in name_dict[pname]:
                        name_dict[pname][k] = v
        out[cat] = name_dict
    return out


def fetch_player_stats(prospects: list[dict], years: list[int] = None) -> dict[str, dict]:
    """
    Fetch college stats for a list of prospects.
    Returns {name: {year_str: {stats...}}}
    """
    if years is None:
        years = [2025, 2024, 2023, 2022]

    result: dict[str, dict] = {}

    for year in years:
        logger.info(f'Fetching CFBD stats for {year}...')

        rows = _get('/stats/player/season', {'year': year})
        if not rows:
            continue

        # Pivot by category: {(player, team): stats}
        by_category = {cat: _pivot_stats(rows, cat) for cat in STAT_MAP}
        # Fallback index by player name only (handles school name mismatches)
        by_name = _name_only_index(by_category)

        # Build GP lookup by player name (ignore team to avoid school-name mismatch)
        gp_by_name: dict[str, int] = {}
        for row in rows:
            if row.get('statType') == 'GP':
                try:
                    gp_by_name[row['player']] = int(float(row['stat']))
                except Exception:
                    pass

        for p in prospects:
            name = p.get('name', '')
            school = p.get('school', '')
            pos_group = p.get('positionGroup', '')
            category = POSITION_CATEGORY.get(pos_group)
            if not category:
                # OL: no individual blocking stats exist; collect games played only
                if pos_group == 'OL' and name in gp_by_name:
                    if name not in result:
                        result[name] = {}
                    result[name][str(year)] = {'games': gp_by_name[name]}
                continue

            # Try exact (name, school) first; fall back to name-only
            cat_stats = by_category.get(category, {})
            year_stats = dict(cat_stats.get((name, school), {}))
            if not year_stats:
                year_stats = dict(by_name.get(category, {}).get(name, {}))

            if not year_stats:
                continue

            # For QBs also grab rushing stats
            if pos_group == 'QB':
                rush = by_category.get('rushing', {}).get((name, school)) \
                       or by_name.get('rushing', {}).get(name, {})
                if rush:
                    year_stats.setdefault('rushingYards', rush.get('rushingYards'))
                    year_stats.setdefault('rushingTDs', rush.get('rushingTDs'))

            # For RBs also grab receiving
            if pos_group == 'RB':
                recv = by_category.get('receiving', {}).get((name, school)) \
                       or by_name.get('receiving', {}).get(name, {})
                if recv:
                    year_stats.setdefault('receptions', recv.get('receptions'))
                    year_stats.setdefault('receivingYards', recv.get('receivingYards'))

            # Games played
            if 'games' not in year_stats and name in gp_by_name:
                year_stats['games'] = gp_by_name[name]

            filtered = {k: v for k, v in year_stats.items() if v is not None}
            if filtered:
                if name not in result:
                    result[name] = {}
                result[name][str(year)] = filtered

    logger.info(f'CFBD: stats found for {len(result)} prospects')
    return result


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    test_prospects = [
        {'name': 'Dillon Gabriel', 'school': 'Oregon', 'positionGroup': 'QB'},
        {'name': 'Ashton Jeanty', 'school': 'Boise State', 'positionGroup': 'RB'},
    ]
    data = fetch_player_stats(test_prospects)
    for name, years in data.items():
        print(f'{name}:')
        for yr, stats in years.items():
            print(f'  {yr}: {stats}')
