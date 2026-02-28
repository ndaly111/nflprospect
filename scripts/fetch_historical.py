"""
Fetch historical NFL draft data from nflverse for position-group comparison.
Returns: {positionGroup: [{year, name, school, pick, round, forty, vertical, ...}]}
"""
import logging
import pandas as pd

logger = logging.getLogger(__name__)

COMBINE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv'
DRAFT_URL = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv'
PLAYER_STATS_OFF_URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv'
PLAYER_STATS_DEF_URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def.csv'

# Map nflverse positions to our position groups
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
}

YEARS_BACK = 5  # compare against last N draft classes


def fetch_historical_by_position(years: int = YEARS_BACK) -> dict[str, list[dict]]:
    """
    Returns dict keyed by positionGroup, each a list of historically drafted players
    with their combine measurements (last `years` draft classes).
    """
    try:
        combine_df = pd.read_csv(COMBINE_URL)
        yr_col = 'draft_year' if 'draft_year' in combine_df.columns else 'year'
        latest_year = int(combine_df[yr_col].max())
        cutoff = latest_year - years + 1
        combine_df = combine_df[combine_df[yr_col] >= cutoff]

        def safe(row, col, typ=float):
            val = row.get(col)
            if val is None or (isinstance(val, float) and pd.isna(val)):
                return None
            try:
                return typ(val)
            except Exception:
                return None

        result: dict[str, list[dict]] = {}

        for _, row in combine_df.iterrows():
            pos = str(row.get('pos', '')).strip().upper()
            group = POS_GROUP_MAP.get(pos)
            if not group:
                continue

            name = str(row.get('player_name', '') or '').strip()
            year = safe(row, yr_col, int)
            pick = safe(row, 'draft_ovr', int)
            rnd = safe(row, 'draft_round', int)

            entry = {
                'name': name,
                'year': year,
                'pick': pick,
                'round': rnd,
                'school': str(row.get('school', '') or '').strip(),
                'forty': safe(row, 'forty'),
                'vertical': safe(row, 'vertical'),
                'broadJump': safe(row, 'broad_jump'),
                'bench': safe(row, 'bench'),
                'cone': safe(row, 'cone'),
                'shuttle': safe(row, 'shuttle'),
                'height': _format_height(safe(row, 'ht', str)),
                'weight': safe(row, 'wt', int),
            }

            result.setdefault(group, []).append(entry)

        logger.info(f'Historical: {sum(len(v) for v in result.values())} players across {len(result)} position groups ({cutoff}-{latest_year})')
        return result

    except Exception as e:
        logger.warning(f'Historical fetch failed: {e}')
        return {}


def compute_percentiles(historical: dict[str, list[dict]]) -> dict:
    """
    Compute sorted metric arrays for combine percentile comparison.
    Returns nested dict: {bucket: {positionGroup: {metric: sorted_values}}}
    where bucket is 'all' or a specific year string ('2024', '2023', etc.)
    """
    metrics = ['forty', 'vertical', 'broadJump', 'bench', 'cone', 'shuttle', 'weight']

    def _compute(players):
        out = {}
        for group, grp_players in players.items():
            out[group] = {}
            for metric in metrics:
                vals = sorted(v[metric] for v in grp_players if v.get(metric) is not None)
                out[group][metric] = vals
        return out

    # Combined (all years)
    result = {'all': _compute(historical)}

    # Per-year buckets
    all_years = set()
    for players in historical.values():
        for p in players:
            if p.get('year'):
                all_years.add(p['year'])

    for year in sorted(all_years):
        year_players: dict[str, list] = {}
        for group, players in historical.items():
            year_players[group] = [p for p in players if p.get('year') == year]
        result[str(year)] = _compute(year_players)

    return result


