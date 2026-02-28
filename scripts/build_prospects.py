"""
Orchestrator: fetches all data sources, merges, writes data/*.json
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

# Make scripts/ importable
sys.path.insert(0, str(Path(__file__).parent))

from utils import fuzzy_match_player, make_id, normalize_name
from fetch_rankings import fetch_all_rankings
from fetch_combine import fetch_combine
from fetch_college_stats import fetch_player_stats
from fetch_news import fetch_draft_news
from fetch_historical import fetch_historical_by_position, compute_percentiles, compute_stat_importance, compute_player_comps
from fetch_mock_draft import fetch_mock_draft

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / 'data'
DATA_DIR.mkdir(exist_ok=True)

DRAFT_YEAR = 2026
# NFL Draft ends ~April 25; after that date nflverse will have the actual picks.
# Update DRAFT_YEAR each season — everything else is automatic.
DRAFT_DATE = datetime(DRAFT_YEAR, 4, 25, tzinfo=timezone.utc)
NFLVERSE_PICKS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv'

# Team name normalization — map short/variant names → full NFL team name
TEAM_NAME_MAP = {
    'Bears': 'Chicago Bears', 'Bengals': 'Cincinnati Bengals',
    'Bills': 'Buffalo Bills', 'Broncos': 'Denver Broncos',
    'Browns': 'Cleveland Browns', 'Buccaneers': 'Tampa Bay Buccaneers',
    'Cardinals': 'Arizona Cardinals', 'Chargers': 'Los Angeles Chargers',
    'Chiefs': 'Kansas City Chiefs', 'Colts': 'Indianapolis Colts',
    'Cowboys': 'Dallas Cowboys', 'Dolphins': 'Miami Dolphins',
    'Eagles': 'Philadelphia Eagles', 'Falcons': 'Atlanta Falcons',
    'Giants': 'New York Giants', 'Jaguars': 'Jacksonville Jaguars',
    'Jets': 'New York Jets', 'Lions': 'Detroit Lions',
    'Packers': 'Green Bay Packers', 'Panthers': 'Carolina Panthers',
    'Patriots': 'New England Patriots', 'Raiders': 'Las Vegas Raiders',
    'Rams': 'Los Angeles Rams', 'Ravens': 'Baltimore Ravens',
    'Saints': 'New Orleans Saints', 'Seahawks': 'Seattle Seahawks',
    '49ers': 'San Francisco 49ers', 'Steelers': 'Pittsburgh Steelers',
    'Texans': 'Houston Texans', 'Titans': 'Tennessee Titans',
    'Vikings': 'Minnesota Vikings', 'Commanders': 'Washington Commanders',
}

def normalize_team_name(name: str) -> str | None:
    if not name:
        return None
    # Already a full name?
    if any(name.startswith(city) for city in ['Arizona', 'Atlanta', 'Baltimore', 'Buffalo',
        'Carolina', 'Chicago', 'Cincinnati', 'Cleveland', 'Dallas', 'Denver', 'Detroit',
        'Green Bay', 'Houston', 'Indianapolis', 'Jacksonville', 'Kansas City',
        'Las Vegas', 'Los Angeles', 'Miami', 'Minnesota', 'New England', 'New Orleans',
        'New York', 'Philadelphia', 'Pittsburgh', 'San Francisco', 'Seattle',
        'Tampa Bay', 'Tennessee', 'Washington']):
        return name
    return TEAM_NAME_MAP.get(name, name)

# Position group normalization
POSITION_GROUP_MAP = {
    'QB': 'QB', 'RB': 'RB', 'FB': 'RB',
    'WR': 'WR', 'TE': 'TE',
    'OT': 'OL', 'OG': 'OL', 'C': 'OL', 'OL': 'OL', 'IOL': 'OL',
    'DT': 'DL', 'NT': 'DL', 'DL': 'DL',
    'DE': 'EDGE', 'EDGE': 'EDGE', 'OLB': 'EDGE',
    'ILB': 'LB', 'MLB': 'LB', 'LB': 'LB',
    'CB': 'DB', 'S': 'DB', 'FS': 'DB', 'SS': 'DB', 'DB': 'DB',
    'K': 'K', 'P': 'P', 'LS': 'LS',
}


def load_existing() -> list[dict]:
    path = DATA_DIR / 'prospects.json'
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception as e:
            logger.warning(f'Could not load existing prospects.json: {e}')
    return []


def build_prospect_list(rankings_by_source: dict[str, list[dict]]) -> list[dict]:
    """
    Merge all source rankings into a unified prospect list.
    Uses fuzzy matching to deduplicate across sources.
    """
    # Build master list from all sources combined
    all_players: list[dict] = []
    for source, players in rankings_by_source.items():
        for p in players:
            all_players.append({**p, 'source': source})

    # Deduplicate: group by normalized name
    master: dict[str, dict] = {}  # norm_name -> prospect info

    for p in all_players:
        norm = normalize_name(p['name'])
        if norm not in master:
            master[norm] = {
                'name': p['name'],
                'position': p.get('position', ''),
                'school': p.get('school', ''),
                'rankBySource': {},
                'espnGrade': None,
                'espnId': None,
                'projectedTeam': None,
                'classYear': None,
                'heightInches': None,
                'weightLbs': None,
                'tankCombine': {},
                'tankStats': {},
                'cbsStats': {},
            }
        master[norm]['rankBySource'][p['source']] = p['rank']
        # Prefer non-empty position/school
        if p.get('position') and not master[norm]['position']:
            master[norm]['position'] = p['position']
        if p.get('school') and not master[norm]['school']:
            master[norm]['school'] = p['school']
        # Store ESPN metadata
        if p.get('grade') is not None:
            master[norm]['espnGrade'] = p['grade']
        if p.get('espn_id'):
            master[norm]['espnId'] = p['espn_id']
        # Projected team: prefer Walter Football (most explicit pick), then CBS, then ESPN
        if p.get('wf_team') and not master[norm]['projectedTeam']:
            master[norm]['projectedTeam'] = normalize_team_name(p['wf_team'])
        elif p.get('cbs_team') and not master[norm]['projectedTeam']:
            master[norm]['projectedTeam'] = normalize_team_name(p['cbs_team'])
        elif p.get('espn_team') and not master[norm]['projectedTeam']:
            master[norm]['projectedTeam'] = normalize_team_name(p['espn_team'])

        # Class year (from CBS Sports)
        if p.get('class_year') and not master[norm].get('classYear'):
            master[norm]['classYear'] = p['class_year']
        # Tankathon has more precise height (e.g. "6'4"") — prefer over ESPN inches
        if p.get('height') and not master[norm]['heightInches']:
            master[norm]['heightInches'] = p['height']
        if p.get('weight') and not master[norm]['weightLbs']:
            master[norm]['weightLbs'] = p['weight']
        # Tankathon combine drills and stats
        if p.get('tankCombine'):
            master[norm]['tankCombine'].update(p['tankCombine'])
        if p.get('tankStats'):
            master[norm]['tankStats'].update(p['tankStats'])
        # CBS Sports stats (single-season snapshot)
        if p.get('cbs_stats'):
            master[norm]['cbsStats'].update(p['cbs_stats'])

    prospects = list(master.values())

    # Compute consensus rank = mean of source ranks, then re-sort 1..N
    for p in prospects:
        ranks = list(p['rankBySource'].values())
        p['consensusRank'] = round(mean(ranks)) if ranks else 999

    prospects.sort(key=lambda p: p['consensusRank'])
    for i, p in enumerate(prospects):
        p['consensusRank'] = i + 1

    return prospects


def merge_with_existing(new_prospects: list[dict], existing: list[dict]) -> list[dict]:
    """
    Merge new rankings with existing data, preserving rankHistory.
    """
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    # Index existing by id and name
    existing_by_id = {p['id']: p for p in existing}
    existing_by_name = {normalize_name(p['name']): p for p in existing}

    result = []
    for p in new_prospects:
        pos_group = POSITION_GROUP_MAP.get(p['position'].upper().split('/')[0], 'DB')
        prospect_id = make_id(p['name'], p['position'], p['school'])

        # Find existing record
        existing_rec = existing_by_id.get(prospect_id) or existing_by_name.get(normalize_name(p['name']))

        # Build rank history
        rank_history = list(existing_rec.get('rankHistory', [])) if existing_rec else []
        dates_present = {r['date'] for r in rank_history}
        if today not in dates_present:
            rank_history.append({'date': today, 'rank': p['consensusRank']})
        rank_history.sort(key=lambda r: r['date'])

        # Projected round heuristic
        rank = p['consensusRank']
        if rank <= 32:
            proj_round = 1
            pick_range = [max(1, rank - 5), min(32, rank + 5)]
        elif rank <= 64:
            proj_round = 2
            pick_range = [33, 64]
        elif rank <= 105:
            proj_round = 3
            pick_range = [65, 105]
        elif rank <= 140:
            proj_round = 4
            pick_range = [106, 140]
        elif rank <= 175:
            proj_round = 5
            pick_range = [141, 175]
        elif rank <= 215:
            proj_round = 6
            pick_range = [176, 215]
        else:
            proj_round = 7
            pick_range = [216, 257]

        # Count how many of this position group are ranked higher
        # (will be fixed in a second pass)
        # Build combine data from Tankathon drills + ESPN/Tankathon height/weight
        existing_combine = existing_rec.get('combineData') if existing_rec else None
        tank_combine = p.get('tankCombine', {})

        def parse_float(val):
            try: return float(str(val).replace('"','').strip())
            except: return None

        def normalize_height(val):
            """Normalize to '6-4' format from '6\'4"', '6-4', or raw inches."""
            if val is None:
                return None
            s = str(val).replace("'", '-').replace('"', '').strip()
            if '-' in s:
                return s  # already feet-inches
            try:
                inches = int(float(s))
                return f'{inches // 12}-{inches % 12}'
            except Exception:
                return s

        new_combine = {
            'height': normalize_height(p.get('heightInches')),
            'weight': p.get('weightLbs'),
            'forty': parse_float(tank_combine.get('40-yard')),
            'vertical': parse_float(tank_combine.get('vertical')),
            'broadJump': parse_float(tank_combine.get('broad')),
            'bench': parse_float(tank_combine.get('bench')),
            'cone': parse_float(tank_combine.get('3-cone')),
            'shuttle': parse_float(tank_combine.get('shuttle')),
            'participated': bool(tank_combine),
        }

        if existing_combine:
            # Merge: prefer existing explicit values, fill gaps from new
            for k in ['height', 'weight', 'forty', 'vertical', 'broadJump', 'bench', 'cone', 'shuttle']:
                if existing_combine.get(k) is None and new_combine.get(k) is not None:
                    existing_combine[k] = new_combine[k]
            if new_combine['participated']:
                existing_combine['participated'] = True
        else:
            existing_combine = new_combine

        merged = {
            'id': prospect_id,
            'name': p['name'],
            'position': p['position'],
            'positionGroup': pos_group,
            'school': p['school'],
            'class': existing_rec.get('class') if existing_rec else None,
            'yearsInCollege': existing_rec.get('yearsInCollege') if existing_rec else None,
            'consensusRank': p['consensusRank'],
            'projectedRound': proj_round,
            'projectedPickRange': pick_range,
            'positionRank': 0,  # filled below
            'espnGrade': p.get('espnGrade'),
            'espnId': p.get('espnId') or (existing_rec.get('espnId') if existing_rec else None),
            'projectedTeam': p.get('projectedTeam') or (existing_rec.get('projectedTeam') if existing_rec else None),
            'projectedPick': p.get('projectedPick') or (existing_rec.get('projectedPick') if existing_rec else None),
            'classYear': p.get('classYear') or (existing_rec.get('classYear') if existing_rec else None),
            'rankBySource': p['rankBySource'],
            'rankHistory': rank_history,
            'collegeStats': existing_rec.get('collegeStats', {}) if existing_rec else {},
            'cbsStats': p.get('cbsStats', {}),
            'tankStats': p.get('tankStats', {}),
            'combineData': existing_combine,
        }
        result.append(merged)

    # Fill position ranks then totals
    pos_counters: dict[str, int] = {}
    for p in result:
        pg = p['positionGroup']
        pos_counters[pg] = pos_counters.get(pg, 0) + 1
        p['positionRank'] = pos_counters[pg]
    for p in result:
        p['positionTotal'] = pos_counters[p['positionGroup']]

    return result


def merge_college_stats(prospects: list[dict], stats_by_name: dict[str, dict]) -> list[dict]:
    for p in prospects:
        name = p['name']
        match = stats_by_name.get(name)
        if not match:
            # Try fuzzy
            matched = fuzzy_match_player(name, [{'name': k} for k in stats_by_name.keys()])
            if matched:
                match = stats_by_name.get(matched['name'])
        if match:
            existing = p.get('collegeStats', {})
            for yr, yr_stats in match.items():
                if yr_stats:
                    # CFBD data takes precedence; merge with existing (e.g. CBS) preserving extras
                    existing[yr] = {**existing.get(yr, {}), **yr_stats}
            p['collegeStats'] = existing
    return prospects


def merge_cbs_stats(prospects: list[dict]) -> list[dict]:
    """Add CBS Sports 2025 season stats when CFBD doesn't have that year."""
    year = str(DRAFT_YEAR - 1)  # "2025"
    for p in prospects:
        if not p.get('cbsStats'):
            continue
        cs = p.get('collegeStats') or {}
        if year not in cs:
            cs[year] = p['cbsStats']
            p['collegeStats'] = cs
    return prospects


