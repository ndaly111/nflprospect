"""
Build free agency / transaction data from nflverse CSVs + ESPN transactions API.

Data sources:
1. nflverse player_stats_season.csv — detects team changes between seasons
2. nflverse trades.csv — trade data with pick compensation
3. nflverse historical_contracts.csv.gz — OverTheCap contract data
4. nflverse players.csv — player bio/position info
5. ESPN transactions API — real-time signings/trades/releases (--live mode)

Cross-references draft_history.json for tier assignments.
Writes public/data/free_agency.json keyed by year.
"""
import gzip
import io
import json
import logging
import math
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from utils import normalize_name, fuzzy_match_player

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

# ── URLs ─────────────────────────────────────────────────────────────────────
PLAYER_STATS_URL   = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_season.csv'
PLAYER_STATS_DEF_URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def_season.csv'
CONTRACTS_URL      = 'https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.csv.gz'
TRADES_URL         = 'https://github.com/nflverse/nflverse-data/releases/download/trades/trades.csv'
PLAYERS_URL        = 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv'

DATA_DIR = Path(__file__).resolve().parent.parent / 'public' / 'data'

# ── Mappings ─────────────────────────────────────────────────────────────────
TEAM_ABBREV_MAP = {
    'GNB': 'GB', 'KAN': 'KC', 'LVR': 'LV', 'NOR': 'NO',
    'NWE': 'NE', 'SFO': 'SF', 'TAM': 'TB', 'OAK': 'LV',
    'STL': 'LAR', 'SDG': 'LAC', 'SD': 'LAC',
}

# OTC uses full team names; map to abbreviations
OTC_TEAM_MAP = {
    'Cardinals': 'ARI', 'Falcons': 'ATL', 'Ravens': 'BAL', 'Bills': 'BUF',
    'Panthers': 'CAR', 'Bears': 'CHI', 'Bengals': 'CIN', 'Browns': 'CLE',
    'Cowboys': 'DAL', 'Broncos': 'DEN', 'Lions': 'DET', 'Packers': 'GB',
    'Texans': 'HOU', 'Colts': 'IND', 'Jaguars': 'JAX', 'Chiefs': 'KC',
    'Chargers': 'LAC', 'Rams': 'LAR', 'Raiders': 'LV', 'Dolphins': 'MIA',
    'Vikings': 'MIN', 'Patriots': 'NE', 'Saints': 'NO', 'Giants': 'NYG',
    'Jets': 'NYJ', 'Eagles': 'PHI', 'Steelers': 'PIT', 'Seahawks': 'SEA',
    '49ers': 'SF', 'Buccaneers': 'TB', 'Titans': 'TEN', 'Commanders': 'WAS',
    'Redskins': 'WAS', 'Washington': 'WAS', 'Football Team': 'WAS',
}

POS_GROUP_MAP = {
    'QB': 'QB', 'RB': 'RB', 'FB': 'RB',
    'WR': 'WR', 'TE': 'TE',
    'OT': 'OL', 'T': 'OL', 'OG': 'OL', 'G': 'OL', 'C': 'OL', 'IOL': 'OL', 'OL': 'OL',
    'DT': 'DL', 'NT': 'DL', 'DL': 'DL',
    'DE': 'EDGE', 'EDGE': 'EDGE', 'OLB': 'EDGE',
    'ILB': 'LB', 'MLB': 'LB', 'LB': 'LB',
    'CB': 'DB', 'S': 'DB', 'FS': 'DB', 'SS': 'DB', 'DB': 'DB',
}

# Approximate pre-FA cap space by year (for major teams; rough estimates)
CAP_SPACE_BY_YEAR = {}  # Will be populated for manually known years

# ── Helpers ──────────────────────────────────────────────────────────────────

def norm_team(abbrev):
    """Normalize team abbreviation."""
    if not abbrev or (isinstance(abbrev, float) and math.isnan(abbrev)):
        return None
    a = str(abbrev).strip().upper()
    return TEAM_ABBREV_MAP.get(a, a)


def norm_otc_team(name):
    """Convert OTC team name (e.g. 'Packers') to abbreviation."""
    if not name or (isinstance(name, float) and math.isnan(name)):
        return None
    return OTC_TEAM_MAP.get(str(name).strip(), None)


def pos_group(pos):
    if not pos or (isinstance(pos, float) and math.isnan(pos)):
        return None
    return POS_GROUP_MAP.get(str(pos).strip().upper(), None)


def safe_int(val):
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def safe_float(val, ndigits=1):
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return None
    try:
        return round(float(val), ndigits)
    except (ValueError, TypeError):
        return None


def make_id(name, pos, suffix):
    slug = normalize_name(f"{name} {pos} {suffix}")
    return slug.replace(' ', '-')


# ── Data Loading ─────────────────────────────────────────────────────────────

