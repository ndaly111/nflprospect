"""
Fetch NFL Combine measurements from nflverse-data GitHub releases.
Returns dict keyed by player name (normalized): {height, weight, forty, bench, vertical, broadJump, cone, shuttle}
"""
import logging
import pandas as pd

logger = logging.getLogger(__name__)

COMBINE_URL = (
    'https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv'
)


def fetch_combine(draft_year: int = 2026) -> dict[str, dict]:
    """Return combine data dict keyed by full name."""
    try:
        df = pd.read_csv(COMBINE_URL)
        # Filter to current draft year
        if 'draft_year' in df.columns:
            df = df[df['draft_year'] == draft_year]
        elif 'year' in df.columns:
            df = df[df['year'] == draft_year]

        result = {}
        for _, row in df.iterrows():
            name = str(row.get('player_name') or row.get('name', '')).strip()
            if not name:
                continue

            def safe(col, default=None):
                val = row.get(col)
                if pd.isna(val):
                    return default
                return val

            result[name] = {
                'height': _format_height(safe('ht')),
                'weight': safe('wt'),
                'forty': safe('forty'),
                'bench': safe('bench'),
                'vertical': safe('vertical'),
                'broadJump': safe('broad_jump'),
                'cone': safe('cone'),
                'shuttle': safe('shuttle'),
                'participated': True,
            }

        logger.info(f'Combine data: {len(result)} players for {draft_year}')
        return result
    except Exception as e:
        logger.warning(f'Combine fetch failed: {e}')
        return {}


def _format_height(raw) -> str | None:
    """Convert height like '6-1' or 73 (inches) to '6-1' format."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    raw = str(raw).strip()
    if '-' in raw:
        return raw
    try:
        inches = int(float(raw))
        feet = inches // 12
        rem = inches % 12
        return f'{feet}-{rem}'
    except Exception:
        return raw


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    data = fetch_combine(2026)
    print(f'Total: {len(data)} players')
    for name, stats in list(data.items())[:3]:
        print(f'  {name}: {stats}')
