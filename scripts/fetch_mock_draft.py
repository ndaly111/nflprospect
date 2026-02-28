"""
Fetch Tankathon's NFL mock draft to get projected team picks.
Returns: {player_name_normalized: {pickNumber, teamAbbrev, round}}
"""
import re
import logging
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)
HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'}

# Map team abbreviations → full display names
TEAM_NAMES = {
    'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens',
    'BUF': 'Buffalo Bills', 'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
    'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns', 'DAL': 'Dallas Cowboys',
    'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
    'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars',
    'KC': 'Kansas City Chiefs', 'LAC': 'Los Angeles Chargers', 'LAR': 'Los Angeles Rams',
    'LV': 'Las Vegas Raiders', 'MIA': 'Miami Dolphins', 'MIN': 'Minnesota Vikings',
    'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
    'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers',
    'SEA': 'Seattle Seahawks', 'SF': 'San Francisco 49ers', 'TB': 'Tampa Bay Buccaneers',
    'TEN': 'Tennessee Titans', 'WSH': 'Washington Commanders',
}


def fetch_mock_draft() -> dict:
    """
    Scrape Tankathon's NFL mock draft.
    Returns dict keyed by lowercase player name: {pick, round, team, teamAbbrev}
    """
    url = 'https://www.tankathon.com/nfl/mock_draft'
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'lxml')

        result = {}
        for row in soup.select('.mock-row'):
            pick_el = row.select_one('.mock-row-pick-number')
            name_el = row.select_one('.mock-row-name')
            logo = row.select_one('img')
            if not (pick_el and name_el):
                continue
            try:
                pick = int(pick_el.get_text(strip=True))
            except (ValueError, AttributeError):
                continue

            name = name_el.get_text(strip=True)
            if not name:
                continue

            team_abbrev = None
            if logo and logo.get('src'):
                m = re.search(r'/nfl/([a-z]+)\.svg', logo['src'])
                if m:
                    team_abbrev = m.group(1).upper()

            rnd = 1 if pick <= 32 else 2 if pick <= 64 else 3 if pick <= 105 else 4 if pick <= 140 else 5 if pick <= 175 else 6 if pick <= 215 else 7
            team_name = TEAM_NAMES.get(team_abbrev, team_abbrev) if team_abbrev else None

            result[name.lower()] = {
                'pick': pick,
                'round': rnd,
                'team': team_name,
                'teamAbbrev': team_abbrev,
            }

        logger.info(f'Mock draft: {len(result)} picks (rounds 1-{max(v["round"] for v in result.values()) if result else 0})')
        return result
    except Exception as e:
        logger.warning(f'Mock draft fetch failed: {e}')
        return {}


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    picks = fetch_mock_draft()
    print(f'Total: {len(picks)} picks')
    for name, data in list(picks.items())[:32]:
        print(f'  Pick #{data["pick"]} ({data["teamAbbrev"]}) {name} → {data["team"]}')
