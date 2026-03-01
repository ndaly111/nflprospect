"""
Compute career value scores, tiers, and class ranks for historical draft picks.

Run standalone:
    python scripts/grade_draft_picks.py

Or imported by build_draft_history.py via grade_all_classes(history).
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Accolade bonuses
# ---------------------------------------------------------------------------
ACCOLADE_BONUS = {
    'allpro1': 100,
    'allpro2': 50,
    'opoy':    80,
    'dpoy':    80,
    'mvp':     150,
    'oroy':    40,
    'droy':    40,
    'cpoy':    30,
    'sbmvp':   80,
}

# ---------------------------------------------------------------------------
# Tier thresholds (percentile within position group)
# ---------------------------------------------------------------------------
TIERS = [
    (90, 'Elite'),
    (60, 'Starter'),
    (30, 'Backup'),
    (0,  'Bust'),
]


def _accolade_bonus(accolades) -> float:
    """Sum accolade bonuses for a prospect's accolades dict."""
    if not accolades:
        return 0.0
    total = 0.0
    for key, bonus in ACCOLADE_BONUS.items():
        val = accolades.get(key, 0) or 0
        # allpro1/allpro2 are counts; others are boolean-ish (0/1)
        if key in ('allpro1', 'allpro2'):
            total += int(val) * bonus
        elif val:
            total += bonus
    return total


def count_qualifying_seasons(prospect, min_games: int = 4) -> int:
    """Count NFL seasons where the prospect played at least min_games games."""
    nfl_stats = prospect.get('nflStats') or {}
    count = 0
    for season_stats in nfl_stats.values():
        if isinstance(season_stats, dict):
            games = season_stats.get('games', 0) or 0
            if games >= min_games:
                count += 1
    return count


def compute_career_value(prospect) -> float:
    """
    Compute raw career value from NFL stats (career totals across qualifying seasons)
    plus accolade bonuses.
    """
    pos_group = prospect.get('positionGroup', '')
    nfl_stats = prospect.get('nflStats') or {}
    accolades = prospect.get('accolades') or {}

    # Accumulate totals across qualifying seasons (games >= 4)
    totals: dict[str, float] = {}
    for season_stats in nfl_stats.values():
        if not isinstance(season_stats, dict):
            continue
        games = season_stats.get('games', 0) or 0
        if games < 4:
            continue
        for k, v in season_stats.items():
            if k == 'games' or v is None:
                continue
            try:
                totals[k] = totals.get(k, 0.0) + float(v)
            except (TypeError, ValueError):
                pass

    def g(key: str) -> float:
        return totals.get(key, 0.0)

    if pos_group == 'QB':
        cv = (g('passing_yards') * 1.0
              + g('passing_tds') * 20
              - g('interceptions') * 20
              + g('rushing_yards') * 0.5
              + g('rushing_tds') * 15)

    elif pos_group == 'RB':
        cv = (g('rushing_yards') * 1.0
              + g('rushing_tds') * 15
              + g('receiving_yards') * 0.8
              + g('receiving_tds') * 15
              + g('receptions') * 0.5)

    elif pos_group == 'WR':
        cv = (g('receiving_yards') * 1.0
              + g('receiving_tds') * 20
              + g('receptions') * 0.5
              + g('rushing_yards') * 0.5)

    elif pos_group == 'TE':
        cv = (g('receiving_yards') * 1.0
              + g('receiving_tds') * 20
              + g('receptions') * 0.5)

    elif pos_group in ('DL', 'EDGE'):
        cv = (g('sacks') * 20
              + g('tackles_for_loss') * 5
              + g('tackles_combined') * 0.5
              + g('qb_hits') * 3)

    elif pos_group == 'LB':
        cv = (g('sacks') * 15
              + g('tackles_for_loss') * 5
              + g('tackles_combined') * 1.0
              + g('interceptions') * 20
              + g('pass_defended') * 8)

    elif pos_group == 'DB':
        cv = (g('interceptions') * 30
              + g('pass_defended') * 8
              + g('tackles_combined') * 0.5)

    else:
        # OL and special teams: stats-only value is 0
        cv = 0.0

    cv += _accolade_bonus(accolades)
    return max(cv, 0.0)


