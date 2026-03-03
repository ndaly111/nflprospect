"""
Compute career value scores, tiers, and class ranks for historical draft picks.

Run standalone:
    python scripts/grade_draft_picks.py

Or imported by build_draft_history.py via grade_all_classes(history).
"""
import json
import logging
from datetime import datetime as _dt
from pathlib import Path

logger = logging.getLogger(__name__)

# Most recent completed NFL season (season ends in Feb; new season starts Sep).
# Jan–Jul → previous year is the last completed season.
_now_utc = _dt.utcnow()
CURRENT_NFL_SEASON: int = _now_utc.year - 1 if _now_utc.month < 8 else _now_utc.year

# ---------------------------------------------------------------------------
# Accolade bonuses
# ---------------------------------------------------------------------------
ACCOLADE_BONUS = {
    'allpro1':    100,
    'allpro2':     50,
    'allpro1_st':  60,  # special-teams AP1 — meaningful but lower than skill-pos
    'allpro2_st':  30,  # special-teams AP2
    'opoy':        80,
    'dpoy':        80,
    'mvp':        150,
    'oroy':        40,
    'droy':        40,
    'cpoy':        30,
    'sbmvp':       80,
}

# ---------------------------------------------------------------------------
# Tier thresholds (percentile within position group)
#
# Elite requires at least one accolade — no pure statistical dominance path,
# because thin position pools (e.g. RB 2020-2025) let volume accumulators
# rank in the 95th+ pct without being genuinely elite.
#
# Accolades are split by weight:
#   STRONG (AP1/AP2, OPOY/DPOY, MVP, SBMVP, CPOY) — annual sustained excellence
#   WEAK   (OROY/DROY) — one-time rookie award; needs a higher pct bar
# ---------------------------------------------------------------------------
ELITE_STRONG_PCT = 88   # strong accolade + 88th pct → Elite
ELITE_WEAK_PCT   = 95   # weak (rookie) accolade alone needs near-top pct → Elite

STRONG_ACCOLADES = frozenset({'allpro1', 'allpro2', 'allpro1_st', 'allpro2_st', 'opoy', 'dpoy', 'sbmvp', 'mvp', 'cpoy'})
WEAK_ACCOLADES   = frozenset({'oroy', 'droy'})

# Keep QUALITY_ACCOLADES for the _has_quality_accolade helper (union of both sets)
QUALITY_ACCOLADES = STRONG_ACCOLADES | WEAK_ACCOLADES

# Skill-position strong accolades (AP1/AP2/major awards) confirm genuine NFL
# production even when nflStats are missing/incomplete (e.g. name-matching gaps).
# These bypass the MIN_CAREER_CV gate. Special-teams accolades (allpro1_st,
# allpro2_st) are excluded since they can co-exist with near-zero skill production.
SKILL_STRONG_ACCOLADES = frozenset({'allpro1', 'allpro2', 'opoy', 'dpoy', 'mvp', 'sbmvp', 'cpoy'})

STARTER_PCT = 60
BACKUP_PCT  = 30


def _has_quality_accolade(accolades) -> bool:
    """Return True if the player has at least one award-recognition accolade."""
    if not accolades:
        return False
    return any(accolades.get(k) for k in QUALITY_ACCOLADES)


def _accolade_bonus(accolades) -> float:
    """Sum accolade bonuses for a prospect's accolades dict."""
    if not accolades:
        return 0.0
    total = 0.0
    for key, bonus in ACCOLADE_BONUS.items():
        val = accolades.get(key, 0) or 0
        # allpro1/allpro2 are counts; others are boolean-ish (0/1)
        if key in ('allpro1', 'allpro2', 'allpro1_st', 'allpro2_st'):
            total += int(val) * bonus
        elif val:
            total += bonus
    return total


MIN_OL_SNAPS  = 500  # snaps per season to count as qualifying for OL (~8+ meaningful games)
MIN_OL_STARTS = 8    # games started per season (alternative qualifying threshold for OL)

# Minimum total career CV (unfiltered — all seasons, no games-played gate) required
# to be graded above Bust after 3+ seasons elapsed. Prevents special-teams accolades
# or one-off awards from masking near-zero skill-position production.
MIN_CAREER_CV: dict[str, float] = {
    'QB':   5000,
    'RB':    500,
    'WR':    500,
    'TE':    300,
    'EDGE':  150,
    'DL':     80,
    'LB':    120,
    'DB':    150,
}

