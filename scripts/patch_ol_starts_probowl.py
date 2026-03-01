"""
Patch script: fixes T/G positionGroup bug, adds olStarts, adds Pro Bowl accolades, re-grades.

Run: python3 scripts/patch_ol_starts_probowl.py
"""
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

data_dir = Path(__file__).parent.parent / 'data'
history_file = data_dir / 'draft_history.json'

logger.info(f'Loading {history_file} ...')
with open(history_file) as f:
    history = json.load(f)

# ---------------------------------------------------------------------------
# 1. Fix positionGroup for players with position 'T' or 'G' misclassified as DB
# ---------------------------------------------------------------------------
fixed = 0
for prsp in history.values():
    for p in prsp:
        if p.get('position') in ('T', 'G') and p.get('positionGroup') == 'DB':
            p['positionGroup'] = 'OL'
            # Clear incorrect defensive nflStats
            p.pop('nflStats', None)
            fixed += 1
logger.info(f'Fixed positionGroup for {fixed} T/G players (was DB, now OL)')

# ---------------------------------------------------------------------------
# 2. Tag draft years so fetch functions work
# ---------------------------------------------------------------------------
for yr, prsp in history.items():
    for p in prsp:
        p['_draftYear'] = int(yr)
all_flat = [p for prsp in history.values() for p in prsp]

# ---------------------------------------------------------------------------
# 3. Fetch olSnaps + olStarts for all OL (including newly fixed players)
# ---------------------------------------------------------------------------
logger.info('Fetching OL snap counts and games started ...')
from fetch_ol_snaps import fetch_ol_snaps
ol_snaps, ol_starts = fetch_ol_snaps(all_flat)
n_snaps = n_starts = 0
for prsp in history.values():
    for p in prsp:
        if p.get('positionGroup') != 'OL':
            continue
        if p['name'] in ol_snaps:
            p['olSnaps'] = ol_snaps[p['name']]
            n_snaps += 1
        if p['name'] in ol_starts:
            p['olStarts'] = ol_starts[p['name']]
            n_starts += 1
logger.info(f'Updated olSnaps for {n_snaps} OL, olStarts for {n_starts} OL')

# ---------------------------------------------------------------------------
# 4. Fetch all accolades (AP All-Pro + Pro Bowl)
# ---------------------------------------------------------------------------
logger.info('Fetching accolades (AP All-Pro + Pro Bowl) ...')
from fetch_nfl_accolades import fetch_nfl_accolades
new_accolades = fetch_nfl_accolades(all_flat)

n_acc = 0
for prsp in history.values():
    for p in prsp:
        if p['name'] not in new_accolades:
            continue
        new_acc = new_accolades[p['name']]
        existing = p.get('accolades') or {}
        # Merge: take max for counts (allpro1/allpro2/probowl), OR for booleans
        merged = dict(existing)
        for k, v in new_acc.items():
            if k in ('allpro1', 'allpro2', 'probowl'):
                merged[k] = max(merged.get(k, 0) or 0, v or 0)
            else:
                merged[k] = v or merged.get(k)
        # Clean up zeros
        p['accolades'] = {k: v for k, v in merged.items() if v}
        n_acc += 1
logger.info(f'Updated accolades for {n_acc} players')

# ---------------------------------------------------------------------------
# 5. Clean up temp keys
# ---------------------------------------------------------------------------
for prsp in history.values():
    for p in prsp:
        p.pop('_draftYear', None)

# ---------------------------------------------------------------------------
# 6. Re-grade all classes
# ---------------------------------------------------------------------------
from grade_draft_picks import grade_all_classes
logger.info('Re-grading all classes ...')
for prsp in history.values():
    for p in prsp:
        p.pop('draftGrade', None)
grade_all_classes(history)

# ---------------------------------------------------------------------------
# 7. OL spot-checks
# ---------------------------------------------------------------------------
print('\nOL spot-checks:')
ol_checks = [
    ('2021', 'Penei Sewell',       'Elite'),
    ('2021', 'Creed Humphrey',     'Elite'),
    ('2020', 'Tristan Wirfs',      'Elite'),   # 2×AP1, 5 Pro Bowls
    ('2020', 'Andrew Thomas',      None),
    ('2021', 'Rashawn Slater',     None),       # 1×AP2, 2 Pro Bowls
    ('2022', 'Tyler Smith',        None),       # 1×AP2, 3 Pro Bowls → Elite?
    ('2021', 'Christian Darrisaw', None),
    ('2021', 'Quinn Meinerz',      'Elite'),   # 2×AP1
]
for yr, name, expected in ol_checks:
    prospects = history.get(yr, [])
    p = next((x for x in prospects if name.lower() in x['name'].lower()), None)
    if p:
        g = p.get('draftGrade')
        acc = p.get('accolades') or {}
        starts_d = p.get('olStarts') or {}
        snaps_d  = p.get('olSnaps')  or {}
        total_starts = sum(v for v in starts_d.values() if isinstance(v, (int, float)))
        total_snaps  = sum(v for v in snaps_d.values()  if isinstance(v, (int, float)))
        if g:
            ok = '' if expected is None else ('✓' if g['tier'] == expected else '✗')
            print(f'  {ok} {name} ({yr}): {g["tier"]} pct={g["score"]} | snaps={total_snaps} starts={total_starts} | {acc}')
        else:
            print(f'  — {name} ({yr}): no grade | snaps={total_snaps} starts={total_starts} | {acc}')
    else:
        print(f'  ? {name}: not found in {yr}')

# ---------------------------------------------------------------------------
# 8. Save
# ---------------------------------------------------------------------------
history_file.write_text(json.dumps(history, indent=2))
logger.info(f'Saved {history_file}')
