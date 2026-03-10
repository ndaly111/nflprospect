"""
One-time script: build historical REC/G baseline from first-round WRs (2013-2025).

Reads draft_history.json to identify first-round WRs, fetches their final
college season receiving stats from CFBD, computes REC/G, and saves a sorted
distribution to data/wr_target_history.json for percentile lookups.
"""
import json
import logging
import os
import sys
import requests
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / 'data'
DRAFT_HISTORY_PATH = DATA_DIR / 'draft_history.json'
OUTPUT_PATH = DATA_DIR / 'wr_target_history.json'

CFBD_BASE = 'https://api.collegefootballdata.com'
TIMEOUT = 20

# Draft years to include in the baseline
START_YEAR = 2013
END_YEAR = 2025


def _headers():
    key = os.environ.get('CFBD_API_KEY', '')
    return {'Authorization': f'Bearer {key}'} if key else {}


def _get(endpoint, params):
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
        logger.warning(f'CFBD {endpoint} {params}: {e}')
        return []


def fetch_receiving_season(year):
    """
    Fetch receptions and games played for all receivers in a given season.
    Returns (rec_by_name, gp_by_name)
    """
    rows = _get('/stats/player/season', {'year': year})
    if not rows:
        return {}, {}

    rec = {}
    gp = {}
    for row in rows:
        name = row.get('player', '')
        st = row.get('statType', '')
        try:
            val = float(row['stat'])
        except (ValueError, TypeError, KeyError):
            continue

        if st in ('REC', 'rec', 'receptions'):
            rec[name] = int(val)
        elif st == 'GP':
            gp[name] = int(val)

    return rec, gp


def main():
    if not DRAFT_HISTORY_PATH.exists():
        logger.error(f'draft_history.json not found at {DRAFT_HISTORY_PATH}')
        return

    history = json.loads(DRAFT_HISTORY_PATH.read_text())

    # Collect first-round WRs grouped by their final college season year
    wrs_by_season = {}  # college_season_year -> list of {name, school, draftYear}
    total = 0
    for draft_year_str, players in history.items():
        try:
            draft_year = int(draft_year_str)
        except ValueError:
            continue
        if draft_year < START_YEAR or draft_year > END_YEAR:
            continue
        for p in players:
            if p.get('actualRound') == 1 and p.get('positionGroup') == 'WR':
                season = draft_year - 1
                if season not in wrs_by_season:
                    wrs_by_season[season] = []
                wrs_by_season[season].append({
                    'name': p['name'],
                    'school': p.get('school', ''),
                    'draftYear': draft_year,
                })
                total += 1

    logger.info(f'Found {total} first-round WRs ({START_YEAR}-{END_YEAR})')

    # Fetch CFBD receiving stats by season year and match to our WRs
    players_out = []
    rpg_values = []

    for season in sorted(wrs_by_season.keys()):
        logger.info(f'Fetching {season} receiving stats...')
        rec_map, gp_map = fetch_receiving_season(season)

        if not rec_map:
            logger.warning(f'  No receiving data for {season}')
            continue

        for wr in wrs_by_season[season]:
            name = wr['name']
            recs = rec_map.get(name)
            games = gp_map.get(name)

            if not recs or not games or games <= 0:
                logger.info(f'  {name} ({wr["school"]}): no data found')
                continue

            rpg = round(recs / games, 1)
            entry = {
                'name': name,
                'school': wr['school'],
                'draftYear': wr['draftYear'],
                'collegeSeason': season,
                'receptions': recs,
                'gamesPlayed': games,
                'recPerGame': rpg,
            }
            players_out.append(entry)
            rpg_values.append(rpg)
            logger.info(f'  {name}: {recs} REC / {games} G = {rpg} REC/G')

    # Sort players by REC/G descending for readability
    players_out.sort(key=lambda x: x['recPerGame'], reverse=True)
    # Sort values ascending for percentile lookup
    rpg_values.sort()

    output = {
        'description': f'Final college season REC/G for first-round WRs, {START_YEAR}-{END_YEAR}',
        'count': len(players_out),
        'players': players_out,
        'percentiles': rpg_values,
    }

    OUTPUT_PATH.write_text(json.dumps(output, indent=2))
    logger.info(f'Wrote {OUTPUT_PATH} ({len(players_out)} players)')

    if rpg_values:
        logger.info(f'REC/G range: {min(rpg_values)} - {max(rpg_values)}')
        median = rpg_values[len(rpg_values) // 2]
        logger.info(f'REC/G median: {median}')
        logger.info('Top 5:')
        for p in players_out[:5]:
            logger.info(f'  {p["name"]} ({p["school"]}, {p["draftYear"]}): {p["recPerGame"]} REC/G')


if __name__ == '__main__':
    main()
