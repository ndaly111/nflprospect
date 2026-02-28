"""
Fetch historical NFL draft data from nflverse for position-group comparison.
Returns: {positionGroup: [{year, name, school, pick, round, forty, vertical, ...}]}
"""
import logging
import pandas as pd

logger = logging.getLogger(__name__)

COMBINE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv'
DRAFT_URL = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv'

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
