"""
Fetch NFL career accolades for draft picks.

Sources:
  - Wikipedia: AP All-Pro 1st/2nd team (scraped per season)
  - Static dict: annual award winners (OROY, DROY, OPOY, CPOY, MVP)
    that come from our tracked draft classes

Returns {player_name: {allpro1: N, allpro2: N, oroy: True, ...}}
"""
import logging
import re
import time
from collections import defaultdict

import requests
from bs4 import BeautifulSoup

from utils import fuzzy_match_player

logger = logging.getLogger(__name__)

TIMEOUT = 15
DELAY   = 1.2  # seconds between Wikipedia requests

# ---------------------------------------------------------------------------
# Static award winners (one per award per season) — only players from the
# 2020-2024 draft classes we track; uses exact names as stored in nflverse.
# ---------------------------------------------------------------------------
ANNUAL_AWARDS = {
    # (season, award_key): player_name
    # --- 2012 draft class ---
    (2012, 'oroy'): 'Robert Griffin III',
    (2012, 'droy'): 'Luke Kuechly',
    (2013, 'dpoy'): 'Luke Kuechly',
    # --- 2013 draft class ---
    (2013, 'oroy'): 'Eddie Lacy',
    # --- 2014 draft class ---
    (2014, 'oroy'): 'Odell Beckham Jr.',
    (2016, 'dpoy'): 'Khalil Mack',
    (2017, 'dpoy'): 'Aaron Donald',
    (2018, 'dpoy'): 'Aaron Donald',
    (2020, 'dpoy'): 'Aaron Donald',
    # --- 2015 draft class ---
    (2015, 'oroy'): 'Todd Gurley',
    (2017, 'opoy'): 'Todd Gurley',
    # --- 2016 draft class ---
    (2016, 'oroy'): 'Dak Prescott',
    (2019, 'opoy'): 'Michael Thomas',
    # --- 2017 draft class ---
    (2017, 'oroy'): 'Kareem Hunt',
    (2017, 'droy'): 'Marshon Lattimore',
    (2018, 'mvp'):  'Patrick Mahomes',
    (2022, 'mvp'):  'Patrick Mahomes',
    (2019, 'sbmvp'): 'Patrick Mahomes',
    (2022, 'sbmvp'): 'Patrick Mahomes',
    (2023, 'sbmvp'): 'Patrick Mahomes',
    # --- 2018 draft class ---
    (2018, 'oroy'): 'Saquon Barkley',
    (2018, 'droy'): 'Darius Leonard',
    (2019, 'mvp'):  'Lamar Jackson',
    (2023, 'mvp'):  'Lamar Jackson',
    (2019, 'cpoy'): 'Lamar Jackson',
    # --- 2019 draft class ---
    (2019, 'oroy'): 'Kyler Murray',
    (2019, 'droy'): 'Nick Bosa',
    # --- 2020–2024 draft classes ---
    (2020, 'oroy'): 'Justin Herbert',
    (2020, 'droy'): 'Chase Young',
    (2021, 'oroy'): "Ja'Marr Chase",
    (2021, 'droy'): 'Micah Parsons',
    (2021, 'cpoy'): 'Joe Burrow',
    (2022, 'oroy'): 'Garrett Wilson',
    (2022, 'droy'): 'Sauce Gardner',
    (2022, 'opoy'): 'Justin Jefferson',
    (2023, 'oroy'): 'C.J. Stroud',
    (2023, 'droy'): 'Will Anderson',
    (2024, 'oroy'): 'Jayden Daniels',
    (2024, 'droy'): 'Jared Verse',
    (2024, 'opoy'): "Ja'Marr Chase",
}

# Invert: player_name → {award_key: True}
def _build_award_map():
    out = defaultdict(dict)
    for (_, award), name in ANNUAL_AWARDS.items():
        out[name][award] = True
    return dict(out)


# ---------------------------------------------------------------------------
# Wikipedia AP All-Pro scraper
# ---------------------------------------------------------------------------

