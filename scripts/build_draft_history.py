"""
Build historical NFL Draft class data from nflverse CSVs.
Joins draft_picks.csv (actual picks) with combine.csv (measurements),
and fetches college stats from CFBD for each draft class.
Writes data/draft_history.json as {year_str: [prospect, ...]}
"""
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from utils import fuzzy_match_player, make_id, normalize_name
from fetch_college_stats import fetch_player_stats

logger = logging.getLogger(__name__)

DRAFT_PICKS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv'
COMBINE_URL     = 'https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv'

# NFL Draft is held in late April; include the current year once the draft has passed.
# This auto-advances each year without manual code changes.
_now = datetime.now(timezone.utc)
_current_year = _now.year
_draft_month_day = (_now.month, _now.day)
_draft_passed = _draft_month_day >= (4, 25)  # draft ends ~April 25 each year

# History starts 2020; include this year only after the draft
_last_completed = _current_year if _draft_passed else _current_year - 1
YEARS = list(range(2020, _last_completed + 1))

POS_GROUP_MAP = {
    'QB': 'QB',
    'RB': 'RB', 'FB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'OT': 'OL', 'OG': 'OL', 'C': 'OL', 'IOL': 'OL', 'OL': 'OL',
    'DT': 'DL', 'NT': 'DL', 'DL': 'DL',
    'DE': 'EDGE', 'EDGE': 'EDGE', 'OLB': 'EDGE',
    'ILB': 'LB', 'MLB': 'LB', 'LB': 'LB',
    'CB': 'DB', 'S': 'DB', 'FS': 'DB', 'SS': 'DB', 'DB': 'DB',
    'K': 'K', 'P': 'P', 'LS': 'LS',
}


def _fmt_height(raw) -> str | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    s = str(raw).strip()
    if '-' in s:
        return s
    try:
        inches = int(float(s))
        return f'{inches // 12}-{inches % 12}'
    except Exception:
        return s


def _safe(row, col, typ=float):
    val = row.get(col)
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return typ(val)
    except Exception:
        return None


def build_draft_history() -> dict[str, list[dict]]:
    logger.info('Fetching nflverse draft_picks.csv ...')
    picks_df = pd.read_csv(DRAFT_PICKS_URL)

    logger.info('Fetching nflverse combine.csv ...')
    combine_df = pd.read_csv(COMBINE_URL)

    # Normalise column names
    yr_col = 'draft_year' if 'draft_year' in combine_df.columns else 'year'
    picks_yr_col = 'season'  # draft_picks uses 'season'

    result: dict[str, list[dict]] = {}

    for year in YEARS:
        picks = picks_df[picks_df[picks_yr_col] == year].copy()
        combine = combine_df[combine_df[yr_col] == year].copy()

        if picks.empty:
            logger.warning(f'{year}: no draft picks found')
            continue

        # Build combine lookup: name → row (use fuzzy later for join)
        combine_by_name = {}
        for _, row in combine.iterrows():
            name = str(row.get('player_name', '') or '').strip()
            if name:
                combine_by_name[name] = row

        combine_candidates = [{'name': k} for k in combine_by_name]

        prospects = []
        for _, row in picks.iterrows():
            name = str(row.get('pfr_player_name', '') or '').strip()
            if not name:
                continue

            pos = str(row.get('position', '') or '').strip().upper()
            pos_group = POS_GROUP_MAP.get(pos, None)
            school = str(row.get('college', '') or '').strip()
            team = str(row.get('team', '') or '').strip()
            rnd = _safe(row, 'round', int)
            pick = _safe(row, 'pick', int)

            if not rnd or not pick:
                continue

            # Combine join
            combine_data = {}
            c_row = combine_by_name.get(name)
            if c_row is None and combine_candidates:
                match = fuzzy_match_player(name, combine_candidates, threshold=88)
                if match:
                    c_row = combine_by_name.get(match['name'])
            if c_row is not None:
                combine_data = {
                    'height':    _fmt_height(_safe(c_row, 'ht', str)),
                    'weight':    _safe(c_row, 'wt', int),
                    'forty':     _safe(c_row, 'forty'),
                    'bench':     _safe(c_row, 'bench'),
                    'vertical':  _safe(c_row, 'vertical'),
                    'broadJump': _safe(c_row, 'broad_jump'),
                    'cone':      _safe(c_row, 'cone'),
                    'shuttle':   _safe(c_row, 'shuttle'),
                    'participated': True,
                }

            prospect_id = make_id(name, pos, school)
            prospects.append({
                'id':            prospect_id,
                'name':          name,
                'position':      pos,
                'positionGroup': pos_group or 'DB',
                'school':        school,
                'actualRound':   rnd,
                'actualPick':    pick,
                'actualTeam':    team,
                'combineData':   combine_data or None,
            })

        prospects.sort(key=lambda p: p['actualPick'])
        result[str(year)] = prospects
        logger.info(f'{year}: {len(prospects)} picks, {sum(1 for p in prospects if p["combineData"])} with combine data')

    # Fetch college stats for all draft classes
    # Each draft class year Y uses the 3 seasons before the draft: Y-1, Y-2, Y-3
    logger.info('Fetching college stats for historical classes...')
    try:
        # Collect all unique stat years needed across all draft classes
        stat_years = sorted(
            {year - offset for year in YEARS for offset in (1, 2, 3)},
            reverse=True,
        )
        # Collect all prospects from all years (fetch_player_stats handles all at once)
        all_prospects = [p for year_prospects in result.values() for p in year_prospects]
        stats = fetch_player_stats(all_prospects, years=stat_years)

        # Distribute stats back to each year's prospects (only include relevant seasons)
        for year_str, year_prospects in result.items():
            year = int(year_str)
            relevant = {str(year - o) for o in (1, 2, 3)}
            with_stats = 0
            for p in year_prospects:
                p_stats = stats.get(p['name'], {})
                filtered = {yr: s for yr, s in p_stats.items() if yr in relevant}
                if filtered:
                    p['collegeStats'] = filtered
                    with_stats += 1
            logger.info(f'{year_str}: {with_stats} prospects with college stats')
    except Exception as e:
        logger.warning(f'College stats fetch failed: {e}')

    return result


def main():
    data_dir = Path(__file__).parent.parent / 'data'
    data_dir.mkdir(exist_ok=True)
    history = build_draft_history()
    out = data_dir / 'draft_history.json'
    out.write_text(json.dumps(history, indent=2))
    total = sum(len(v) for v in history.values())
    logger.info(f'Wrote {total} historical picks across {len(history)} years → {out}')


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    main()
