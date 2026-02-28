"""
Fetch mock draft rankings from multiple sources.
Returns list of dicts: {name, position, school, rank, source}

Sources:
  - Tankathon big board (free, 550+ prospects)
  - ESPN sports.core API (concurrent $ref fetch, 150 prospects with grades)
  - Walter Football mock draft (free picks, limited)
"""
import re
import logging
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)
HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'}
DRAFT_YEAR = 2026
TIMEOUT = 15


# ---------------------------------------------------------------------------
# Tankathon
# ---------------------------------------------------------------------------
def fetch_tankathon() -> list[dict]:
    """Scrape Tankathon NFL big board using structured CSS classes."""
    url = 'https://www.tankathon.com/nfl/big_board'
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'lxml')

        # First pass: collect ALL data for each rank (page renders each player 3x in different views)
        # We need the first occurrence for basic info but ALL occurrences for combine data
        rank_data: dict[int, dict] = {}  # rank -> accumulated data

        for row in soup.select('.mock-row'):
            rank_el = row.select_one('.mock-row-pick-number')
            name_el = row.select_one('.mock-row-name')
            if not (rank_el and name_el):
                continue
            try:
                rank = int(rank_el.get_text(strip=True))
            except ValueError:
                continue

            name = name_el.get_text(strip=True)
            if not name or len(name) < 3:
                continue

            if rank not in rank_data:
                # First occurrence: capture basic info
                pos, school = '', ''
                pos_school_el = row.select_one('.mock-row-school-position')
                if pos_school_el:
                    ps_text = pos_school_el.get_text(strip=True)
                    if '|' in ps_text:
                        parts = ps_text.split('|', 1)
                        pos = parts[0].strip()
                        school = parts[1].strip()

                height_str, weight_val = None, None
                meas_el = row.select_one('.mock-row-measurements')
                if meas_el:
                    parts = meas_el.get_text(separator='|', strip=True).split('|')
                    if len(parts) >= 1:
                        height_str = parts[0].strip()
                    if len(parts) >= 2:
                        w = re.sub(r'[^\d]', '', parts[1])
                        weight_val = int(w) if w else None

                rank_data[rank] = {
                    'name': name, 'pos': pos, 'school': school,
                    'height': height_str, 'weight': weight_val,
                    'combine': {}, 'stats': {},
                }

            # Every occurrence: accumulate combine drills (they appear in different views)
            combine_el = row.select_one('.nfl-mock-row-stats.combine')
            if combine_el:
                for stat_div in combine_el.select('.stat'):
                    lbl_el = stat_div.select_one('.label')
                    val_el = stat_div.select_one('.value')
                    if lbl_el and val_el:
                        lbl = lbl_el.get_text(strip=True).lower()
                        val = val_el.get_text(strip=True).replace('"', '').strip()
                        if val and val not in (' ', ''):
                            rank_data[rank]['combine'].setdefault(lbl, val)

            # Every occurrence: accumulate college stats
            stats_el = row.select_one('.nfl-mock-row-stats.statistics')
            if stats_el:
                for stat_div in stats_el.select('.stat'):
                    lbl_el = stat_div.select_one('.label')
                    val_el = stat_div.select_one('.value.total')
                    if lbl_el and val_el:
                        lbl = lbl_el.get_text(strip=True)
                        val = val_el.get_text(strip=True)
                        if val:
                            rank_data[rank]['stats'].setdefault(lbl, val)

        prospects = []
        for rank in sorted(rank_data):
            d = rank_data[rank]
            prospects.append({
                'name': d['name'],
                'position': d['pos'],
                'school': d['school'],
                'rank': rank,
                'source': 'tankathon',
                'height': d['height'],
                'weight': d['weight'],
                'tankCombine': d['combine'],
                'tankStats': d['stats'],
            })

        logger.info(f'Tankathon: {len(prospects)} prospects')
        return prospects
    except Exception as e:
        logger.warning(f'Tankathon failed: {e}')
        return []