def load_player_stats():
    """Load offense + defense season stats into a dict keyed by (player_id, season)."""
    logger.info('Fetching player_stats_season.csv ...')
    off = pd.read_csv(PLAYER_STATS_URL)
    off = off[off['season_type'] == 'REG']

    logger.info('Fetching player_stats_def_season.csv ...')
    defn = pd.read_csv(PLAYER_STATS_DEF_URL)
    defn = defn[defn['season_type'] == 'REG']

    stats = {}
    for _, r in off.iterrows():
        pid = r.get('player_id', '')
        season = int(r.get('season', 0))
        if not pid or not season:
            continue
        stats[(pid, season)] = {
            'name': r.get('player_display_name', ''),
            'position': r.get('position', ''),
            'positionGroup': r.get('position_group', ''),
            'team': norm_team(r.get('recent_team', '')),
            'games': safe_int(r.get('games')),
            'passYds': safe_int(r.get('passing_yards')),
            'passTD': safe_int(r.get('passing_tds')),
            'int': safe_int(r.get('interceptions')),
            'rushYds': safe_int(r.get('rushing_yards')),
            'rushTD': safe_int(r.get('rushing_tds')),
            'rec': safe_int(r.get('receptions')),
            'recYds': safe_int(r.get('receiving_yards')),
            'recTD': safe_int(r.get('receiving_tds')),
            'sacks': None,  # offense stats don't have sacks
            'tackles': None,
        }

    for _, r in defn.iterrows():
        pid = r.get('player_id', '')
        season = int(r.get('season', 0))
        if not pid or not season:
            continue
        key = (pid, season)
        if key not in stats:
            stats[key] = {
                'name': r.get('player_display_name', ''),
                'position': r.get('position', ''),
                'positionGroup': r.get('position_group', ''),
                'team': norm_team(r.get('recent_team', '')),
                'games': safe_int(r.get('games')),
            }
        stats[key]['sacks'] = safe_float(r.get('def_sacks'))
        stats[key]['tackles'] = safe_int(r.get('def_tackles'))
        stats[key]['tfl'] = safe_int(r.get('def_tackles_for_loss'))
        stats[key].setdefault('int', None)
        if safe_int(r.get('def_interceptions')):
            stats[key]['int'] = safe_int(r.get('def_interceptions'))
        stats[key]['pd'] = safe_int(r.get('def_pass_defended'))

    return stats


def load_players():
    """Load players.csv for bio info."""
    logger.info('Fetching players.csv ...')
    df = pd.read_csv(PLAYERS_URL, low_memory=False)
    players = {}
    for _, r in df.iterrows():
        gsis = r.get('gsis_id', '')
        if not gsis or (isinstance(gsis, float) and math.isnan(gsis)):
            continue
        players[gsis] = {
            'name': r.get('display_name', ''),
            'position': str(r.get('position', '')),
            'positionGroup': str(r.get('position_group', '')),
            'birth_date': str(r.get('birth_date', '')),
            'college': str(r.get('college_name', '')),
            'draft_year': safe_int(r.get('draft_year')),
            'draft_round': safe_int(r.get('draft_round')),
            'draft_pick': safe_int(r.get('draft_pick')),
            'latest_team': norm_team(r.get('latest_team', '')),
            'years_exp': safe_int(r.get('years_of_experience')),
            'pfr_id': str(r.get('pfr_id', '')),
        }
    return players


def load_contracts():
    """Load historical contracts from OTC via nflverse.
    Returns two dicts:
      - contracts: normalized_name → latest contract (for backward compat)
      - contracts_by_year: (normalized_name, year_signed) → contract
    """
    logger.info('Fetching historical_contracts.csv.gz ...')
    resp = requests.get(CONTRACTS_URL, timeout=30)
    resp.raise_for_status()
    buf = io.BytesIO(resp.content)
    with gzip.open(buf, 'rt') as f:
        df = pd.read_csv(f)

    contracts = {}
    contracts_by_year = {}
    for _, r in df.iterrows():
        name = str(r.get('player', '')).strip()
        team = norm_otc_team(r.get('team', ''))
        year_signed = safe_int(r.get('year_signed'))
        if not name or not year_signed:
            continue

        key = normalize_name(name)
        entry = {
            'team': team,
            'year_signed': year_signed,
            'years': safe_int(r.get('years')),
            'totalValue': safe_int(r.get('value')),
            'aav': safe_int(r.get('apy')),
            'guaranteed': safe_int(r.get('guaranteed')),
        }

        # Store latest contract per player
        if key not in contracts or year_signed > contracts[key].get('year_signed', 0):
            contracts[key] = entry

        # Store every contract by (name, year_signed) for year-specific lookups
        contracts_by_year[(key, year_signed)] = entry

    return contracts, contracts_by_year


def load_trades():
    """Load trades from nflverse."""
    logger.info('Fetching trades.csv ...')
    df = pd.read_csv(TRADES_URL)

    # Group by trade_id to reconstruct full trades
    trades_by_id = defaultdict(list)
    for _, r in df.iterrows():
        tid = r.get('trade_id')
        if not tid:
            continue
        trades_by_id[tid].append(r)

    trades = []
    for tid, rows in trades_by_id.items():
        season = safe_int(rows[0].get('season'))
        date = str(rows[0].get('trade_date', ''))

        # Find player rows (those with pfr_name)
        for r in rows:
            pfr_name = str(r.get('pfr_name', '')).strip()
            if not pfr_name or pfr_name == 'nan':
                continue

            # Skip draft-pick trades: when a player row also has pick_round,
            # the "trade" is really a pick swap — the player was drafted, not traded
            pick_round = safe_int(r.get('pick_round'))
            if pick_round is not None:
                continue

            gave = norm_team(r.get('gave', ''))
            received = norm_team(r.get('received', ''))

            # The team that "gave" the player is the fromTeam
            # The team that "received" the player is the toTeam
            # But in nflverse trades, "gave" = team giving asset, "received" = team receiving
            # For a player: "gave"=PHI means PHI gave up the player, "received"=BUF means BUF got them
            trades.append({
                'season': season,
                'date': date,
                'pfr_name': pfr_name,
                'pfr_id': str(r.get('pfr_id', '')),
                'fromTeam': gave,      # team giving up the player
                'toTeam': received,     # team receiving the player
                'trade_id': tid,
            })

            # Collect picks/assets in this trade for context
            pick_details = []
            for rr in rows:
                if rr.get('trade_id') != tid:
                    continue
                pick_round = safe_int(rr.get('pick_round'))
                pick_season = safe_int(rr.get('pick_season'))
                # Only show what the receiving team sent back
                if norm_team(rr.get('gave')) == received and pick_round:
                    pick_details.append(f"{pick_season} round {pick_round} pick")
            if pick_details:
                trades[-1]['tradeDetails'] = {
                    'fromGives': [pfr_name],
                    'toGives': pick_details,
                }

    return trades


