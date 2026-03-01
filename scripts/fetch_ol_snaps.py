"""
Fetch offensive snap counts for OL prospects from nflverse snap_counts CSVs.
Returns {player_name: {season_str: total_offense_snaps}}
Only includes regular-season snaps for seasons >= the player's draft year.
"""
import logging
from collections import defaultdict

import pandas as pd

from utils import fuzzy_match_player

logger = logging.getLogger(__name__)

SNAP_URL_TEMPLATE = (
    'https://github.com/nflverse/nflverse-data/releases/download/'
    'snap_counts/snap_counts_{year}.csv'
)

OL_POSITIONS = {'T', 'G', 'C', 'OT', 'OG', 'OL', 'IOL'}

# Minimum snaps in a season to count as a qualifying season
MIN_QUALIFYING_SNAPS = 200


def fetch_ol_snaps(prospects: list[dict]) -> dict[str, dict]:
    """
    Fetch season snap totals for OL prospects.

    Each prospect must have: name, positionGroup, _draftYear.
    Returns {name: {season_str: total_offense_snaps}}
    """
    ol_prospects = [p for p in prospects if p.get('positionGroup') == 'OL']
    if not ol_prospects:
        return {}

    draft_years = sorted({int(p.get('_draftYear', 2020)) for p in ol_prospects})
    current_year = 2025  # fetch through most recent completed season
    seasons = list(range(min(draft_years), current_year + 1))

    # Build prospect name set for matching
    name_set = {p['name'] for p in ol_prospects}
    name_cands = [{'name': n} for n in name_set]

    result: dict[str, dict] = defaultdict(dict)

    for season in seasons:
        url = SNAP_URL_TEMPLATE.format(year=season)
        try:
            df = pd.read_csv(url, low_memory=False)
        except Exception as e:
            logger.warning(f'Snap counts {season}: fetch failed — {e}')
            continue

        # Filter to regular season OL only
        if 'game_type' in df.columns:
            df = df[df['game_type'] == 'REG']
        ol_df = df[df['position'].isin(OL_POSITIONS)].copy()
        if ol_df.empty:
            continue

        # Aggregate to season total per player
        name_col = 'player'
        season_totals = (
            ol_df.groupby(name_col)['offense_snaps']
            .sum()
            .reset_index()
        )
        snap_by_name: dict[str, int] = {
            str(row[name_col]).strip(): int(row['offense_snaps'])
            for _, row in season_totals.iterrows()
            if str(row[name_col]).strip()
        }
        snap_candidates = [{'name': n} for n in snap_by_name]

        matched = 0
        for p in ol_prospects:
            pname = p['name']
            draft_year = int(p.get('_draftYear', 0))
            if season < draft_year:
                continue

            snaps = snap_by_name.get(pname)
            if snaps is None:
                m = fuzzy_match_player(pname, snap_candidates, threshold=88)
                if m:
                    snaps = snap_by_name.get(m['name'])

            if snaps is not None and snaps > 0:
                result[pname][str(season)] = snaps
                matched += 1

        logger.info(f'Snap counts {season}: {matched}/{len(ol_prospects)} OL matched')

    return dict(result)
