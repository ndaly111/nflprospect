"""
Fetch offensive snap counts and games started for OL prospects from nflverse snap_counts CSVs.
Returns ({player_name: {season_str: total_offense_snaps}},
         {player_name: {season_str: games_started}})
Only includes regular-season data for seasons >= the player's draft year.
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
# offense_pct threshold to count a game as "started"
START_PCT_THRESHOLD = 0.5


def fetch_ol_snaps(prospects: list[dict]) -> tuple[dict[str, dict], dict[str, dict]]:
    """
    Fetch season snap totals and games started for OL prospects.

    Each prospect must have: name, positionGroup, _draftYear.
    Returns:
        snaps_result:  {name: {season_str: total_offense_snaps}}
        starts_result: {name: {season_str: games_started}}
    A game counts as "started" when offense_pct >= 0.5.
    """
    ol_prospects = [p for p in prospects if p.get('positionGroup') == 'OL']
    if not ol_prospects:
        return {}, {}

    draft_years = sorted({int(p.get('_draftYear', 2020)) for p in ol_prospects})
    current_year = 2025  # fetch through most recent completed season
    seasons = list(range(min(draft_years), current_year + 1))

    # Build prospect name set for matching
    name_set = {p['name'] for p in ol_prospects}
    name_cands = [{'name': n} for n in name_set]

    snaps_result:  dict[str, dict] = defaultdict(dict)
    starts_result: dict[str, dict] = defaultdict(dict)

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

        # Aggregate to season totals per player: total snaps + games started
        name_col = 'player'
        season_agg = (
            ol_df.groupby(name_col)
            .agg(
                total_snaps=('offense_snaps', 'sum'),
                games_started=('offense_pct', lambda x: (x >= START_PCT_THRESHOLD).sum()),
            )
            .reset_index()
        )
        snap_by_name:   dict[str, int] = {}
        starts_by_name: dict[str, int] = {}
        for _, row in season_agg.iterrows():
            n = str(row[name_col]).strip()
            if n:
                snap_by_name[n]   = int(row['total_snaps'])
                starts_by_name[n] = int(row['games_started'])

        snap_candidates = [{'name': n} for n in snap_by_name]

        matched = 0
        for p in ol_prospects:
            pname = p['name']
            draft_year = int(p.get('_draftYear', 0))
            if season < draft_year:
                continue

            nfl_name = pname
            snaps = snap_by_name.get(pname)
            if snaps is None:
                m = fuzzy_match_player(pname, snap_candidates, threshold=88)
                if m:
                    nfl_name = m['name']
                    snaps = snap_by_name.get(nfl_name)

            if snaps is not None and snaps > 0:
                snaps_result[pname][str(season)]  = snaps
                starts_result[pname][str(season)] = starts_by_name.get(nfl_name, 0)
                matched += 1

        logger.info(f'Snap counts {season}: {matched}/{len(ol_prospects)} OL matched')

    return dict(snaps_result), dict(starts_result)