def load_draft_history():
    """Load existing draft_history.json for tier cross-reference."""
    path = DATA_DIR / 'draft_history.json'
    if not path.exists():
        logger.warning('draft_history.json not found; tiers will be estimated')
        return {}

    with open(path) as f:
        data = json.load(f)

    # Build lookup: normalized name → tier
    tiers = {}
    for year, players in data.items():
        for p in players:
            key = normalize_name(p.get('name', ''))
            grade = p.get('draftGrade', {})
            if grade and grade.get('tier'):
                tiers[key] = grade['tier']
    return tiers


def estimate_tier_from_contract(aav, pos_group):
    """Estimate tier from AAV when draft history tier is unavailable."""
    if not aav:
        return None

    # Position-specific AAV thresholds for tier estimation
    thresholds = {
        'QB':   {'elite': 35000000, 'starter': 15000000},
        'WR':   {'elite': 20000000, 'starter': 10000000},
        'EDGE': {'elite': 20000000, 'starter': 10000000},
        'DB':   {'elite': 16000000, 'starter': 8000000},
        'DL':   {'elite': 16000000, 'starter': 8000000},
        'OL':   {'elite': 16000000, 'starter': 8000000},
        'RB':   {'elite': 12000000, 'starter': 6000000},
        'TE':   {'elite': 12000000, 'starter': 6000000},
        'LB':   {'elite': 14000000, 'starter': 7000000},
    }
    t = thresholds.get(pos_group, {'elite': 15000000, 'starter': 7000000})

    if aav >= t['elite']:
        return 'Elite'
    if aav >= t['starter']:
        return 'Starter'
    # Any player with $10M+ AAV is at least a Starter regardless of position
    if aav >= 10000000:
        return 'Starter'
    # $5M+ AAV is at least a solid Backup, but we return None to let
    # stats-based estimation have a say
    if aav >= 5000000:
        return 'Starter'
    return None


def estimate_tier_from_stats(last_stats, pg):
    """Estimate tier from last-season production stats."""
    if not last_stats:
        return None

    games = last_stats.get('games', 0) or 0

    # Position-specific production thresholds
    if pg == 'QB':
        yds = last_stats.get('passYds', 0) or 0
        td = last_stats.get('passTD', 0) or 0
        if yds >= 4000 or td >= 25:
            return 'Elite'
        if yds >= 3000 or td >= 15:
            return 'Starter'
        if yds >= 1500 or td >= 8:
            return 'Starter'
        if games >= 8:
            return 'Backup'
        return None

    if pg == 'RB':
        yds = (last_stats.get('rushYds', 0) or 0) + (last_stats.get('recYds', 0) or 0)
        if yds >= 1200:
            return 'Elite'
        if yds >= 600:
            return 'Starter'
        if games >= 12:
            return 'Starter'
        if games >= 8:
            return 'Backup'
        return None

    if pg == 'WR':
        yds = last_stats.get('recYds', 0) or 0
        rec = last_stats.get('rec', 0) or 0
        if yds >= 1000:
            return 'Elite'
        if yds >= 500 or rec >= 40:
            return 'Starter'
        if games >= 12 and (yds >= 300 or rec >= 25):
            return 'Starter'
        if games >= 8:
            return 'Backup'
        return None

    if pg == 'TE':
        yds = last_stats.get('recYds', 0) or 0
        rec = last_stats.get('rec', 0) or 0
        if yds >= 700:
            return 'Elite'
        if yds >= 350 or rec >= 30:
            return 'Starter'
        if games >= 12:
            return 'Starter'
        if games >= 8:
            return 'Backup'
        return None

    if pg == 'EDGE':
        sacks = last_stats.get('sacks', 0) or 0
        tfl = last_stats.get('tfl', 0) or 0
        tkl = last_stats.get('tackles', 0) or 0
        if sacks >= 10:
            return 'Elite'
        if sacks >= 5 or (sacks >= 3 and tfl >= 5):
            return 'Starter'
        if games >= 12 and (sacks >= 2 or tkl >= 20):
            return 'Starter'
        if games >= 8:
            return 'Backup'
        return None

    if pg == 'DL':
        tkl = last_stats.get('tackles', 0) or 0
        sacks = last_stats.get('sacks', 0) or 0
        tfl = last_stats.get('tfl', 0) or 0
        if tkl >= 50 or sacks >= 6:
            return 'Elite'
        if tkl >= 25 or sacks >= 3 or tfl >= 5:
            return 'Starter'
        if games >= 12:
            return 'Starter'
        if games >= 8:
            return 'Backup'
        return None

    if pg == 'LB':
        tkl = last_stats.get('tackles', 0) or 0
        if tkl >= 100:
            return 'Elite'
        if tkl >= 50:
            return 'Starter'
        if games >= 12:
            return 'Starter'
        if games >= 8:
            return 'Backup'
        return None

    if pg == 'DB':
        tkl = last_stats.get('tackles', 0) or 0
        ints = last_stats.get('int', 0) or 0
        pds = last_stats.get('pd', 0) or 0
        if tkl >= 60 or ints >= 4:
            return 'Elite'
        if tkl >= 35 or ints >= 2 or pds >= 8:
            return 'Starter'
        if games >= 12:
            return 'Starter'
        if games >= 8:
            return 'Backup'
        return None

    # OL and others
    if games >= 12:
        return 'Starter'
    if games >= 8:
        return 'Starter'
    return None


