"""
Compare pre-draft consensus rankings to actual NFL Draft results for a given year.

Reads:
  data/predraft/<year>.json       — pre-draft consensus snapshot (pinned at draft eve)
  data/draft_results/<year>.json  — actuals from nflverse (run fetch_draft_results.py first)

Writes:
  data/consensus_accuracy/<year>.json — joined view with rank/value deltas

Run standalone:
    python scripts/build_consensus_accuracy.py 2026
"""
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from utils import normalize_name
from pick_value import value_for_pick

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent
PREDRAFT_DIR  = ROOT / 'data' / 'predraft'
RESULTS_DIR   = ROOT / 'data' / 'draft_results'
OUT_DIR       = ROOT / 'data' / 'consensus_accuracy'

# Position group normalization (loose — used for tie-breaking name matches only)
POS_GROUP = {
    'QB':'QB',
    'RB':'RB','FB':'RB',
    'WR':'WR',
    'TE':'TE',
    'OT':'OL','OG':'OL','C':'OL','OL':'OL','IOL':'OL','T':'OL','G':'OL',
    'DT':'DL','NT':'DL','DL':'DL',
    'DE':'EDGE','EDGE':'EDGE',
    'OLB':'EDGE','LB':'LB','ILB':'LB','MLB':'LB',
    'CB':'DB','DB':'DB','S':'DB','FS':'DB','SS':'DB',
    'K':'K','P':'P','LS':'LS',
}

SOURCES = ['walter_football', 'espn', 'cbs_sports', 'tankathon']


def pos_group(p: str) -> str:
    return POS_GROUP.get((p or '').upper(), (p or '').upper())


def match_picks_to_predraft(predraft: list[dict], picks: list[dict]) -> dict[int, dict]:
    """Return dict pick_no -> matched predraft prospect (or None)."""
    by_norm: dict[str, list[dict]] = {}
    for p in predraft:
        by_norm.setdefault(normalize_name(p['name']), []).append(p)

    matched: dict[int, dict | None] = {}
    for pk in picks:
        norm = normalize_name(pk['name'])
        candidates = by_norm.get(norm, [])
        if not candidates:
            matched[pk['pick']] = None
            continue
        if len(candidates) == 1:
            matched[pk['pick']] = candidates[0]
            continue
        # Two players with same normalized name (rare). Disambiguate by position group.
        pg = pos_group(pk['position'])
        same_pg = [c for c in candidates if pos_group(c.get('position')) == pg]
        matched[pk['pick']] = same_pg[0] if same_pg else candidates[0]
    return matched


def build_rows(predraft: list[dict], picks: list[dict],
               match_by_pick: dict[int, dict]) -> list[dict]:
    """Build one row per (predraft prospect ∪ actual pick) — the union."""
    rows: list[dict] = []
    matched_predraft_ids: set[str] = set()

    # 1. Drafted players (every pick gets a row)
    for pk in picks:
        m = match_by_pick.get(pk['pick'])
        consensus_rank = m.get('consensusRank') if m else None
        rank_by_source = m.get('rankBySource', {}) if m else {}
        if m:
            matched_predraft_ids.add(m['id'])

        actual_value     = value_for_pick(pk['pick'])
        consensus_value  = value_for_pick(consensus_rank) if consensus_rank else 0.0
        # valueDelta > 0 = player went HIGHER than consensus said (overdrafted relative to consensus)
        # valueDelta < 0 = player FELL relative to consensus
        # We define from prospect POV: actual_value - consensus_value
        value_delta = actual_value - consensus_value
        rank_delta  = (pk['pick'] - consensus_rank) if consensus_rank else None

        if consensus_rank is None:
            category = 'surprise'  # drafted but had no consensus rank
        elif rank_delta == 0:
            category = 'match'
        elif rank_delta > 0:
            category = 'fell'      # actual pick is later than consensus rank
        else:
            category = 'rose'

        # Always recompute positionGroup from the granular position — some prospect
        # records in the predraft snapshot have stale/incorrect positionGroup values
        # (e.g. position='G' with positionGroup='DB').
        position_raw   = (m.get('position') if m else pk['position']) or pk['position']
        position_group = pos_group(position_raw)

        rows.append({
            'name':           pk['name'],
            'position':       position_raw,
            'positionGroup':  position_group,
            'school':         (m.get('school')   if m else pk['college'])   or pk['college'],
            'consensusRank':  consensus_rank,
            'rankBySource':   rank_by_source,
            'actualPick':     pk['pick'],
            'actualRound':    pk['round'],
            'actualTeam':     pk['team'],
            'rankDelta':      rank_delta,
            'consensusValue': round(consensus_value, 1),
            'actualValue':    round(actual_value, 1),
            'valueDelta':     round(value_delta, 1),
            'category':       category,
            'matched':        m is not None,
        })

    # 2. Pre-draft prospects who went UNDRAFTED — only emit those with a real consensus rank.
    for p in predraft:
        if p['id'] in matched_predraft_ids:
            continue
        cr = p.get('consensusRank')
        if not cr:
            continue
        consensus_value = value_for_pick(cr)
        rows.append({
            'name':           p['name'],
            'position':       p.get('position'),
            'positionGroup':  pos_group(p.get('position')),
            'school':         p.get('school'),
            'consensusRank':  cr,
            'rankBySource':   p.get('rankBySource', {}),
            'actualPick':     None,
            'actualRound':    None,
            'actualTeam':     None,
            'rankDelta':      None,
            'consensusValue': round(consensus_value, 1),
            'actualValue':    0.0,
            'valueDelta':     round(-consensus_value, 1),
            'category':       'undrafted',
            'matched':        True,  # we identified them, just no pick
        })

    return rows