def merge_combine_data(prospects: list[dict], combine_by_name: dict[str, dict]) -> list[dict]:
    for p in prospects:
        match = combine_by_name.get(p['name'])
        if not match:
            matched = fuzzy_match_player(p['name'], [{'name': k} for k in combine_by_name.keys()])
            if matched:
                match = combine_by_name.get(matched['name'])
        if match:
            # Merge: official combine values override estimates; existing non-null values preserved
            existing = dict(p.get('combineData') or {})
            for k in ['height', 'weight', 'forty', 'bench', 'vertical', 'broadJump', 'cone', 'shuttle']:
                if match.get(k) is not None:
                    existing[k] = match[k]
            existing['participated'] = True
            p['combineData'] = existing
    return prospects


def merge_actual_picks(prospects: list[dict]) -> list[dict]:
    """After the draft, pull actual picks from nflverse and merge into prospects."""
    import pandas as pd
    try:
        picks_df = pd.read_csv(NFLVERSE_PICKS_URL)
        picks = picks_df[picks_df['season'] == DRAFT_YEAR]
        if picks.empty:
            logger.info(f'{DRAFT_YEAR} draft picks not yet in nflverse — skipping actual pick merge')
            return prospects

        pick_by_name: dict[str, dict] = {}
        for _, row in picks.iterrows():
            name = str(row.get('pfr_player_name', '') or '').strip()
            if name:
                pick_by_name[name.lower()] = {
                    'actualPick':  int(row['pick']),
                    'actualRound': int(row['round']),
                    'actualTeam':  normalize_team_name(str(row.get('team', '') or '').strip()),
                }

        candidates = [{'name': k} for k in pick_by_name]
        merged = 0
        for p in prospects:
            data = pick_by_name.get(p['name'].lower())
            if not data and candidates:
                match = fuzzy_match_player(p['name'], candidates, threshold=88)
                if match:
                    data = pick_by_name.get(match['name'].lower())
            if data:
                p.update(data)
                merged += 1

        logger.info(f'Merged actual {DRAFT_YEAR} draft picks for {merged} prospects')
    except Exception as e:
        logger.warning(f'Actual pick merge failed: {e}')
    return prospects