def calc_age(birth_date_str, ref_date_str):
    """Calculate age from birth date string."""
    try:
        bd = datetime.strptime(birth_date_str, '%Y-%m-%d')
        ref = datetime.strptime(ref_date_str, '%Y-%m-%d')
        age = ref.year - bd.year
        if (ref.month, ref.day) < (bd.month, bd.day):
            age -= 1
        return age
    except (ValueError, TypeError):
        return None


# ── ESPN Transactions API ─────────────────────────────────────────────────────

# ESPN team ID → standard abbreviation
ESPN_TEAM_ID_MAP = {
    '1': 'ATL', '2': 'BUF', '3': 'CHI', '4': 'CIN', '5': 'CLE',
    '6': 'DAL', '7': 'DEN', '8': 'DET', '9': 'GB', '10': 'TEN',
    '11': 'IND', '12': 'KC', '13': 'LV', '14': 'LAR', '15': 'MIA',
    '16': 'MIN', '17': 'NE', '18': 'NO', '19': 'NYG', '20': 'NYJ',
    '21': 'PHI', '22': 'ARI', '23': 'PIT', '24': 'LAC', '25': 'SF',
    '26': 'SEA', '27': 'TB', '28': 'WAS', '29': 'CAR', '30': 'JAX',
    '33': 'BAL', '34': 'HOU',
}

ESPN_TEAM_SLUG_MAP = {
    'arizona': 'ARI', 'atlanta': 'ATL', 'baltimore': 'BAL', 'buffalo': 'BUF',
    'carolina': 'CAR', 'chicago': 'CHI', 'cincinnati': 'CIN', 'cleveland': 'CLE',
    'dallas': 'DAL', 'denver': 'DEN', 'detroit': 'DET', 'green-bay': 'GB',
    'houston': 'HOU', 'indianapolis': 'IND', 'jacksonville': 'JAX', 'kansas-city': 'KC',
    'las-vegas': 'LV', 'la-chargers': 'LAC', 'la-rams': 'LAR', 'miami': 'MIA',
    'minnesota': 'MIN', 'new-england': 'NE', 'new-orleans': 'NO', 'ny-giants': 'NYG',
    'ny-jets': 'NYJ', 'philadelphia': 'PHI', 'pittsburgh': 'PIT', 'san-francisco': 'SF',
    'seattle': 'SEA', 'tampa-bay': 'TB', 'tennessee': 'TEN', 'washington': 'WAS',
}

# Transaction types in ESPN API that correspond to notable FA moves
SIGNING_KEYWORDS = ['signed', 'contract', 'agreed to terms', 're-signed', 'extended']
TRADE_KEYWORDS = ['traded', 'acquired via trade']
RELEASE_KEYWORDS = ['released', 'waived', 'cut']