def compute_stats(rows: list[dict]) -> dict:
    """Headline accuracy numbers + per-source mean absolute value error."""
    paired = [r for r in rows if r['consensusRank'] is not None and r['actualPick'] is not None]
    n = len(paired)

    if not n:
        return {'matchedPairs': 0}

    mean_abs_rank  = sum(abs(r['rankDelta'])  for r in paired) / n
    mean_abs_value = sum(abs(r['valueDelta']) for r in paired) / n
    exact_matches  = sum(1 for r in paired if r['rankDelta'] == 0)
    within_5       = sum(1 for r in paired if abs(r['rankDelta']) <= 5)
    within_10      = sum(1 for r in paired if abs(r['rankDelta']) <= 10)

    # Per-source: how close was each source's per-prospect rank to actual pick (in points)?
    per_source = {}
    for src in SOURCES:
        src_rows = [r for r in paired if r['rankBySource'].get(src)]
        if not src_rows:
            per_source[src] = {'sample': 0, 'meanAbsValueDelta': None, 'meanAbsRankDelta': None}
            continue
        rank_errs  = []
        value_errs = []
        for r in src_rows:
            src_rank = r['rankBySource'][src]
            rank_errs.append(abs(r['actualPick'] - src_rank))
            value_errs.append(abs(value_for_pick(src_rank) - r['actualValue']))
        per_source[src] = {
            'sample': len(src_rows),
            'meanAbsRankDelta':  round(sum(rank_errs)  / len(rank_errs),  2),
            'meanAbsValueDelta': round(sum(value_errs) / len(value_errs), 2),
        }

    return {
        'matchedPairs':       n,
        'exactMatches':       exact_matches,
        'within5':            within_5,
        'within10':           within_10,
        'meanAbsRankDelta':   round(mean_abs_rank,  2),
        'meanAbsValueDelta':  round(mean_abs_value, 2),
        'perSource':          per_source,
    }


def top_n(rows, key, n=10, reverse=True, predicate=None):
    items = [r for r in rows if predicate(r)] if predicate else rows
    return sorted(items, key=key, reverse=reverse)[:n]


def main():
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026

    pre_path = PREDRAFT_DIR / f'{year}.json'
    res_path = RESULTS_DIR / f'{year}.json'
    if not pre_path.exists():
        logger.error(f'Missing predraft snapshot: {pre_path}')
        sys.exit(1)
    if not res_path.exists():
        logger.error(f'Missing draft results: {res_path}')
        sys.exit(1)

    predraft = json.loads(pre_path.read_text())
    picks    = json.loads(res_path.read_text())
    logger.info(f'Loaded {len(predraft)} predraft prospects, {len(picks)} actual picks')

    matches = match_picks_to_predraft(predraft, picks)
    matched_count = sum(1 for v in matches.values() if v is not None)
    logger.info(f'Matched {matched_count}/{len(picks)} picks to a pre-draft prospect')

    rows  = build_rows(predraft, picks, matches)
    stats = compute_stats(rows)

    out = {
        'year':                  year,
        'predraftSourceCount':   len(predraft),
        'totalPicks':            len(picks),
        'matchedPicks':          matched_count,
        'stats':                 stats,
        'rows':                  rows,
        'biggestFalls':          top_n(rows,
                                       key=lambda r: r['valueDelta'],
                                       n=15,
                                       reverse=False,
                                       predicate=lambda r: r['category'] in ('fell','undrafted') and r['consensusRank']),
        'biggestRises':          top_n(rows,
                                       key=lambda r: r['valueDelta'],
                                       n=15,
                                       reverse=True,
                                       predicate=lambda r: r['category'] == 'rose'),
        'topUndrafted':          top_n([r for r in rows if r['category'] == 'undrafted'],
                                       key=lambda r: r['consensusRank'],
                                       n=15,
                                       reverse=False),
        'topSurprises':          top_n([r for r in rows if r['category'] == 'surprise'],
                                       key=lambda r: r['actualPick'],
                                       n=15,
                                       reverse=False),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f'{year}.json'
    out_path.write_text(json.dumps(out, indent=2))
    # Also write/update latest.json so the front-end can fetch a year-agnostic
    # path. Always overwrite — whatever year we just built is the latest.
    (OUT_DIR / 'latest.json').write_text(json.dumps(out, indent=2))
    logger.info(f'Wrote {out_path} (and latest.json)')
    logger.info(f'Top-line: {stats["matchedPairs"]} paired, '
                f'mean abs rank delta {stats["meanAbsRankDelta"]}, '
                f'mean abs value delta {stats["meanAbsValueDelta"]} JJ pts')


if __name__ == '__main__':
    main()