# OL Elite gate: must have >= OL_ELITE_AP_TOTAL AP selections (1st+2nd combined)
# OR >= OL_ELITE_PROBOWL Pro Bowl selections
OL_ELITE_AP_TOTAL = 2
OL_ELITE_PROBOWL  = 2


def count_qualifying_seasons(prospect, min_games: int = 4) -> int:
    """Count NFL seasons where the prospect played meaningfully.

    For OL: seasons with >= MIN_OL_SNAPS offensive snaps OR >= MIN_OL_STARTS games started.
    For all others: seasons with >= min_games games played.
    """
    pos_group = prospect.get('positionGroup', '')
    if pos_group == 'OL':
        ol_snaps  = prospect.get('olSnaps')  or {}
        ol_starts = prospect.get('olStarts') or {}
        all_seasons = set(ol_snaps) | set(ol_starts)
        return sum(
            1 for s in all_seasons
            if (isinstance(ol_snaps.get(s),  (int, float)) and (ol_snaps.get(s)  or 0) >= MIN_OL_SNAPS)
            or (isinstance(ol_starts.get(s), (int, float)) and (ol_starts.get(s) or 0) >= MIN_OL_STARTS)
        )
    nfl_stats = prospect.get('nflStats') or {}
    count = 0
    for season_stats in nfl_stats.values():
        if isinstance(season_stats, dict):
            games = season_stats.get('games', 0) or 0
            if games >= min_games:
                count += 1
    return count