def fetch_espn_transactions(year, players_info=None, tier_lookup=None, stats=None):
    """
    Fetch real-time transactions from ESPN's league-wide transactions endpoint.
    Paginates through all pages and filters by date to match the requested year.
    Returns a list of transaction dicts compatible with our schema.
    """
    logger.info(f'Fetching ESPN transactions (league-wide) for {year}...')
    transactions = []
    seen = set()

    # The ESPN league-wide endpoint returns current offseason transactions
    # paginated, 25 per page. We fetch all pages and filter by date.
    base_url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/transactions'
    page = 1
    total_raw = 0

    while True:
        try:
            resp = requests.get(f'{base_url}?page={page}', timeout=15)
            if resp.status_code != 200:
                logger.debug(f'  ESPN transactions page {page}: HTTP {resp.status_code}')
                break
            data = resp.json()
        except Exception as e:
            logger.debug(f'  ESPN transactions page {page}: failed ({e})')
            break

        items = data.get('transactions', [])
        if not items:
            break

        page_count = data.get('pageCount', page)

        for item in items:
            description = item.get('description', item.get('text', ''))
            date_str = item.get('date', '')
            abbrev = item.get('team', {}).get('abbreviation', '')

            if not description or not abbrev:
                continue

            # Parse date and filter to requested year's offseason window
            # NFL free agency for year Y runs roughly from March Y to late August Y
            tx_date_str = f'{year}-03-15'
            if date_str:
                try:
                    dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    tx_date_str = dt.strftime('%Y-%m-%d')
                    # Filter: only include transactions from the target year
                    if dt.year != year:
                        continue
                except (ValueError, TypeError):
                    pass

            total_raw += 1

            # ESPN descriptions can contain multiple players:
            # "Re-signed DE LaBryan Ray and OLB Thomas Incoom. Signed CB Robert Rochell..."
            # Split on sentence boundaries and common conjunctions
            segments = re.split(r'\.\s+', description)

            for segment in segments:
                if not segment.strip():
                    continue

                # Extract all "Position PlayerName" pairs from this segment
                pos_pattern = r'\b(QB|RB|WR|TE|OT|OG|OL|C|DE|DT|NT|OLB|ILB|MLB|LB|CB|S|FS|SS|K|P|LS)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z\'.,-]+)+)'
                matches = re.findall(pos_pattern, segment)
                if not matches:
                    continue

                seg_lower = segment.lower()

                # Determine transaction type from this segment
                if any(kw in seg_lower for kw in TRADE_KEYWORDS):
                    tx_type = 'trade'
                elif any(kw in seg_lower for kw in SIGNING_KEYWORDS):
                    if 're-sign' in seg_lower or 'extend' in seg_lower:
                        tx_type = 'extension'
                    else:
                        tx_type = 'signing'
                elif any(kw in seg_lower for kw in RELEASE_KEYWORDS):
                    continue  # Skip releases
                else:
                    continue

                for position, player_name in matches:
                    player_name = player_name.strip().rstrip('.,')

                    name_norm = normalize_name(player_name)
                    dedup_key = (name_norm, tx_type)
                    if dedup_key in seen:
                        continue
                    seen.add(dedup_key)

                    pg = pos_group(position) if position else None
                    if not pg or pg in ('K', 'P', 'LS'):
                        continue

                    # Determine from/to teams
                    if tx_type == 'extension':
                        from_team = abbrev
                        to_team = abbrev
                    elif tx_type == 'trade':
                        # Check description for direction
                        if re.search(r'\btraded\b.*\bto\b', seg_lower):
                            from_team = abbrev
                            to_team = None
                        elif re.search(r'\bacquired\b|\btraded for\b|\bobtained\b', seg_lower):
                            to_team = abbrev
                            from_team = None
                        else:
                            to_team = abbrev
                            from_team = None
                    else:
                        to_team = abbrev
                        from_team = None

                    # Look up tier
                    tier = None
                    if tier_lookup:
                        tier = tier_lookup.get(name_norm)
                        if not tier:
                            candidates = [{'name': k} for k in tier_lookup.keys()]
                            m = fuzzy_match_player(player_name, candidates, threshold=90)
                            if m:
                                tier = tier_lookup.get(m['name'])

                    # Look up last season stats
                    last_stats = {}
                    if stats:
                        for (pid, season), sdata in stats.items():
                            if normalize_name(str(sdata.get('name', '') or '')) == name_norm and season == year - 1:
                                for key in ['games', 'passYds', 'passTD', 'int', 'rushYds', 'rushTD',
                                            'rec', 'recYds', 'recTD', 'sacks', 'tackles', 'tfl', 'pd']:
                                    val = sdata.get(key)
                                    if val is not None:
                                        last_stats[key] = val
                                if from_team is None and tx_type == 'signing':
                                    from_team = sdata.get('team')
                                break

                    # Estimate tier
                    if not tier:
                        tier = estimate_tier_from_stats(last_stats, pg)
                    if not tier and tx_type == 'trade':
                        tier = 'Starter'
                    if not tier:
                        games = last_stats.get('games', 0) or 0
                        tier = 'Starter' if games >= 12 else 'Backup'

                    # Get age from players_info
                    age = None
                    if players_info:
                        for pid, pinfo in players_info.items():
                            if normalize_name(pinfo.get('name', '')) == name_norm:
                                age = calc_age(pinfo.get('birth_date', ''), f'{year}-03-15')
                                if from_team is None and tx_type == 'signing':
                                    lt = pinfo.get('latest_team')
                                    if lt and lt != to_team:
                                        from_team = lt
                                break

                    tx_id = make_id(player_name, pg, f'{tx_type}-espn-{year}')
                    tx = {
                        'id': tx_id,
                        'type': tx_type,
                        'name': player_name,
                        'position': position or '',
                        'positionGroup': pg,
                        'fromTeam': from_team,
                        'toTeam': to_team,
                        'tier': tier,
                        'age': age,
                        'date': tx_date_str,
                        'lastSeasonStats': last_stats,
                    }
                    transactions.append(tx)

        if page >= page_count:
            break
        page += 1
        time.sleep(0.3)  # Rate limit

    logger.info(f'  ESPN: found {len(transactions)} transactions for {year}')
    return transactions


# ── Main Builder ─────────────────────────────────────────────────────────────

def detect_team_changes(stats, players_info):
    """
    Detect when a player's team changed between seasons.
    Returns list of {season, player_id, name, position, positionGroup,
                     fromTeam, toTeam, lastSeasonStats}.
    """
    # Group stats by player_id
    by_player = defaultdict(dict)
    for (pid, season), data in stats.items():
        by_player[pid][season] = data

    changes = []
    for pid, seasons in by_player.items():
        sorted_seasons = sorted(seasons.keys())
        for i in range(1, len(sorted_seasons)):
            prev_season = sorted_seasons[i - 1]
            curr_season = sorted_seasons[i]

            # Only consider consecutive seasons (gap of 1)
            if curr_season - prev_season > 1:
                continue

            prev_data = seasons[prev_season]
            curr_data = seasons[curr_season]
            prev_team = prev_data.get('team')
            curr_team = curr_data.get('team')

            if not prev_team or not curr_team:
                continue
            if prev_team == curr_team:
                continue
            # Skip players with trivial involvement (< 3 games)
            if (prev_data.get('games') or 0) < 3:
                continue

            # This player changed teams
            pg = pos_group(prev_data.get('position') or prev_data.get('positionGroup', ''))
            if not pg:
                # Try from players info
                pinfo = players_info.get(pid, {})
                pg = pos_group(pinfo.get('position', ''))
            if not pg or pg in ('K', 'P', 'LS'):
                continue  # Skip special teams

            # Build last season stats (from prev_season, the season before they moved)
            last_stats = {}
            for key in ['games', 'passYds', 'passTD', 'int', 'rushYds', 'rushTD',
                        'rec', 'recYds', 'recTD', 'sacks', 'tackles', 'tfl', 'pd']:
                val = prev_data.get(key)
                if val is not None:
                    last_stats[key] = val

            name = prev_data.get('name', '')
            pinfo = players_info.get(pid, {})
            age = calc_age(pinfo.get('birth_date', ''), f'{curr_season}-03-15')

            changes.append({
                'season': curr_season,  # The year they joined the new team
                'player_id': pid,
                'name': name,
                'position': prev_data.get('position', ''),
                'positionGroup': pg,
                'fromTeam': prev_team,
                'toTeam': curr_team,
                'lastSeasonStats': last_stats,
                'age': age,
            })

    return changes