def build_meta(source_results: dict, prospect_count: int) -> dict:
    sources = {}
    for src, players in source_results.items():
        sources[src] = {
            'status': 'ok' if players else 'failed',
            'count': len(players),
        }
    return {
        'lastUpdated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'prospectCount': prospect_count,
        'draftYear': DRAFT_YEAR,
        'sources': sources,
    }


def main():
    logger.info('=== NFL Draft Pipeline Starting ===')

    # 1. Load existing data
    existing = load_existing()
    logger.info(f'Existing prospects: {len(existing)}')

    # 2. Fetch rankings
    logger.info('Fetching rankings...')
    source_results = {}
    try:
        source_results = fetch_all_rankings()
    except Exception as e:
        logger.error(f'Rankings fetch failed: {e}')
        source_results = {s: [] for s in ['walter_football', 'espn', 'pro_football_network']}

    total_ranked = sum(len(v) for v in source_results.values())
    if total_ranked == 0:
        logger.warning('All ranking sources failed — keeping existing data')
        # Still run news + write meta
        news = []
        try:
            news = fetch_draft_news()
        except Exception as e:
            logger.warning(f'News fetch failed: {e}')
        (DATA_DIR / 'news.json').write_text(json.dumps(news, indent=2))
        meta = build_meta(source_results, len(existing))
        (DATA_DIR / 'meta.json').write_text(json.dumps(meta, indent=2))
        logger.info('Done (no ranking update)')
        return

    # 3. Build and merge
    new_prospects = build_prospect_list(source_results)
    logger.info(f'Unique prospects found: {len(new_prospects)}')

    prospects = merge_with_existing(new_prospects, existing)

    # 4. Fetch college stats
    logger.info('Fetching college stats...')
    try:
        stats = fetch_player_stats(prospects)
        prospects = merge_college_stats(prospects, stats)
    except Exception as e:
        logger.warning(f'College stats failed: {e}')
    # Fill gaps with CBS Sports stats (single-season fallback)
    prospects = merge_cbs_stats(prospects)

    # 5. Fetch combine data
    logger.info('Fetching combine data...')
    try:
        combine = fetch_combine(DRAFT_YEAR)
        prospects = merge_combine_data(prospects, combine)
    except Exception as e:
        logger.warning(f'Combine fetch failed: {e}')

    # 6. Merge actual draft picks once the draft has happened
    if datetime.now(timezone.utc) >= DRAFT_DATE:
        logger.info('Draft has occurred — merging actual picks from nflverse...')
        prospects = merge_actual_picks(prospects)

    # 7. Fetch mock draft (team projections — only relevant pre-draft)
    logger.info('Fetching mock draft picks...')
    try:
        mock_picks = fetch_mock_draft()
        if mock_picks:
            for p in prospects:
                name_lower = p['name'].lower()
                pick_data = mock_picks.get(name_lower)
                if pick_data:
                    # Always set pick number from mock draft
                    p['projectedPick'] = pick_data['pick']
                    # Only override team if none set by a more authoritative source
                    if not p.get('projectedTeam'):
                        p['projectedTeam'] = normalize_team_name(pick_data['team'])
            teams_added = sum(1 for p in prospects if p.get('projectedTeam'))
            logger.info(f'Mock draft: {teams_added} prospects with team projection')
    except Exception as e:
        logger.warning(f'Mock draft fetch failed: {e}')

    # Fetch news
    logger.info('Fetching news...')
    news = []
    try:
        news = fetch_draft_news()
    except Exception as e:
        logger.warning(f'News fetch failed: {e}')

    # 7. Fetch historical comparison data
    logger.info('Fetching historical combine data...')
    historical_percentiles = {}
    historical = {}
    try:
        historical = fetch_historical_by_position(5)
        historical_percentiles = compute_percentiles(historical)
        logger.info(f'Historical: {sum(len(v) for v in historical.values())} players')
    except Exception as e:
        logger.warning(f'Historical fetch failed: {e}')

    # Compute stat importance (correlation with career success)
    logger.info('Computing stat importance...')
    try:
        importance = compute_stat_importance()
        historical_percentiles['importance'] = importance
    except Exception as e:
        logger.warning(f'Stat importance failed: {e}')

    # Compute player comps (most similar historical players by combine metrics)
    logger.info('Computing player comps...')
    try:
        player_comps = compute_player_comps(prospects, historical)
        for p in prospects:
            p['playerComps'] = player_comps.get(p['id'], [])
    except Exception as e:
        logger.warning(f'Player comps failed: {e}')
        for p in prospects:
            if 'playerComps' not in p:
                p['playerComps'] = []

    # 8. Write JSON
    (DATA_DIR / 'prospects.json').write_text(json.dumps(prospects, indent=2))
    (DATA_DIR / 'news.json').write_text(json.dumps(news, indent=2))
    (DATA_DIR / 'historical.json').write_text(json.dumps(historical_percentiles, indent=2))
    meta = build_meta(source_results, len(prospects))
    (DATA_DIR / 'meta.json').write_text(json.dumps(meta, indent=2))

    logger.info(f'=== Done: {len(prospects)} prospects, {len(news)} news items ===')
    logger.info(f'Sources: { {k: len(v) for k, v in source_results.items()} }')

    # 9. Build draft history (prior year classes for browsing)
    logger.info('Building draft history...')
    try:
        from build_draft_history import main as build_history_main
        build_history_main()
    except Exception as e:
        logger.warning(f'Draft history build failed: {e}')


if __name__ == '__main__':
    main()