def grade_all_classes(history: dict) -> None:
    """
    Compute draftGrade for every prospect in history (modified in place).

    history: {year_str: [prospect, ...]}

    Each prospect gains:
        draftGrade: {
            tier, score, classRank, classSize, yearsEvaluated, provisional
        }
    or no draftGrade key if no qualifying seasons and no accolades.
    """
    # Step 1: compute _cv (career value) and _q (qualifying seasons) for all prospects
    for year_str, prospects in history.items():
        for p in prospects:
            p['_cv'] = compute_career_value(p)
            p['_q']  = count_qualifying_seasons(p)
            # OL with accolade bonuses should be included in the pool
            p['_acc_bonus'] = _accolade_bonus(p.get('accolades') or {})

    # Step 2: build position-group pools for percentile ranking
    # Pool: prospects with >= 1 qualifying season, or OL with accolade bonus > 0
    pos_pools: dict[str, list] = {}
    for prospects in history.values():
        for p in prospects:
            pos_group = p.get('positionGroup', '')
            if not pos_group:
                continue
            if p['_q'] >= 1 or (pos_group == 'OL' and p['_acc_bonus'] > 0):
                if pos_group not in pos_pools:
                    pos_pools[pos_group] = []
                pos_pools[pos_group].append(p)

    # Step 3: sort each pool by _cv ascending, assign percentile rank
    pos_sorted: dict[str, list] = {}
    for pos_group, pool in pos_pools.items():
        sorted_pool = sorted(pool, key=lambda x: x['_cv'])
        pos_sorted[pos_group] = sorted_pool

    def percentile_rank(prospect, sorted_pool: list) -> float:
        """0–100 percentile within pool (higher = better)."""
        n = len(sorted_pool)
        if n <= 1:
            return 100.0
        cv = prospect['_cv']
        # Count how many in pool have strictly lower cv
        rank_from_bottom = sum(1 for x in sorted_pool if x['_cv'] < cv)
        return round(rank_from_bottom / (n - 1) * 100, 1)

    def tier_from_pct(pct: float) -> str:
        for threshold, tier_name in TIERS:
            if pct >= threshold:
                return tier_name
        return 'Bust'

    # Step 4: compute class rank within each draft year (by raw _cv desc)
    for year_str, prospects in history.items():
        graded = [(p, p['_cv']) for p in prospects
                  if p['_q'] >= 1 or (p.get('positionGroup') == 'OL' and p['_acc_bonus'] > 0)]
        # Sort descending by _cv
        graded_sorted = sorted(graded, key=lambda x: x[1], reverse=True)
        class_size = len(graded_sorted)

        for rank_idx, (p, _) in enumerate(graded_sorted):
            p['_classRank'] = rank_idx + 1
            p['_classSize'] = class_size

    # Step 5: assign draftGrade to each prospect (no cleanup yet — pool members still need _cv)
    for prospects in history.values():
        for p in prospects:
            pos_group = p.get('positionGroup', '')
            q = p['_q']
            acc_bonus = p['_acc_bonus']

            # No grade if no qualifying seasons and no accolades
            if q == 0 and acc_bonus == 0:
                continue

            sorted_pool = pos_sorted.get(pos_group, [])
            if not sorted_pool:
                continue

            pct = percentile_rank(p, sorted_pool)
            tier = tier_from_pct(pct)
            years_evaluated = q
            provisional = years_evaluated < 3
            class_rank = p.get('_classRank')
            class_size = p.get('_classSize', 0)

            p['draftGrade'] = {
                'tier':           tier,
                'score':          pct,
                'classRank':      class_rank,
                'classSize':      class_size,
                'yearsEvaluated': years_evaluated,
                'provisional':    provisional,
            }

    # Step 6: clean up all temp keys in a separate pass
    for prospects in history.values():
        for p in prospects:
            for k in ('_cv', '_q', '_acc_bonus', '_classRank', '_classSize'):
                p.pop(k, None)

    # Log tier distribution
    tier_counts: dict[str, int] = {}
    no_grade = 0
    for prospects in history.values():
        for p in prospects:
            grade = p.get('draftGrade')
            if grade:
                t = grade['tier']
                tier_counts[t] = tier_counts.get(t, 0) + 1
            else:
                no_grade += 1
    logger.info(f'Tier distribution: {tier_counts} | No grade: {no_grade}')


def main():
    data_dir = Path(__file__).parent.parent / 'data'
    history_file = data_dir / 'draft_history.json'

    if not history_file.exists():
        logger.error(f'draft_history.json not found at {history_file}')
        return

    logger.info(f'Loading {history_file} ...')
    with open(history_file) as f:
        history = json.load(f)

    grade_all_classes(history)

    # Print sample validation
    for year_str, prospects in sorted(history.items()):
        graded = [p for p in prospects if 'draftGrade' in p]
        tier_counts: dict[str, int] = {}
        for p in graded:
            t = p['draftGrade']['tier']
            tier_counts[t] = tier_counts.get(t, 0) + 1
        pct_graded = round(len(graded) / len(prospects) * 100) if prospects else 0
        print(f'{year_str}: {len(graded)}/{len(prospects)} graded ({pct_graded}%) — {tier_counts}')

    # Write back
    history_file.write_text(json.dumps(history, indent=2))
    logger.info(f'Wrote graded draft_history.json')

    # Spot-check notable players
    spot_check = [
        ('2020', 'Joe Burrow', 'Elite'),
        ('2020', 'Justin Jefferson', 'Elite'),
        ('2021', 'Micah Parsons', 'Elite'),
        ('2020', 'Jalen Hurts', 'Elite'),
        ('2020', 'Jeff Okudah', None),  # expect Backup or Bust
    ]
    all_prospects = {p['name']: p for yr in history.values() for p in yr}
    print('\nSpot checks:')
    for year_str, name, expected_tier in spot_check:
        year_prospects = history.get(year_str, [])
        p = next((x for x in year_prospects if name.lower() in x['name'].lower()), None)
        if p:
            grade = p.get('draftGrade')
            if grade:
                status = '✓' if (expected_tier is None or grade['tier'] == expected_tier) else '✗'
                print(f'  {status} {name}: {grade["tier"]} (score={grade["score"]}, classRank={grade["classRank"]}/{grade["classSize"]}, provisional={grade["provisional"]})')
            else:
                print(f'  — {name}: no grade')
        else:
            print(f'  ? {name}: not found in {year_str}')


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    main()
