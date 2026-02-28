"""
Fetch mock draft rankings from multiple sources.
Returns list of dicts: {name, position, school, rank, source}
"""
import re
import logging
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; NFLDraftBot/1.0)'}
DRAFT_YEAR = 2026
TIMEOUT = 15


def fetch_walter_football() -> list[dict]:
    """Scrape Walter Football big board."""
    url = f'https://walterfootball.com/draft{DRAFT_YEAR}rankings.php'
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'lxml')

        prospects = []
        # WalterFootball uses a numbered list or table; try common patterns
        # Pattern 1: look for rank, name in table rows
        rows = soup.select('table tr')
        for row in rows:
            cells = row.select('td')
            if len(cells) < 3:
                continue
            rank_text = cells[0].get_text(strip=True)
            if not rank_text.isdigit():
                continue
            rank = int(rank_text)
            name = cells[1].get_text(strip=True)
            # position/school often in cell 2 or 3
            pos_school = cells[2].get_text(strip=True) if len(cells) > 2 else ''
            parts = pos_school.split(',')
            position = parts[0].strip() if parts else ''
            school = parts[1].strip() if len(parts) > 1 else ''
            if name and rank:
                prospects.append({
                    'name': name, 'position': position, 'school': school,
                    'rank': rank, 'source': 'walter_football'
                })

        if not prospects:
            # Pattern 2: numbered paragraphs
            for elem in soup.find_all(['p', 'div']):
                text = elem.get_text()
                m = re.match(r'^(\d+)\.\s+(.+)', text.strip())
                if m and int(m.group(1)) <= 300:
                    rank = int(m.group(1))
                    name_raw = m.group(2).strip()
                    name = re.sub(r'\s*[\(\[].*', '', name_raw).strip()
                    prospects.append({
                        'name': name, 'position': '', 'school': '',
                        'rank': rank, 'source': 'walter_football'
                    })

        logger.info(f'Walter Football: {len(prospects)} prospects')
        return prospects[:300]
    except Exception as e:
        logger.warning(f'Walter Football failed: {e}')
        return []


def fetch_espn() -> list[dict]:
    """Fetch from ESPN sports.core API."""
    url = (
        f'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'
        f'/seasons/{DRAFT_YEAR}/draft/athletes?limit=500'
    )
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()

        prospects = []
        items = data.get('items', [])
        for i, item in enumerate(items):
            rank = i + 1
            # Each item may be a reference or inline object
            athlete = item
            if '$ref' in item:
                try:
                    ar = requests.get(item['$ref'], headers=HEADERS, timeout=TIMEOUT)
                    athlete = ar.json()
                except Exception:
                    continue

            name = athlete.get('displayName') or athlete.get('fullName', '')
            position = ''
            school = ''

            pos_obj = athlete.get('position', {})
            if isinstance(pos_obj, dict):
                position = pos_obj.get('abbreviation', '')

            team_obj = athlete.get('college', {})
            if isinstance(team_obj, dict):
                school = team_obj.get('name', '')

            if name:
                prospects.append({
                    'name': name, 'position': position, 'school': school,
                    'rank': rank, 'source': 'espn'
                })

        logger.info(f'ESPN: {len(prospects)} prospects')
        return prospects[:300]
    except Exception as e:
        logger.warning(f'ESPN failed: {e}')
        return []


def fetch_pro_football_network() -> list[dict]:
    """Fetch from Pro Football Network — JSON API first, fall back to HTML."""
    prospects = _pfn_json()
    if not prospects:
        prospects = _pfn_html()
    logger.info(f'Pro Football Network: {len(prospects)} prospects')
    return prospects[:300]


def _pfn_json() -> list[dict]:
    url = f'https://www.profootballnetwork.com/wp-json/pfn/v1/draft-big-board?year={DRAFT_YEAR}'
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
        prospects = []
        players = data if isinstance(data, list) else data.get('players', data.get('data', []))
        for i, p in enumerate(players):
            name = p.get('name') or p.get('player_name', '')
            position = p.get('position', '')
            school = p.get('school') or p.get('college', '')
            rank = p.get('rank') or p.get('overall_rank') or (i + 1)
            if name:
                prospects.append({
                    'name': name, 'position': position, 'school': school,
                    'rank': int(rank), 'source': 'pro_football_network'
                })
        return prospects
    except Exception as e:
        logger.debug(f'PFN JSON failed: {e}')
        return []


def _pfn_html() -> list[dict]:
    url = f'https://www.profootballnetwork.com/nfl-draft-big-board-rankings/{DRAFT_YEAR}/'
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'lxml')
        prospects = []
        rows = soup.select('table tbody tr, .player-row, [class*="player"]')
        rank = 0
        for row in rows:
            name_el = row.select_one('a, .player-name, [class*="name"]')
            if not name_el:
                continue
            name = name_el.get_text(strip=True)
            if not name or len(name) < 4:
                continue
            rank += 1
            pos_el = row.select_one('.position, [class*="pos"]')
            school_el = row.select_one('.school, .college, [class*="school"]')
            prospects.append({
                'name': name,
                'position': pos_el.get_text(strip=True) if pos_el else '',
                'school': school_el.get_text(strip=True) if school_el else '',
                'rank': rank,
                'source': 'pro_football_network'
            })
        return prospects
    except Exception as e:
        logger.debug(f'PFN HTML failed: {e}')
        return []


def fetch_all_rankings() -> dict[str, list[dict]]:
    """Fetch from all sources. Returns dict keyed by source name."""
    return {
        'walter_football': fetch_walter_football(),
        'espn': fetch_espn(),
        'pro_football_network': fetch_pro_football_network(),
    }


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    results = fetch_all_rankings()
    for src, pros in results.items():
        print(f'{src}: {len(pros)} prospects')
        for p in pros[:3]:
            print(f'  #{p["rank"]} {p["name"]} ({p["position"]}) - {p["school"]}')