def compute_career_value(prospect, min_games: int = 4) -> float:
    """
    Compute raw career value from NFL stats (career totals across qualifying seasons)
    plus accolade bonuses.

    min_games: seasons with fewer games than this are excluded. Pass 0 to include
    all seasons regardless of games played (used for the career production floor).
    """
    pos_group = prospect.get('positionGroup', '')
    nfl_stats = prospect.get('nflStats') or {}
    accolades = prospect.get('accolades') or {}

    # Accumulate totals across qualifying seasons
    totals: dict[str, float] = {}
    for season_stats in nfl_stats.values():
        if not isinstance(season_stats, dict):
            continue
        games = season_stats.get('games', 0) or 0
        if games < min_games:
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
              + g('rushing_tds') * 15
              + g('attempts') * 0.5)   # rewards starters vs backups (~+275/season for starter)

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

    elif pos_group == 'OL':
        # Career value = qualifying-season snaps × 0.1 + qualifying-season starts × 3
        # A full-time starter (~1100 snaps, ~17 starts) earns ~110 + 51 = ~161 pts/season.
        # Qualifying season: >= MIN_OL_SNAPS snaps OR >= MIN_OL_STARTS games started.
        ol_snaps  = prospect.get('olSnaps')  or {}
        ol_starts = prospect.get('olStarts') or {}
        all_seasons = set(ol_snaps) | set(ol_starts)
        total_snaps  = 0
        total_starts = 0
        for s in all_seasons:
            snaps  = ol_snaps.get(s,  0) or 0
            starts = ol_starts.get(s, 0) or 0
            if snaps >= MIN_OL_SNAPS or starts >= MIN_OL_STARTS:
                total_snaps  += snaps
                total_starts += starts
        cv = total_snaps * 0.1 + total_starts * 3

    else:
        # Special teams (K, P, LS): no meaningful stats
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
    # Step 0: clear any pre-existing draftGrade fields so re-runs are idempotent
    for prospects in history.values():
        for p in prospects:
            p.pop('draftGrade', None)

    # Step 0b: sanitize corrupted OL snap/start data.
    # When two players share a name (e.g. two "Connor McGovern"s), the snap-count
    # database sums their seasonal totals together, producing impossible values
    # (>17 starts in a 17-game season).  Clear corrupted seasons so we don't
    # grade either player on combined data.
    for prospects in history.values():
        for p in prospects:
            if p.get('positionGroup') != 'OL':
                continue
            ol_starts = p.get('olStarts') or {}
            ol_snaps  = p.get('olSnaps')  or {}
            bad = {s for s in ol_starts if (ol_starts.get(s) or 0) > 17}
            if bad:
                for s in bad:
                    ol_starts.pop(s, None)
                    ol_snaps.pop(s, None)

    # Step 1: compute _cv (career value) and _q (qualifying seasons) for all prospects
    for year_str, prospects in history.items():
        for p in prospects:
            p['_cv']      = compute_career_value(p)
            p['_raw_cv']  = compute_career_value(p, min_games=0)  # unfiltered — all seasons
            p['_q']       = count_qualifying_seasons(p)
            p['_acc_bonus'] = _accolade_bonus(p.get('accolades') or {})

    # Step 2: build position-group pools for percentile ranking.
    # Pool mirrors the grade gate so ungraded players don't distort percentiles:
    #   - 2+ qualifying seasons (mature career sample), OR
    #   - 1 qualifying season + a strong accolade (AP1/AP2/OPOY/DPOY/MVP/etc.), OR
    #   - OL with any accolade bonus (snap-based; accolade-only elite OL included)
    pos_pools: dict[str, list] = {}
    for prospects in history.values():
        for p in prospects:
            pos_group = p.get('positionGroup', '')
            if not pos_group:
                continue
            has_strong_acc = any(
                (p.get('accolades') or {}).get(k) for k in STRONG_ACCOLADES
            )
            in_pool = (
                p['_q'] >= 2
                or (has_strong_acc and p['_q'] >= 1)
                or (pos_group == 'OL' and p['_acc_bonus'] > 0)
            )
            if in_pool:
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
        rank_from_bottom = sum(1 for x in sorted_pool if x['_cv'] < cv)
        return round(rank_from_bottom / (n - 1) * 100, 1)

    def tier_from_pct(pct: float, accolades: dict, pos_group: str = '', q: int = 0) -> str:
        # OL and TE have thin draft-class pools, so Elite requires multiple sustained
        # recognition (not just a single AP or Pro Bowl selection).
        if pos_group in ('OL', 'TE'):
            ap_total = (accolades.get('allpro1') or 0) + (accolades.get('allpro2') or 0)
            probowl  = accolades.get('probowl') or 0
            has_multi = ap_total >= OL_ELITE_AP_TOTAL or probowl >= OL_ELITE_PROBOWL
            if pct >= ELITE_STRONG_PCT and has_multi:
                return 'Elite'
        else:
            has_strong = any(accolades.get(k) for k in STRONG_ACCOLADES)
            has_weak   = any(accolades.get(k) for k in WEAK_ACCOLADES)
            if pct >= ELITE_STRONG_PCT and has_strong:
                return 'Elite'
            if pct >= ELITE_WEAK_PCT and has_weak and not has_strong:
                return 'Elite'
        if pct >= STARTER_PCT:
            return 'Starter'
        # Strong accolade floor: AP1/AP2/OPOY/DPOY/MVP guarantees at least Starter.
        # Prevents AP2 rookies with only 1 season of stats from showing as Backup
        # when compared against players with 4-5 full seasons.
        # For OL: require q >= 2 — accolades can be misattributed from same-name players
        # at different positions (e.g. CB "Kyle Fuller" → OL "Kyle Fuller"), so we only
        # trust the floor for OL who have proven themselves across multiple seasons.
        apply_floor = (pos_group != 'OL') or (q >= 2)
        if apply_floor and any(accolades.get(k) for k in STRONG_ACCOLADES):
            return 'Starter'
        if pct >= BACKUP_PCT:
            return 'Backup'
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
    for year_str, prospects in history.items():
        draft_year = int(year_str)
        seasons_elapsed = CURRENT_NFL_SEASON - draft_year

        for p in prospects:
            pos_group = p.get('positionGroup', '')
            q = p['_q']
            acc_bonus = p['_acc_bonus']
            accolades = p.get('accolades') or {}
            has_strong = any(accolades.get(k) for k in STRONG_ACCOLADES)

            # Accolade credibility: if a player has NFL game records but very little
            # production relative to their alleged accolades, those accolades are likely
            # misattributed via name collisions in the Wikipedia All-Pro/Pro Bowl scraper
            # (e.g. a 2022 R5 DT named "Eric Johnson" inheriting selections from a
            # veteran with the same name).
            # Players with 0 tracked games are exempt — their stats may simply not have
            # been pulled due to nflverse name-matching gaps (e.g. Jessie Bates III).
            # OL are always exempt: they use snap-based grading, not nflStats.
            _total_career_games = sum(
                (s.get('games') or 0) for s in (p.get('nflStats') or {}).values()
                if isinstance(s, dict)
            )
            _MIN_ACCOLADE_PROD = {
                'QB':  1000, 'RB': 200, 'WR': 200, 'TE': 100,
                'EDGE':  50, 'DL':  50, 'LB':  70, 'DB':  60,
            }
            _prod_cv = p['_cv'] - acc_bonus
            _accolade_credible = (
                pos_group == 'OL'
                or _total_career_games == 0
                or _prod_cv >= _MIN_ACCOLADE_PROD.get(pos_group, 0)
            )
            if not _accolade_credible:
                logger.debug(
                    f'Stripping likely-misattributed accolades for {p["name"]} '
                    f'({pos_group}, games={_total_career_games}, prod_cv={_prod_cv:.0f})'
                )
                accolades  = {}
                acc_bonus  = 0
                has_strong = False

            # Brand-new draft class — no NFL seasons have elapsed; never grade.
            if seasons_elapsed == 0:
                continue

            # No qualifying seasons and no accolades.
            # Apply the same patience thresholds as the q < 2 bust gate:
            #   QB / OL: 3 seasons elapsed before Bust — QBs sit behind veterans;
            #            OL may miss a full year to injury early in their career.
            #   Everyone else: 2 seasons — consistent with the bust_at=2 window.
            # This avoids busting players after just 1 season with no stats (e.g.
            # an injured rookie who didn't play).
            if q == 0 and acc_bonus == 0:
                bust_at_zero = 3 if pos_group in ('QB', 'OL') else 2
                if seasons_elapsed >= bust_at_zero:
                    p['draftGrade'] = {
                        'tier':           'Bust',
                        'score':          0.0,
                        'classRank':      None,
                        'classSize':      p.get('_classSize', 0),
                        'yearsEvaluated': 0,
                        'provisional':    False,
                    }
                continue

            # OL special case: 1 qualifying season but had a full starter year
            # (15+ starts, 900+ snaps). This catches players who proved themselves
            # then got injured (e.g. Joe Alt 2024: 16 starts, 1011 snaps → injured 2025).
            # Give them a provisional Backup rather than no grade or Bust.
            if pos_group == 'OL' and q == 1 and not has_strong:
                ol_starts_d = p.get('olStarts') or {}
                ol_snaps_d  = p.get('olSnaps')  or {}
                has_full_szn = any(
                    (ol_starts_d.get(s) or 0) >= 15 and (ol_snaps_d.get(s) or 0) >= 900
                    for s in ol_starts_d
                )
                if has_full_szn:
                    p['draftGrade'] = {
                        'tier':           'Backup',
                        'score':          0.0,
                        'classRank':      p.get('_classRank'),
                        'classSize':      p.get('_classSize', 0),
                        'yearsEvaluated': q,
                        'provisional':    True,
                    }
                    continue

            # Players with only 1 qualifying season and no strong accolade:
            #   - Non-QB: 2+ seasons elapsed → Bust
            #   - QB: 3+ seasons elapsed → Bust (more development time needed)
            #   - Otherwise suppress — too early to grade
            if q < 2 and not has_strong:
                bust_at = 3 if pos_group in ('QB', 'OL') else 2
                if seasons_elapsed >= bust_at:
                    p['draftGrade'] = {
                        'tier':           'Bust',
                        'score':          0.0,
                        'classRank':      p.get('_classRank'),
                        'classSize':      p.get('_classSize', 0),
                        'yearsEvaluated': q,
                        'provisional':    False,
                    }
                continue

            # Minimum career production gate: after 3+ seasons, a player whose total
            # NFL output (across all seasons, no games filter) falls below the position
            # floor is a Bust. Skill-position strong accolades (AP1/AP2/major awards)
            # bypass this gate — they confirm real production even if nflStats have
            # name-matching gaps (e.g. Jessie Bates III, whose stats were not pulled).
            # When accolades were stripped as not credible, exclude their bonus from the
            # raw CV comparison so the gate isn't fooled by the inflated original _raw_cv.
            has_skill_strong = any(accolades.get(k) for k in SKILL_STRONG_ACCOLADES)
            min_cv = MIN_CAREER_CV.get(pos_group, 0)
            _eff_raw_cv = p['_raw_cv'] if _accolade_credible else (p['_raw_cv'] - p['_acc_bonus'])
            if seasons_elapsed >= 3 and _eff_raw_cv < min_cv and not has_skill_strong:
                p['draftGrade'] = {
                    'tier':           'Bust',
                    'score':          0.0,
                    'classRank':      p.get('_classRank'),
                    'classSize':      p.get('_classSize', 0),
                    'yearsEvaluated': q,
                    'provisional':    False,
                }
                continue

            sorted_pool = pos_sorted.get(pos_group, [])
            if not sorted_pool:
                continue

            pct = percentile_rank(p, sorted_pool)

            # AP1 = best at position in the NFL that year → Elite, provided the player
            # has at least 2 qualifying seasons. Single-season AP1s stay in the normal
            # percentile path until they prove it isn't a one-year anomaly.
            pb = accolades.get('probowl') or 0
            if (accolades.get('allpro1') or 0) >= 1 and q >= 2:
                tier = 'Elite'
            # AP2 + 2 Pro Bowls confirms sustained All-Pro caliber play. Career-length
            # bias can suppress young stars' percentile rank, so we trust the accolade
            # record over the pct rank for players with this level of recognition.
            elif (accolades.get('allpro2') or 0) >= 1 and pb >= 2 and q >= 2:
                tier = 'Elite'
            # Multiple Pro Bowls + production confirms sustained elite-level play.
            # OL career totals are suppressed by career-length bias (2-season OL compared
            # to 10-season veterans), so use a lower percentile bar for OL Pro Bowl paths.
            elif pos_group == 'OL' and pb >= 3 and pct >= 50 and q >= 2:
                tier = 'Elite'
            elif pos_group == 'OL' and pb >= 2 and pct >= 70 and q >= 2:
                tier = 'Elite'
            elif pb >= 3 and pct >= 65 and q >= 2:
                tier = 'Elite'
            elif pb >= 2 and pct >= 82 and q >= 2:
                tier = 'Elite'
            else:
                tier = tier_from_pct(pct, accolades, pos_group, q=q)

            # OL committed-starter floor: a player who has been a full-time starter
            # for 2+ seasons (14+ starts each) is definitionally a Starter, regardless
            # of where their career snap total ranks against 10-year veterans.
            if pos_group == 'OL' and tier in ('Bust', 'Backup'):
                ol_starts_d = p.get('olStarts') or {}
                # 12+ starts = started 70%+ of a 17-game season — clearly a full-time
                # starter even accounting for injury absences.
                full_starter_szns = sum(
                    1 for s in ol_starts_d if (ol_starts_d.get(s) or 0) >= 12
                )
                if full_starter_szns >= 2:
                    tier = 'Starter'
                # 8+ starts in 2 seasons = meaningful contributor, not a true Bust.
                elif tier == 'Bust':
                    contributor_szns = sum(
                        1 for s in ol_starts_d if (ol_starts_d.get(s) or 0) >= 8
                    )
                    if contributor_szns >= 2:
                        tier = 'Backup'

            # Committed-starter floor for QBs: a player who was the undisputed
            # starting QB for 2+ full seasons (14+ games, 370+ pass attempts) is
            # definitionally a Starter. Guards against career-length bias that
            # unfairly ranks young starters against veterans with 8-10 year totals.
            # Threshold requires enough games and volume to rule out backup/injury
            # appearance seasons — e.g. Fields (15g/318att or 13g/370att) doesn't
            # qualify because he never had a full commitment with that volume.
            if pos_group == 'QB' and tier == 'Backup':
                nfl_stats = p.get('nflStats') or {}
                committed_szns = sum(
                    1 for s in nfl_stats.values()
                    if isinstance(s, dict)
                    and (s.get('games') or 0) >= 14
                    and (s.get('attempts') or 0) >= 370
                )
                if committed_szns >= 2:
                    tier = 'Starter'

            # OL committed-starter floor: one full starter season (15+ starts and
            # 900+ snaps) guarantees at least Backup. Guards against an injury-
            # shortened follow-up season (like Alt's 4-start 2025) causing Bust.
            if pos_group == 'OL' and tier == 'Bust':
                ol_starts = p.get('olStarts') or {}
                ol_snaps  = p.get('olSnaps')  or {}
                full_szns = sum(
                    1 for s in ol_starts
                    if (ol_starts.get(s) or 0) >= 15
                    and (ol_snaps.get(s) or 0) >= 900
                )
                if full_szns >= 1:
                    tier = 'Backup'

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
            for k in ('_cv', '_raw_cv', '_q', '_acc_bonus', '_classRank', '_classSize'):
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
