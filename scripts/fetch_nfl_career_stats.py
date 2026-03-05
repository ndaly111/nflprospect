"""
Fetch NFL career stats (season-by-season) from nflverse free CSVs.
Returns {player_name: {season_str: {stat_key: value, "team": str}}}
Only includes regular-season stats for seasons after the player's draft year.
"""
import logging
from collections import defaultdict

import pandas as pd

from utils import fuzzy_match_player

logger = logging.getLogger(__name__)

# Nickname → legal name mappings for players whose nflverse name differs from
# the commonly used name in draft records / ESPN / PFR.
PLAYER_NAME_ALIASES: dict[str, str] = {
    'Sauce Gardner': 'Ahmad Gardner',
}

OFFENSE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_season.csv'
DEFENSE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def_season.csv'

OFFENSE_GROUPS = {'QB', 'RB', 'WR', 'TE', 'OL'}
DEFENSE_GROUPS = {'DL', 'EDGE', 'LB', 'DB'}

# Columns to extract per position group (offense CSV)
OFFENSE_STAT_COLS = {
    'QB':  ['completions', 'attempts', 'passing_yards', 'passing_tds', 'interceptions',
            'carries', 'rushing_yards', 'rushing_tds', 'sacks'],
    'RB':  ['carries', 'rushing_yards', 'rushing_tds', 'receptions', 'targets',
            'receiving_yards', 'receiving_tds'],
    'WR':  ['receptions', 'targets', 'receiving_yards', 'receiving_tds', 'carries', 'rushing_yards'],
    'TE':  ['receptions', 'targets', 'receiving_yards', 'receiving_tds'],
    'OL':  [],
}

# Columns to extract per position group (defense CSV, after stripping def_ prefix)
DEFENSE_STAT_COLS = {
    'DL':   ['tackles_combined', 'sacks', 'tackles_for_loss', 'qb_hits'],
    'EDGE': ['tackles_combined', 'sacks', 'tackles_for_loss', 'qb_hits'],
    'LB':   ['tackles_combined', 'sacks', 'tackles_for_loss', 'interceptions', 'pass_defended'],
    'DB':   ['tackles_combined', 'interceptions', 'pass_defended'],
}


def _fmt_val(val):
    """Return int if whole number, 1-decimal float otherwise, None if missing."""
    try:
        f = float(val)
        if pd.isna(f):
            return None
        return int(f) if f == int(f) else round(f, 1)
    except (TypeError, ValueError):
        return None


def _build_name_index(df, name_col):
    """Return {player_name: [row, ...]} for fast lookup."""
    idx = defaultdict(list)
    for _, row in df.iterrows():
        name = str(row.get(name_col, '') or '').strip()
        if name:
            idx[name].append(row)
    return idx


def _extract_row_stats(row, stat_cols):
    """Extract games + stat_cols + team from a dataframe row."""
    stats = {}
    gp = _fmt_val(row.get('games'))
    if gp is not None:
        stats['games'] = gp
    for col in stat_cols:
        val = _fmt_val(row.get(col))
        if val is not None:
            stats[col] = val
    team = str(row.get('recent_team', '') or '').strip()
    if team:
        stats['team'] = team
    return stats


def _process_group(prospects, df, stat_cols_map):
    """
    Match each prospect against df by name, extract per-season stats.
    Returns {name: {season_str: stats}}
    """
    result = defaultdict(dict)
    if df is None or df.empty:
        return result

    name_col = 'player_display_name' if 'player_display_name' in df.columns else 'player_name'
    name_index = _build_name_index(df, name_col)
    name_candidates = [{'name': k} for k in name_index]

    for p in prospects:
        name = p.get('name', '').strip()
        lookup_name = PLAYER_NAME_ALIASES.get(name, name)
        pos_group = p.get('positionGroup', '')
        draft_year = int(p.get('_draftYear', 0))
        stat_cols = stat_cols_map.get(pos_group, [])

        # Exact match (using alias if available) → fuzzy fallback
        rows = name_index.get(lookup_name)
        if rows is None and name_candidates:
            match = fuzzy_match_player(lookup_name, name_candidates, threshold=88)
            if match:
                rows = name_index.get(match['name'])
        if not rows:
            continue

        # Expected CSV position values for this position group (to avoid name collisions
        # like QB "Alex Smith" being overwritten by TE "Alex Smith" in the same CSV).
        POS_GROUP_POSITIONS = {
            'QB': {'QB'},
            'RB': {'RB', 'HB', 'FB'},
            'WR': {'WR'},
            'TE': {'TE'},
        }
        expected_positions = POS_GROUP_POSITIONS.get(pos_group)

        for row in rows:
            # Skip rows whose position doesn't match the prospect's group (name collision).
            if expected_positions:
                row_pos = str(row.get('position', '') or '').strip().upper()
                if row_pos and row_pos not in expected_positions:
                    continue
            season = _fmt_val(row.get('season'))
            if season is None:
                continue
            season = int(season)
            if season < draft_year:
                continue
            stats = _extract_row_stats(row, stat_cols)
            if stats:
                # Key by name + pos_group to avoid collisions when two draftees share
                # a name but play different positions (e.g. QB "Alex Smith" 2005 and
                # TE "Alex Smith" 2005 — both in the same all_flat list).
                result[f'{name}__{pos_group}'][str(season)] = stats

    return result


