// nflverse uses PFR-style abbreviations; ESPN CDN uses its own short codes
export const PFR_TO_ESPN = {
  GNB: 'gb', KAN: 'kc', NOR: 'no', NWE: 'ne',
  SFO: 'sf', TAM: 'tb', LVR: 'lv', WAS: 'wsh',
}

export function nflTeamLogo(abbrev, size = 'w-4 h-4') {
  if (!abbrev) return ''
  const espn = (PFR_TO_ESPN[abbrev] || abbrev).toLowerCase()
  return `<img src="https://a.espncdn.com/i/teamlogos/nfl/500/${espn}.png" class="${size} inline-block align-middle flex-shrink-0" loading="lazy" alt="" onerror="this.style.display='none'">`
}

// Full team name lookup from abbreviation
export const TEAM_NAMES = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills',
  CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns',
  DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers',
  HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs',
  LAC: 'Chargers', LAR: 'Rams', LV: 'Raiders', MIA: 'Dolphins',
  MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants',
  NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks',
  SF: '49ers', TB: 'Buccaneers', TEN: 'Titans', WAS: 'Commanders',
}

export const NFL_DIVISIONS = {
  ARI: 'NFC West', ATL: 'NFC South', BAL: 'AFC North', BUF: 'AFC East',
  CAR: 'NFC South', CHI: 'NFC North', CIN: 'AFC North', CLE: 'AFC North',
  DAL: 'NFC East', DEN: 'AFC West', DET: 'NFC North', GB: 'NFC North',
  HOU: 'AFC South', IND: 'AFC South', JAX: 'AFC South', KC: 'AFC West',
  LAC: 'AFC West', LAR: 'NFC West', LV: 'AFC West', MIA: 'AFC East',
  MIN: 'NFC North', NE: 'AFC East', NO: 'NFC South', NYG: 'NFC East',
  NYJ: 'AFC East', PHI: 'NFC East', PIT: 'AFC North', SEA: 'NFC West',
  SF: 'NFC West', TB: 'NFC South', TEN: 'AFC South', WAS: 'NFC East',
}

export const DIVISION_ORDER = [
  'AFC East', 'AFC North', 'AFC South', 'AFC West',
  'NFC East', 'NFC North', 'NFC South', 'NFC West',
]
