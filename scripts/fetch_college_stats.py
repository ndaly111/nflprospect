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


def fetch_player_stats(prospects: list[dict], years: list[int] = None) -> dict[str, dict]:
    """
    Fetch college stats for a list of prospects.
    Returns {name: {year_str: {stats...}}}
    """
    if years is None:
        years = [2024, 2023, 2022]

    # Build prospect lookup: (name, school) → prospect
    prospect_lookup = {}
    for p in prospects:
        key = (p.get('name', ''), p.get('school', ''))
        prospect_lookup[key] = p

    result: dict[str, dict] = {}

    for year in years:
        logger.info(f'Fetching CFBD stats for {year}...')

        # Fetch all four categories at once
        rows = _get('/stats/player/season', {'year': year})
        if not rows:
            continue

        # Debug: log sample row structure on first iteration
        if rows and year == years[0]:
            sample = rows[0]
            logger.info(f'CFBD sample row keys: {list(sample.keys())}')
            logger.info(f'CFBD sample row: {sample}')

        # Pivot by category
        by_category = {cat: _pivot_stats(rows, cat) for cat in STAT_MAP}

        for p in prospects:
            name = p.get('name', '')
            school = p.get('school', '')
            pos_group = p.get('positionGroup', '')
            category = POSITION_CATEGORY.get(pos_group)
            if not category:
                continue

            player_key = (name, school)
            cat_stats = by_category.get(category, {})
            year_stats = cat_stats.get(player_key, {})

            # For QBs also grab rushing stats
            if pos_group == 'QB' and year_stats:
                rush_stats = by_category.get('rushing', {}).get(player_key, {})
                if rush_stats:
                    year_stats['rushingYards'] = rush_stats.get('rushingYards')
                    year_stats['rushingTDs'] = rush_stats.get('rushingTDs')

            # For RBs also grab receiving
            if pos_group == 'RB' and year_stats:
                recv_stats = by_category.get('receiving', {}).get(player_key, {})
                if recv_stats:
                    year_stats['receptions'] = recv_stats.get('receptions')
                    year_stats['receivingYards'] = recv_stats.get('receivingYards')

            # Count games from any category that has the data
            if year_stats and 'games' not in year_stats:
                for row in rows:
                    if row.get('player') == name and row.get('team') == school and row.get('statType') == 'GP':
                        try:
                            year_stats['games'] = int(float(row['stat']))
                        except Exception:
                            pass
                        break

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