def fetch_nfl_career_stats(prospects: list[dict]) -> dict[str, dict]:
    """
    Fetch NFL career stats for a list of prospects.
    Each prospect must have: name, positionGroup, _draftYear.
    Returns {name: {season_str: {stat_key: value, "team": str}}}
    """
    if not prospects:
        return {}

    result: dict[str, dict] = defaultdict(dict)

    # --- Offense ---
    offense_prospects = [p for p in prospects if p.get('positionGroup') in OFFENSE_GROUPS]
    if offense_prospects:
        logger.info('Fetching nflverse player_stats_season.csv (offense)...')
        try:
            off_df = pd.read_csv(OFFENSE_URL, low_memory=False)
            off_df = off_df[off_df['season_type'] == 'REG'].copy()
            off_result = _process_group(offense_prospects, off_df, OFFENSE_STAT_COLS)
            for name, seasons in off_result.items():
                result[name].update(seasons)
            logger.info(f'Offense stats: {len(off_result)} players found')
        except Exception as e:
            logger.warning(f'Offense stats fetch failed: {e}')

    # --- Defense ---
    defense_prospects = [p for p in prospects if p.get('positionGroup') in DEFENSE_GROUPS]
    if defense_prospects:
        logger.info('Fetching nflverse player_stats_def_season.csv (defense)...')
        try:
            def_df = pd.read_csv(DEFENSE_URL, low_memory=False)
            def_df = def_df[def_df['season_type'] == 'REG'].copy()

            # Strip def_ prefix from stat columns; keep meta columns unchanged
            rename = {c: c[4:] for c in def_df.columns if c.startswith('def_')}
            def_df.rename(columns=rename, inplace=True)

            # Ensure tackles_combined exists (nflverse uses 'tackles' for total)
            if 'tackles_combined' not in def_df.columns and 'tackles' in def_df.columns:
                def_df['tackles_combined'] = def_df['tackles']

            def_result = _process_group(defense_prospects, def_df, DEFENSE_STAT_COLS)
            for name, seasons in def_result.items():
                result[name].update(seasons)
            logger.info(f'Defense stats: {len(def_result)} players found')
        except Exception as e:
            logger.warning(f'Defense stats fetch failed: {e}')

    total = len(result)
    logger.info(f'NFL career stats: found data for {total} prospects')
    # Also expose plain-name keys as fallback (for callers that don't pass pos_group)
    out = dict(result)
    for key, stats in result.items():
        if '__' in key:
            name_only = key.split('__')[0]
            if name_only not in out:
                out[name_only] = stats
    return out


if __name__ == '__main__':
    import sys
    import logging as _logging
    sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
    _logging.basicConfig(level=_logging.INFO, format='%(levelname)s: %(message)s')
    test = [
        {'name': 'Joe Burrow',        'positionGroup': 'QB',   '_draftYear': 2020},
        {'name': 'Justin Jefferson',  'positionGroup': 'WR',   '_draftYear': 2020},
        {'name': 'Chase Young',       'positionGroup': 'EDGE', '_draftYear': 2020},
        {'name': 'Isaiah Simmons',    'positionGroup': 'LB',   '_draftYear': 2020},
    ]
    data = fetch_nfl_career_stats(test)
    for pname, seasons in data.items():
        print(f'\n{pname}:')
        for yr, stats in sorted(seasons.items()):
            print(f'  {yr}: {stats}')
