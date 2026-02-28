"""
Fetch college stats from the College Football Data API (cfbd).
Returns dict keyed by player name: {year: {stat: value, ...}}
"""
import os
import logging
import requests

logger = logging.getLogger(__name__)
CFBD_BASE = 'https://api.collegefootballdata.com'
TIMEOUT = 15

POSITION_MAP = {
    'QB': 'passing',
    'RB': 'rushing',
    'WR': 'receiving',
    'TE': 'receiving',
    'DB': 'defensive',
    'CB': 'defensive',
    'S': 'defensive',
    'LB': 'defensive',
    'DL': 'defensive',
    'DE': 'defensive',
    'DT': 'defensive',
    'EDGE': 'defensive',
    'OL': None,
    'OT': None,
    'OG': None,
    'C': None,
}


def _headers() -> dict:
    key = os.environ.get('CFBD_API_KEY', '')
    if key:
        return {'Authorization': f'Bearer {key}'}
    return {}


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
        logger.warning(f'CFBD {endpoint} failed: {e}')
        return []


def fetch_player_stats(prospects: list[dict], years: list[int] = None) -> dict[str, dict]:
    """
    Fetch college stats for a list of prospects.
    Returns {name: {year: {stats...}}}
    """
    if years is None:
        years = [2024, 2023, 2022]

    result: dict[str, dict] = {}

    # Get unique teams to batch API calls
    teams = list({p.get('school', '') for p in prospects if p.get('school')})

    for year in years:
        logger.info(f'Fetching CFBD stats for {year}...')

        # Fetch all stat types
        passing = _get('/stats/player/season', {'year': year, 'statTypeId': 1})
        rushing = _get('/stats/player/season', {'year': year, 'statTypeId': 2})
        receiving = _get('/stats/player/season', {'year': year, 'statTypeId': 3})
        defensive = _get('/stats/player/season', {'year': year, 'statTypeId': 11})

        # Build lookup: {(player, team): stats}
        def index_stats(rows, stat_keys):
            idx = {}
            for row in rows:
                key = (row.get('player', ''), row.get('team', ''))
                idx[key] = {k: row.get(k) for k in stat_keys if k in row}
            return idx

        pass_idx = index_stats(passing, ['completions', 'attempts', 'yards', 'touchdowns', 'interceptions', 'games'])
        rush_idx = index_stats(rushing, ['carryAttempts', 'yards', 'touchdowns', 'games'])
        recv_idx = index_stats(receiving, ['receptions', 'yards', 'touchdowns', 'games'])
        def_idx = index_stats(defensive, ['tackles', 'sacks', 'tacklesForLoss', 'interceptions', 'passesDefended', 'games'])

        for prospect in prospects:
            name = prospect.get('name', '')
            school = prospect.get('school', '')
            pos = prospect.get('position', '').upper()
            key = (name, school)

            stat_type = POSITION_MAP.get(pos)
            year_stats = {}

            if stat_type == 'passing' and key in pass_idx:
                s = pass_idx[key]
                year_stats = {
                    'games': s.get('games'),
                    'completions': s.get('completions'),
                    'attempts': s.get('attempts'),
                    'passingYards': s.get('yards'),
                    'passingTDs': s.get('touchdowns'),
                    'interceptions': s.get('interceptions'),
                }
                # Also grab rush stats if available
                if key in rush_idx:
                    rs = rush_idx[key]
                    year_stats['rushingYards'] = rs.get('yards')
                    year_stats['rushingTDs'] = rs.get('touchdowns')

            elif stat_type == 'rushing' and key in rush_idx:
                s = rush_idx[key]
                year_stats = {
                    'games': s.get('games'),
                    'rushingAttempts': s.get('carryAttempts'),
                    'rushingYards': s.get('yards'),
                    'rushingTDs': s.get('touchdowns'),
                }
                if key in recv_idx:
                    rs = recv_idx[key]
                    year_stats['receptions'] = rs.get('receptions')
                    year_stats['receivingYards'] = rs.get('yards')

            elif stat_type == 'receiving' and key in recv_idx:
                s = recv_idx[key]
                year_stats = {
                    'games': s.get('games'),
                    'receptions': s.get('receptions'),
                    'receivingYards': s.get('yards'),
                    'receivingTDs': s.get('touchdowns'),
                }

            elif stat_type == 'defensive' and key in def_idx:
                s = def_idx[key]
                year_stats = {
                    'games': s.get('games'),
                    'tackles': s.get('tackles'),
                    'sacks': s.get('sacks'),
                    'tfls': s.get('tacklesForLoss'),
                    'interceptions': s.get('interceptions'),
                    'pbus': s.get('passesDefended'),
                }

            if year_stats:
                if name not in result:
                    result[name] = {}
                result[name][str(year)] = {k: v for k, v in year_stats.items() if v is not None}

    logger.info(f'CFBD: stats found for {len(result)} prospects')
    return result


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    test_prospects = [
        {'name': 'Travis Hunter', 'school': 'Colorado', 'position': 'WR'},
        {'name': 'Abdul Carter', 'school': 'Penn State', 'position': 'EDGE'},
    ]
    data = fetch_player_stats(test_prospects)
    for name, years in data.items():
        print(f'{name}:')
        for yr, stats in years.items():
            print(f'  {yr}: {stats}')
