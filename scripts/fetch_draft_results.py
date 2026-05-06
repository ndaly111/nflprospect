"""
Fetch actual NFL Draft results for a given year from nflverse-data and save
a slimmed JSON to data/draft_results/<year>.json. Used by the consensus-accuracy
pipeline to compare pre-draft consensus rankings to where players actually went.

Run standalone:
    python scripts/fetch_draft_results.py 2026
"""
import csv
import io
import json
import logging
import sys
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

NFLVERSE_URL = (
    'https://github.com/nflverse/nflverse-data/releases/download/'
    'draft_picks/draft_picks.csv'
)

DATA_DIR = Path(__file__).parent.parent / 'data' / 'draft_results'


def fetch_draft_results(year: int) -> list[dict]:
    """Pull every pick for `year` from nflverse-data."""
    logger.info(f'Fetching draft picks from {NFLVERSE_URL}')
    with urllib.request.urlopen(NFLVERSE_URL, timeout=60) as resp:
        text = resp.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(text))
    picks = []
    for r in reader:
        if r.get('season') != str(year):
            continue
        try:
            pick_no = int(r['pick'])
            round_no = int(r['round'])
        except (ValueError, KeyError):
            continue
        picks.append({
            'pick': pick_no,
            'round': round_no,
            'team': r.get('team') or '',
            'name': r.get('pfr_player_name') or '',
            'position': r.get('position') or '',
            'side': r.get('side') or '',
            'college': r.get('college') or '',
            'pfrId': r.get('pfr_player_id') or '',
            'gsisId': r.get('gsis_id') or '',
        })
    picks.sort(key=lambda p: p['pick'])
    return picks


def save(year: int, picks: list[dict]) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / f'{year}.json'
    out_path.write_text(json.dumps(picks, indent=2))
    return out_path


def main():
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    picks = fetch_draft_results(year)
    if not picks:
        logger.error(f'No picks found for season {year}')
        sys.exit(1)
    out = save(year, picks)
    logger.info(f'Wrote {len(picks)} picks to {out}')


if __name__ == '__main__':
    main()