# ---------------------------------------------------------------------------
# ESPN sports.core API (concurrent $ref resolution)
# ---------------------------------------------------------------------------
def fetch_espn() -> list[dict]:
    """Fetch ESPN draft big board with concurrent athlete resolution."""
    list_url = (
        f'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'
        f'/seasons/{DRAFT_YEAR}/draft/athletes?limit=500'
    )
    try:
        r = requests.get(list_url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        items = r.json().get('items', [])
        refs = [item.get('$ref', '') for item in items if '$ref' in item]
        logger.info(f'ESPN: resolving {len(refs)} athlete refs...')
    except Exception as e:
        logger.warning(f'ESPN list fetch failed: {e}')
        return []

    def resolve(args):
        rank, ref = args
        try:
            ar = requests.get(ref, headers=HEADERS, timeout=10)
            d = ar.json()
            name = d.get('displayName') or d.get('fullName', '')
            pos = d.get('position', {}).get('abbreviation', '')

            # ESPN's overall rank and grade from attributes
            overall_rank = rank
            grade = None
            pos_rank = None
            for attr in d.get('attributes', []):
                attr_name = attr.get('name')
                if attr_name == 'overall':
                    overall_rank = int(attr.get('value', rank))
                elif attr_name == 'grade':
                    grade = attr.get('value')
                elif attr_name == 'rank':
                    pos_rank = int(attr.get('value', 0))

            # Height/weight available inline — use for combine stub
            height_in = d.get('height')  # inches
            weight = d.get('weight')
            height_str = None
            if height_in:
                try:
                    h = int(float(height_in))
                    height_str = f'{h // 12}-{h % 12}'
                except Exception:
                    pass

            return {
                'name': name,
                'position': pos,
                'school': '',
                'rank': overall_rank,
                'grade': grade,
                'espn_pos_rank': pos_rank,
                'espn_id': d.get('id'),
                'height': height_str,
                'weight': int(weight) if weight else None,
                'source': 'espn',
            }
        except Exception:
            return None

    prospects = []
    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = {ex.submit(resolve, (i + 1, ref)): i for i, ref in enumerate(refs)}
        for future in as_completed(futures):
            result = future.result()
            if result and result['name']:
                prospects.append(result)

    prospects.sort(key=lambda p: p['rank'])
    logger.info(f'ESPN: {len(prospects)} prospects resolved')
    return prospects


# ---------------------------------------------------------------------------
# Walter Football mock draft (free picks only — ~2 per page)
# ---------------------------------------------------------------------------
def fetch_walter_football() -> list[dict]:
    """Parse Walter Football mock draft picks for ranking signal.

    Handles two formats on the page:
      1. Bare:         "Player Name, POS, School"
      2. Team-assigned: "Team Name: Player Name, POS, School"
    """
    url = f'https://walterfootball.com/draft{DRAFT_YEAR}.php'
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'lxml')
        text = soup.get_text(separator='\n')
        lines = [l.strip() for l in text.split('\n') if l.strip()]

        seen_names = set()
        prospects = []

        for l in lines:
            if len(l) > 150:
                continue

            name = pos = school = None

            # Format 1: "Team Name: Player Name, POS, School"
            m1 = re.match(r'^[A-Z][A-Za-z ]+:\s*([A-Z][a-zA-Z .\']+),\s*([A-Z/]{1,6}),\s*([A-Za-z ]+)$', l)
            if m1:
                name, pos, school = m1.group(1).strip(), m1.group(2).strip(), m1.group(3).strip()

            # Format 2: "Player Name, POS, School"  (no team prefix)
            if not name:
                m2 = re.match(r'^([A-Z][a-zA-Z .\']+),\s*([A-Z/]{1,6}),\s*([A-Za-z ]+)$', l)
                if m2:
                    name, pos, school = m2.group(1).strip(), m2.group(2).strip(), m2.group(3).strip()

            if not (name and pos and school):
                continue
            if not re.match(r'^[A-Z][a-z]+ [A-Z]', name) or len(name) >= 40:
                continue
            if len(school) < 3:
                continue

            norm = name.lower()
            if norm in seen_names:
                continue
            seen_names.add(norm)

            prospects.append({
                'name': name,
                'position': pos,
                'school': school,
                'rank': len(prospects) + 1,
                'source': 'walter_football',
            })

        logger.info(f'Walter Football: {len(prospects)} picks')
        return prospects
    except Exception as e:
        logger.warning(f'Walter Football failed: {e}')
        return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def fetch_all_rankings() -> dict[str, list[dict]]:
    """Fetch from all sources concurrently. Returns dict keyed by source name."""
    import concurrent.futures

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        futures = {
            ex.submit(fetch_tankathon): 'tankathon',
            ex.submit(fetch_espn): 'espn',
            ex.submit(fetch_walter_football): 'walter_football',
        }
        for f in concurrent.futures.as_completed(futures):
            src = futures[f]
            try:
                results[src] = f.result()
            except Exception as e:
                logger.warning(f'{src} failed: {e}')
                results[src] = []

    return results


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    results = fetch_all_rankings()
    for src, pros in results.items():
        print(f'\n{src}: {len(pros)} prospects')
        for p in pros[:5]:
            print(f'  #{p["rank"]} {p["name"]} ({p["position"]}) - {p["school"]}')