def detect_extensions(stats, players_info, contracts_by_year):
    """
    Detect when a player re-signs with the same team (extension).
    Uses contract data: if a player has a contract signed for year Y and their
    team in year Y-1 matches the contract team, it's an extension.
    Returns list of extension dicts.
    """
    # Group stats by player_id
    by_player = defaultdict(dict)
    for (pid, season), data in stats.items():
        by_player[pid][season] = data

    extensions = []
    for pid, seasons in by_player.items():
        sorted_seasons = sorted(seasons.keys())
        for i in range(1, len(sorted_seasons)):
            prev_season = sorted_seasons[i - 1]
            curr_season = sorted_seasons[i]

            if curr_season - prev_season > 1:
                continue

            prev_data = seasons[prev_season]
            curr_data = seasons[curr_season]
            prev_team = prev_data.get('team')
            curr_team = curr_data.get('team')

            if not prev_team or not curr_team:
                continue
            # Only extensions: player stays with same team
            if prev_team != curr_team:
                continue
            # Must have meaningful playing time
            if (prev_data.get('games') or 0) < 8:
                continue

            name = prev_data.get('name', '')
            name_norm = normalize_name(name)

            # Check if there's a contract signed for this year (or ±1 year)
            contract = None
            for check_year in [curr_season, curr_season - 1]:
                c = contracts_by_year.get((name_norm, check_year))
                if c and c.get('team') == curr_team:
                    contract = c
                    break

            # Only include if we have contract evidence of a re-signing
            if not contract:
                continue

            pg = pos_group(prev_data.get('position') or prev_data.get('positionGroup', ''))
            if not pg:
                pinfo = players_info.get(pid, {})
                pg = pos_group(pinfo.get('position', ''))
            if not pg or pg in ('K', 'P', 'LS'):
                continue

            last_stats = {}
            for key in ['games', 'passYds', 'passTD', 'int', 'rushYds', 'rushTD',
                        'rec', 'recYds', 'recTD', 'sacks', 'tackles', 'tfl', 'pd']:
                val = prev_data.get(key)
                if val is not None:
                    last_stats[key] = val

            pinfo = players_info.get(pid, {})
            age = calc_age(pinfo.get('birth_date', ''), f'{curr_season}-03-15')

            extensions.append({
                'season': curr_season,
                'player_id': pid,
                'name': name,
                'position': prev_data.get('position', ''),
                'positionGroup': pg,
                'fromTeam': curr_team,
                'toTeam': curr_team,
                'lastSeasonStats': last_stats,
                'age': age,
                'contract': {
                    'years': contract.get('years'),
                    'totalValue': contract.get('totalValue'),
                    'aav': contract.get('aav'),
                },
            })

    return extensions


