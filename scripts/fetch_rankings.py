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

        seen_ranks = set()
        prospects = []
        for row in soup.select('.mock-row'):
            rank_el = row.select_one('.mock-row-pick-number')
            name_el = row.select_one('.mock-row-name')
            pos_school_el = row.select_one('.mock-row-school-position')

            if not (rank_el and name_el):
                continue
            try:
                rank = int(rank_el.get_text(strip=True))
            except ValueError:
                continue

            # Page renders each player in multiple views — only keep first occurrence per rank
            if rank in seen_ranks:
                continue
            seen_ranks.add(rank)

            name = name_el.get_text(strip=True)
            if not name or len(name) < 3:
                continue

            pos, school = '', ''
            if pos_school_el:
                ps_text = pos_school_el.get_text(strip=True)
                if '|' in ps_text:
                    parts = ps_text.split('|', 1)
                    pos = parts[0].strip()
                    school = parts[1].strip()

            prospects.append({
                'name': name,
                'position': pos,
                'school': school,
                'rank': rank,
                'source': 'tankathon',
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
    """Parse Walter Football mock draft picks for ranking signal."""
    url = f'https://walterfootball.com/draft{DRAFT_YEAR}.php'
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'lxml')
        text = soup.get_text(separator='\n')
        lines = [l.strip() for l in text.split('\n') if l.strip()]

        prospects = []
        pick = 0
        for l in lines:
            # Format: "Team Name: Player Name, POS, School"
            m = re.match(r'^[^:]+:\s*([A-Z][a-z].+),\s*([A-Z/]{1,6}),\s*(.+)$', l)
            if m and len(l) < 150:
                name = m.group(1).strip()
                pos = m.group(2).strip()
                school = m.group(3).strip()
                # Sanity check on name
                if re.match(r'^[A-Z][a-z]+ [A-Z]', name) and len(name) < 40:
                    pick += 1
                    prospects.append({
                        'name': name,
                        'position': pos,
                        'school': school,
                        'rank': pick,
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