def compute_stat_importance() -> dict:
    """
    For each position group, compute Spearman correlation between combine metrics
    and career NFL success (receiving/rushing/passing yards for offense, composite
    defensive score for defense). Uses nflverse player_stats.

    Returns {positionGroup: {metric: {importance, correlation, n}}}
    """
    import numpy as np

    def _norm(name):
        """Normalize player name for fuzzy matching."""
        import re
        return re.sub(r'[^a-z ]', '', str(name).lower()).strip()

    def _spearman(x, y):
        """Spearman correlation without scipy — rank then Pearson."""
        x = np.array(x, dtype=float)
        y = np.array(y, dtype=float)
        def rank(arr):
            order = arr.argsort()
            ranks = np.empty_like(order, dtype=float)
            ranks[order] = np.arange(len(arr))
            return ranks
        xr, yr = rank(x), rank(y)
        xc, yc = xr - xr.mean(), yr - yr.mean()
        denom = (xc**2).sum()**0.5 * (yc**2).sum()**0.5
        return float((xc * yc).sum() / denom) if denom > 0 else 0.0

    try:
        # Load combine data — restrict to 2015-2021 draft classes
        # (gives each player at least 3 seasons of career data by 2024)
        combine = pd.read_csv(COMBINE_URL)
        yr_col = 'draft_year' if 'draft_year' in combine.columns else 'year'
        combine = combine[combine[yr_col].between(2015, 2021)].copy()
        combine['pos_group'] = combine['pos'].str.upper().map(POS_GROUP_MAP)
        combine = combine[combine['pos_group'].notna()].copy()
        combine['_norm'] = combine['player_name'].apply(_norm)

        # Load career offensive stats and aggregate
        # player_stats uses truncated 'player_name' (e.g. "T.Brady") but
        # 'player_display_name' has full names that match combine.csv
        off = pd.read_csv(PLAYER_STATS_OFF_URL, low_memory=False)
        if 'season_type' in off.columns:
            off = off[off['season_type'] == 'REG']
        name_col_off = 'player_display_name' if 'player_display_name' in off.columns else 'player_name'
        off_agg = off.groupby(name_col_off, as_index=False).agg({
            'receiving_yards': 'sum',
            'rushing_yards': 'sum',
            'passing_yards': 'sum',
        })
        off_agg['_norm'] = off_agg[name_col_off].apply(_norm)
        off_lookup = {row['_norm']: row.to_dict() for _, row in off_agg.iterrows()}

        # Load career defensive stats and aggregate
        defn = pd.read_csv(PLAYER_STATS_DEF_URL, low_memory=False)
        if 'season_type' in defn.columns:
            defn = defn[defn['season_type'] == 'REG']
        name_col_def = 'player_display_name' if 'player_display_name' in defn.columns else 'player_name'
        defn_agg = defn.groupby(name_col_def, as_index=False).agg({
            'def_sacks': 'sum',
            'def_tackles': 'sum',
            'def_interceptions': 'sum',
            'def_pass_defended': 'sum',
        }).fillna(0)
        defn_agg['_norm'] = defn_agg[name_col_def].apply(_norm)
        # Composite defensive success score
        defn_agg['def_success'] = (
            defn_agg['def_tackles'] +
            8 * defn_agg['def_sacks'] +
            10 * defn_agg['def_interceptions'] +
            3 * defn_agg['def_pass_defended']
        )
        def_lookup = {row['_norm']: row.to_dict() for _, row in defn_agg.iterrows()}

        # Success metric per position group
        def get_success(pos_group, norm_name):
            rec = off_lookup.get(norm_name) or {}
            drec = def_lookup.get(norm_name) or {}
            if pos_group == 'WR': return float(rec.get('receiving_yards') or 0)
            if pos_group == 'TE': return float(rec.get('receiving_yards') or 0)
            if pos_group == 'RB': return float(rec.get('rushing_yards') or 0)
            if pos_group == 'QB': return float(rec.get('passing_yards') or 0)
            if pos_group in ('EDGE', 'DL', 'LB', 'DB'): return float(drec.get('def_success') or 0)
            return None

        COMBINE_METRICS = {
            'forty': 'forty',
            'vertical': 'vertical',
            'broadJump': 'broad_jump',
            'bench': 'bench',
            'cone': 'cone',
            'shuttle': 'shuttle',
            'weight': 'wt',
        }
        LOWER_IS_BETTER = {'forty', 'cone', 'shuttle'}

        result = {}

        for pos_group in ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'EDGE', 'LB', 'DB']:
            pos_df = combine[combine['pos_group'] == pos_group].copy()
            if len(pos_df) < 8:
                continue

            group_result = {}
            for our_key, col in COMBINE_METRICS.items():
                if col not in pos_df.columns:
                    continue

                rows = pos_df[['_norm', col]].dropna(subset=[col])
                if len(rows) < 8:
                    continue

                # For OL: use draft pick (inverted) as success proxy — career stats not tracked
                if pos_group == 'OL':
                    ol_rows = pos_df[['_norm', col, 'draft_ovr']].dropna()
                    if len(ol_rows) < 8:
                        continue
                    metric_vals = ol_rows[col].values
                    success_vals = -ol_rows['draft_ovr'].values  # earlier pick = better
                    n = len(ol_rows)
                else:
                    pairs = []
                    for _, row in rows.iterrows():
                        s = get_success(pos_group, row['_norm'])
                        if s is not None and s > 0:  # exclude players with 0 career stats
                            pairs.append((float(row[col]), s))
                    if len(pairs) < 8:
                        continue
                    metric_vals = [p[0] for p in pairs]
                    success_vals = [p[1] for p in pairs]
                    n = len(pairs)

                r = _spearman(metric_vals, success_vals)

                # Flip sign for lower-is-better metrics so positive r = better
                if our_key in LOWER_IS_BETTER:
                    r = -r

                importance = 'high' if abs(r) >= 0.25 else 'medium' if abs(r) >= 0.12 else 'low'
                group_result[our_key] = {
                    'importance': importance,
                    'correlation': round(r, 3),
                    'n': n,
                }

            if group_result:
                result[pos_group] = group_result

        logger.info(f'Stat importance: computed for {len(result)} position groups')
        return result

    except Exception as e:
        logger.warning(f'Stat importance computation failed: {e}')
        import traceback
        logger.warning(traceback.format_exc())
        return {}


def _format_height(raw) -> str | None:
    if not raw or raw == 'nan':
        return None
    raw = str(raw).strip()
    if '-' in raw:
        return raw
    try:
        inches = int(float(raw))
        return f'{inches // 12}-{inches % 12}'
    except Exception:
        return raw


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    data = fetch_historical_by_position(5)
    for group, players in data.items():
        print(f'{group}: {len(players)} players')
        for p in players[:2]:
            print(f'  {p["year"]} Pick #{p["pick"]} {p["name"]} 40={p["forty"]} vert={p["vertical"]}')