def build_free_agency(years=None, live=False):
    """Build free agency data for specified years.
    If live=True, also fetches real-time ESPN transactions for the current year.
    """
    now = datetime.now(timezone.utc)
    current_year = now.year

    if years is None:
        years = list(range(2020, current_year + 1))

    # In live mode, ensure the current year is in the list
    if live and current_year not in years:
        years.append(current_year)

    # Load all data sources
    stats = load_player_stats()
    players_info = load_players()
    contracts, contracts_by_year = load_contracts()
    trade_list = load_trades()
    tier_lookup = load_draft_history()

    # Fetch live ESPN transactions for recent years if requested
    espn_transactions = {}
    if live:
        # Always fetch current year
        for fetch_year in [current_year - 1, current_year]:
            if fetch_year not in years:
                continue
            logger.info(f'Live mode: fetching ESPN transactions for {fetch_year}')
            espn_txs = fetch_espn_transactions(fetch_year, players_info, tier_lookup, stats)
            if espn_txs:
                espn_transactions[fetch_year] = espn_txs

    # Detect team changes from stats
    team_changes = detect_team_changes(stats, players_info)
    logger.info(f'Detected {len(team_changes)} team changes across all seasons')

    # Detect extensions (re-signings with same team)
    extension_list = detect_extensions(stats, players_info, contracts_by_year)
    logger.info(f'Detected {len(extension_list)} extensions across all seasons')

    # Build trade lookup: (normalized_name, season) → trade info
    trade_lookup = {}
    for t in trade_list:
        key = (normalize_name(t['pfr_name']), t['season'])
        trade_lookup[key] = t

    # Load existing manual data (preserve manually curated entries)
    existing_path = DATA_DIR / 'free_agency.json'
    existing = {}
    if existing_path.exists():
        with open(existing_path) as f:
            existing = json.load(f)

    result = {}

    for year in years:
        logger.info(f'Building free agency data for {year} ...')
        year_str = str(year)

        # Only preserve existing ESPN-sourced data for the current live year
        # (all other years are fully rebuilt from nflverse + stats data)
        if year_str in existing and year == current_year:
            existing_year = existing[year_str]
            existing_ids = {tx['id'] for tx in existing_year.get('transactions', [])}
        else:
            existing_year = {'teamCap': {}, 'transactions': []}
            existing_ids = set()

        transactions = list(existing_year.get('transactions', []))

        # Get team changes for this year
        year_changes = [c for c in team_changes if c['season'] == year]
        logger.info(f'  {len(year_changes)} team changes detected for {year}')

        # Get trades for this year
        year_trades = [t for t in trade_list if t['season'] == year]

        # Process team changes (FA signings)
        for change in year_changes:
            name_norm = normalize_name(change['name'])
            tx_id = make_id(change['name'], change['positionGroup'], str(year))

            # Skip if already in existing data
            if tx_id in existing_ids:
                continue

            # Check if this was a trade
            trade_key = (name_norm, year)
            is_trade = False
            trade_info = None
            # Also check pfr_id matching
            for t in year_trades:
                if normalize_name(t['pfr_name']) == name_norm:
                    is_trade = True
                    trade_info = t
                    break

            # Look up tier
            tier = tier_lookup.get(name_norm)
            if not tier:
                # Try fuzzy match
                candidates = [{'name': k} for k in tier_lookup.keys()]
                match = fuzzy_match_player(change['name'], candidates, threshold=90)
                if match:
                    tier = tier_lookup.get(match['name'])

            # Look up contract info — check year-specific contracts first
            contract = None
            for check_year in [year, year - 1]:
                c_data = contracts_by_year.get((name_norm, check_year))
                if c_data:
                    contract = {
                        'years': c_data['years'],
                        'totalValue': c_data['totalValue'],
                        'aav': c_data['aav'],
                    }
                    break
            # Fallback to latest contract if within range
            if not contract:
                c_data = contracts.get(name_norm)
                if c_data and c_data.get('year_signed') and abs(c_data['year_signed'] - year) <= 1:
                    contract = {
                        'years': c_data['years'],
                        'totalValue': c_data['totalValue'],
                        'aav': c_data['aav'],
                    }

            # Estimate tier from contract or stats if needed
            if not tier:
                aav = contract['aav'] if contract else None
                tier = estimate_tier_from_contract(aav, change['positionGroup'])
            if not tier:
                tier = estimate_tier_from_stats(change['lastSeasonStats'], change['positionGroup'])
            # Traded players are generally at least Starters — teams don't trade for Backups
            if not tier and is_trade:
                tier = 'Starter'
            # Final fallback
            if not tier:
                # If they played 12+ games, likely a Starter; otherwise Backup
                games = (change['lastSeasonStats'] or {}).get('games', 0) or 0
                tier = 'Starter' if games >= 12 else 'Backup'

            tx = {
                'id': tx_id,
                'type': 'trade' if is_trade else 'signing',
                'name': change['name'],
                'position': change['position'],
                'positionGroup': change['positionGroup'],
                'fromTeam': change['fromTeam'],
                'toTeam': change['toTeam'],
                'tier': tier,
                'age': change['age'],
                'date': f'{year}-03-15',  # approximate FA date
                'lastSeasonStats': change['lastSeasonStats'],
            }

            if contract:
                tx['contract'] = contract

            if is_trade and trade_info:
                tx['date'] = trade_info.get('date', tx['date'])
                if 'tradeDetails' in trade_info:
                    tx['tradeDetails'] = trade_info['tradeDetails']

            transactions.append(tx)

        # Process extensions (re-signings with same team) for this year
        year_extensions = [e for e in extension_list if e['season'] == year]
        seen_names_ext = {normalize_name(tx['name']) for tx in transactions}
        ext_added = 0
        for ext in year_extensions:
            name_norm = normalize_name(ext['name'])
            if name_norm in seen_names_ext:
                continue
            tx_id = make_id(ext['name'], ext['positionGroup'], f'ext-{year}')
            if tx_id in existing_ids:
                continue

            # Look up tier
            tier = tier_lookup.get(name_norm)
            if not tier:
                aav = (ext.get('contract') or {}).get('aav')
                tier = estimate_tier_from_contract(aav, ext['positionGroup'])
            if not tier:
                tier = estimate_tier_from_stats(ext['lastSeasonStats'], ext['positionGroup'])
            if not tier:
                games = (ext.get('lastSeasonStats') or {}).get('games', 0) or 0
                tier = 'Starter' if games >= 12 else 'Backup'

            tx = {
                'id': tx_id,
                'type': 'extension',
                'name': ext['name'],
                'position': ext['position'],
                'positionGroup': ext['positionGroup'],
                'fromTeam': ext['fromTeam'],
                'toTeam': ext['toTeam'],
                'tier': tier,
                'age': ext['age'],
                'date': f'{year}-03-15',
                'lastSeasonStats': ext['lastSeasonStats'],
            }
            if ext.get('contract'):
                tx['contract'] = ext['contract']
            transactions.append(tx)
            seen_names_ext.add(name_norm)
            ext_added += 1
        if ext_added:
            logger.info(f'  Extensions: added {ext_added} for {year}')

        # Merge ESPN live transactions for this year (if available)
        if year in espn_transactions:
            espn_seen = {normalize_name(tx['name']) for tx in transactions}
            espn_txs = espn_transactions[year]
            espn_added = 0
            for etx in espn_txs:
                etx_name = normalize_name(etx['name'])
                etx_id = etx['id']
                if etx_name in espn_seen or etx_id in existing_ids:
                    continue
                transactions.append(etx)
                espn_seen.add(etx_name)
                espn_added += 1
            logger.info(f'  ESPN live: added {espn_added} new transactions for {year}')

        # Correct trade team assignments using authoritative nflverse data
        # ESPN trade parsing can assign wrong from/to teams since both the
        # acquiring and departing teams list the trade on their pages.
        tx_by_name = {normalize_name(tx['name']): tx for tx in transactions}
        for t in year_trades:
            name_norm = normalize_name(t['pfr_name'])
            existing_tx = tx_by_name.get(name_norm)
            if existing_tx and existing_tx.get('type') == 'trade':
                # nflverse has authoritative from/to — override ESPN's guess
                if t['fromTeam']:
                    existing_tx['fromTeam'] = t['fromTeam']
                if t['toTeam']:
                    existing_tx['toTeam'] = t['toTeam']
                if t.get('date'):
                    existing_tx['date'] = t['date']
                if 'tradeDetails' in t:
                    existing_tx['tradeDetails'] = t['tradeDetails']

        # Also add trades that weren't detected as team changes
        # (e.g., player was traded but didn't have stats in both seasons)
        seen_names = {normalize_name(tx['name']) for tx in transactions}
        for t in year_trades:
            name_norm = normalize_name(t['pfr_name'])
            if name_norm in seen_names:
                continue

            # Try to find player info
            pinfo = None
            for pid, info in players_info.items():
                if normalize_name(info.get('name', '')) == name_norm:
                    pinfo = info
                    break

            if not pinfo:
                continue

            pg = pos_group(pinfo.get('position', ''))
            if not pg or pg in ('K', 'P', 'LS'):
                continue

            tier = tier_lookup.get(name_norm)
            age = calc_age(pinfo.get('birth_date', ''), f'{year}-03-15')

            # Find last season stats if available
            last_stats = {}
            for (pid, season), data in stats.items():
                if normalize_name(str(data.get('name', '') or '')) == name_norm and season == year - 1:
                    for key in ['games', 'passYds', 'passTD', 'int', 'rushYds', 'rushTD',
                                'rec', 'recYds', 'recTD', 'sacks', 'tackles', 'tfl', 'pd']:
                        val = data.get(key)
                        if val is not None:
                            last_stats[key] = val
                    break

            # Estimate tier from stats if not found in draft history
            if not tier:
                tier = estimate_tier_from_stats(last_stats, pg)
            # Traded players are generally at least Starters
            if not tier:
                tier = 'Starter'

            tx_id = make_id(t['pfr_name'], pg, f'trade-{year}')
            if tx_id in existing_ids:
                continue

            tx = {
                'id': tx_id,
                'type': 'trade',
                'name': t['pfr_name'],
                'position': pinfo.get('position', ''),
                'positionGroup': pg,
                'fromTeam': t['fromTeam'],
                'toTeam': t['toTeam'],
                'tier': tier,
                'age': age,
                'date': t.get('date', f'{year}-03-15'),
                'lastSeasonStats': last_stats,
            }
            if 'tradeDetails' in t:
                tx['tradeDetails'] = t['tradeDetails']

            transactions.append(tx)
            seen_names.add(name_norm)

        # Sort by impact (rough: Elite first, then by name)
        tier_sort = {'Elite': 0, 'Starter': 1, 'Backup': 2, 'Bust': 3}
        transactions.sort(key=lambda t: (tier_sort.get(t.get('tier'), 9), t.get('name', '')))

        # Filter to keep only notable transactions (skip minor Backup moves unless trades)
        # For the current year, be lenient since we lack prior-season stats
        is_current = (year == current_year)
        notable = []
        for tx in transactions:
            # Keep all manually curated entries
            if tx['id'] in existing_ids:
                notable.append(tx)
                continue
            # Keep all trades
            if tx['type'] == 'trade':
                notable.append(tx)
                continue
            # Keep Elite and Starter signings always
            if tx.get('tier') in ('Elite', 'Starter'):
                notable.append(tx)
                continue
            # For the current year, keep all ESPN signings/extensions
            # (we can't reliably filter without prior-season stats)
            if is_current:
                notable.append(tx)
                continue
            # Keep Backup signings only if they had meaningful production
            stats_data = tx.get('lastSeasonStats', {})
            games = stats_data.get('games', 0) or 0
            if games >= 8:
                notable.append(tx)
                continue

        result[year_str] = {
            'teamCap': existing_year.get('teamCap', {}),
            'transactions': notable,
        }
        logger.info(f'  {year}: {len(notable)} notable transactions (from {len(transactions)} total)')

    return result


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Build free agency data')
    parser.add_argument('--years', nargs='+', type=int, default=None,
                        help='Specific years to build (default: 2020-current)')
    parser.add_argument('--output', type=str, default=str(DATA_DIR / 'free_agency.json'),
                        help='Output file path')
    parser.add_argument('--live', action='store_true', default=True,
                        help='Fetch real-time transactions from ESPN API (default: on)')
    parser.add_argument('--no-live', dest='live', action='store_false',
                        help='Skip ESPN API fetch')
    args = parser.parse_args()

    result = build_free_agency(args.years, live=args.live)

    # Merge with existing data (don't overwrite years we didn't rebuild)
    output_path = Path(args.output)
    if output_path.exists():
        with open(output_path) as f:
            existing = json.load(f)
        for year, data in result.items():
            existing[year] = data
        result = existing

    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)

    total = sum(len(d.get('transactions', [])) for d in result.values())
    logger.info(f'Wrote {output_path} ({len(result)} years, {total} total transactions)')


if __name__ == '__main__':
    main()