def _fetch_wiki_page(page_title: str) -> str | None:
    """Fetch Wikipedia page HTML via the API. Returns HTML string or None."""
    time.sleep(DELAY)
    try:
        r = requests.get(
            'https://en.wikipedia.org/w/api.php',
            params={
                'action': 'parse',
                'page': page_title,
                'prop': 'text',
                'format': 'json',
            },
            headers={'User-Agent': 'NFLDraftTracker/1.0'},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if 'error' in data:
            return None
        return data['parse']['text']['*']
    except Exception:
        return None


def _fetch_probowl_year(season: int) -> set[str]:
    """
    Scrape the Wikipedia Pro Bowl page for the Pro Bowl held after `season`.
    Returns a set of player names selected to the Pro Bowl that year.
    Pro Bowl game year = season + 1 (e.g. after 2020 season → 2021 Pro Bowl).
    Handles both old format ("2021_Pro_Bowl") and new format ("2023_Pro_Bowl_Games").
    """
    pb_year = season + 1
    # Try new format first (2023+), fall back to old format
    page_titles = (
        [f'{pb_year}_Pro_Bowl_Games', f'{pb_year}_Pro_Bowl']
        if pb_year >= 2023
        else [f'{pb_year}_Pro_Bowl']
    )
    html = None
    for title in page_titles:
        html = _fetch_wiki_page(title)
        if html:
            break
    if not html:
        logger.warning(f'Pro Bowl {pb_year}: Wikipedia page not found')
        return set()

    soup = BeautifulSoup(html, 'lxml')
    names: set[str] = set()

    # Pro Bowl pages list players as wikilinks in tables.
    # Strategy: collect all linked names from wikitable cells.
    for table in soup.find_all('table', class_='wikitable'):
        for cell in table.find_all(['td', 'th']):
            for a in cell.find_all('a', href=True):
                text = a.get_text(strip=True)
                # Filter out short/non-name entries and wiki nav links
                if (len(text) > 4
                        and not text.startswith('AFC')
                        and not text.startswith('NFC')
                        and not a['href'].startswith('#')
                        and ':' not in a['href']):
                    names.add(text)

    logger.info(f'Pro Bowl {pb_year} (after {season} season): {len(names)} names found')
    return names


def _fetch_allpro_year(year: int) -> dict[str, dict]:
    """
    Scrape the Wikipedia All-Pro team page for `year`.
    Returns {player_name: {'allpro1': 1}} or {'allpro2': 1}, accumulating
    across positions (a player who made 1st team at 2 positions gets allpro1=2,
    which is essentially impossible but handled correctly anyway).
    """
    time.sleep(DELAY)
    try:
        r = requests.get(
            'https://en.wikipedia.org/w/api.php',
            params={
                'action': 'parse',
                'page': f'{year}_All-Pro_Team',
                'prop': 'text',
                'format': 'json',
            },
            headers={'User-Agent': 'NFLDraftTracker/1.0'},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if 'error' in data:
            logger.warning(f'{year} All-Pro page missing: {data["error"].get("info", "")}')
            return {}
        html = data['parse']['text']['*']
    except Exception as e:
        logger.warning(f'Wikipedia fetch for {year} All-Pro failed: {e}')
        return {}

    soup = BeautifulSoup(html, 'lxml')
    result: dict[str, dict] = defaultdict(lambda: {
        'allpro1': 0, 'allpro2': 0, 'allpro1_st': 0, 'allpro2_st': 0,
    })

    def _is_special_teams_table(table) -> bool:
        """Return True if the first row of the table is a Special Teams section header."""
        first_row = table.find('tr')
        if first_row:
            return 'special' in first_row.get_text(strip=True).lower()
        return False

    for table in soup.find_all('table', class_='wikitable'):
        is_st = _is_special_teams_table(table)

        # Find the header row containing 'First team' (may not be row 0 — row 0 is
        # often a spanning section title like 'Offense' / 'Defense')
        header_row_idx = None
        all_rows = table.find_all('tr')
        for i, row in enumerate(all_rows):
            row_text = [th.get_text(strip=True) for th in row.find_all(['th', 'td'])]
            if 'First team' in row_text and 'Second team' in row_text:
                headers = row_text
                header_row_idx = i
                break
        if header_row_idx is None:
            continue
        first_idx  = headers.index('First team')
        second_idx = headers.index('Second team')

        for row in all_rows[header_row_idx + 1:]:
            cells = row.find_all(['td', 'th'])
            if len(cells) <= max(first_idx, second_idx):
                continue
            for col_idx, base_key in [
                (first_idx,  'allpro1'),
                (second_idx, 'allpro2'),
            ]:
                accolade_key = f'{base_key}_st' if is_st else base_key
                cell_text = cells[col_idx].get_text(strip=True)
                # Each entry: "Player Name,Team(AP, PFWA, ...)" or "Player Name,Team(AP-2)"
                entries = re.findall(r'([^,\n]+),([^(\n]*)\(([^)\n]+)\)', cell_text)
                for player_name, _team, selectors_str in entries:
                    player_name = player_name.strip()
                    if not player_name or len(player_name) < 3:
                        continue
                    sel_list = [s.strip() for s in selectors_str.split(',')]
                    if base_key == 'allpro1' and 'AP' in sel_list:
                        result[player_name][accolade_key] += 1
                    elif base_key == 'allpro2' and 'AP-2' in sel_list:
                        result[player_name][accolade_key] += 1

    # Drop entries where no counter advanced
    return {
        k: v for k, v in result.items()
        if v['allpro1'] or v['allpro2'] or v['allpro1_st'] or v['allpro2_st']
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def fetch_nfl_accolades(prospects: list[dict]) -> dict[str, dict]:
    """
    Fetch career accolades for all prospects.
    Returns {name: {allpro1: N, allpro2: N, oroy: bool, ...}}
    """
    if not prospects:
        return {}

    # Build name candidates for fuzzy matching
    name_set  = {p['name'] for p in prospects}
    name_cands = [{'name': n} for n in name_set]

    # ---- Static awards ----
    award_map = _build_award_map()  # wikipedia_name → {award: True}
    result: dict[str, dict] = defaultdict(dict)
    for wiki_name, awards in award_map.items():
        target = wiki_name if wiki_name in name_set else None
        if target is None:
            m = fuzzy_match_player(wiki_name, name_cands, threshold=88)
            if m:
                target = m['name']
        if target:
            for k, v in awards.items():
                result[target][k] = v

    # ---- Wikipedia All-Pro (2020-2024 seasons) ----
    all_seasons = sorted({
        int(yr) for yr in
        [p.get('_draftYear', 0) for p in prospects]
        if yr
    })
    # Fetch every season from earliest draft year through current
    from datetime import datetime
    current_year = datetime.now().year
    # All-Pro is announced in January; fetch up to previous season
    seasons_to_fetch = list(range(
        min(all_seasons) if all_seasons else 2020,
        current_year,    # current season's All-Pro not yet announced
    ))

    logger.info(f'Fetching AP All-Pro pages for seasons: {seasons_to_fetch}')
    for season in seasons_to_fetch:
        season_data = _fetch_allpro_year(season)
        if not season_data:
            continue
        logger.info(f'  {season}: {len(season_data)} All-Pro selections found')
        for wiki_name, counts in season_data.items():
            target = wiki_name if wiki_name in name_set else None
            if target is None:
                m = fuzzy_match_player(wiki_name, name_cands, threshold=88)
                if m:
                    target = m['name']
            if target:
                for key in ('allpro1', 'allpro2', 'allpro1_st', 'allpro2_st'):
                    result[target][key] = result[target].get(key, 0) + counts.get(key, 0)

    # ---- Wikipedia Pro Bowl (count selections per player) ----
    logger.info(f'Fetching Pro Bowl pages for seasons: {seasons_to_fetch}')
    for season in seasons_to_fetch:
        pb_names = _fetch_probowl_year(season)
        if not pb_names:
            continue
        for wiki_name in pb_names:
            target = wiki_name if wiki_name in name_set else None
            if target is None:
                m = fuzzy_match_player(wiki_name, name_cands, threshold=88)
                if m:
                    target = m['name']
            if target:
                result[target]['probowl'] = result[target].get('probowl', 0) + 1

    # Clean up: remove zero counts
    cleaned = {}
    for name, acc in result.items():
        out = {}
        for k, v in acc.items():
            if v:  # drop False/0
                out[k] = v
        if out:
            cleaned[name] = out

    logger.info(f'Accolades found for {len(cleaned)} prospects')
    return cleaned


if __name__ == '__main__':
    import sys
    sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    test = [
        {'name': 'Justin Herbert',  '_draftYear': 2020},
        {'name': 'Chase Young',     '_draftYear': 2020},
        {'name': "Ja'Marr Chase",   '_draftYear': 2021},
        {'name': 'Micah Parsons',   '_draftYear': 2021},
        {'name': 'Justin Jefferson','_draftYear': 2020},
        {'name': 'C.J. Stroud',     '_draftYear': 2023},
    ]
    data = fetch_nfl_accolades(test)
    for name, acc in sorted(data.items()):
        print(f'{name}: {acc}')
