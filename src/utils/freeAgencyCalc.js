import { TIER_POINTS, OFFENSE_GROUPS, DEFENSE_GROUPS } from './tiers.js'
import { TEAM_NAMES } from './teams.js'

/*
 * Production multiplier: 0.75x–1.25x based on last-season stats relative to
 * position-group benchmarks.  OL (snap-based, no traditional stats) → 1.0x.
 */
const BENCHMARKS = {
  QB:   { key: 'passYds', low: 2500, high: 4000 },
  RB:   { key: 'rushYds', low: 500,  high: 1000 },
  WR:   { key: 'recYds',  low: 500,  high: 1000 },
  TE:   { key: 'recYds',  low: 300,  high: 700  },
  EDGE: { key: 'sacks',   low: 3,    high: 9    },
  DL:   { key: 'tackles',  low: 25,   high: 55   },
  LB:   { key: 'tackles',  low: 50,   high: 120  },
  DB:   { key: 'tackles',  low: 30,   high: 65   },
}

export function productionMultiplier(player) {
  const bench = BENCHMARKS[player.positionGroup]
  if (!bench) return 1.0
  const stats = player.lastSeasonStats || {}
  const val = stats[bench.key]
  if (val == null) return 1.0
  if (val >= bench.high) return 1.25
  if (val <= bench.low)  return 0.75
  // Linear interpolation between low→high → 0.75→1.25
  return 0.75 + 0.5 * ((val - bench.low) / (bench.high - bench.low))
}

export function playerImpactScore(player) {
  const base = TIER_POINTS[player.tier] || 0
  return +(base * productionMultiplier(player)).toFixed(2)
}

function emptyTeamImpact() {
  return {
    gained: [], lost: [], retained: [],
    byPosition: {},
    offense: { net: 0, gained: 0, lost: 0, retained: 0 },
    defense: { net: 0, gained: 0, lost: 0, retained: 0 },
    overall: 0,
    totalSpent: 0,
    totalLost: 0,
    netSpend: 0,
    capSpace: 0,
  }
}

function ensurePosGroup(teamData, pg) {
  if (!teamData.byPosition[pg]) {
    teamData.byPosition[pg] = { gained: 0, lost: 0, retained: 0, net: 0, players: [] }
  }
  return teamData.byPosition[pg]
}

/*
 * Build a Map<teamAbbrev, teamImpact> from a year's transactions + teamCap data.
 */
export function buildTeamImpacts(transactions, teamCap = {}) {
  const teams = new Map()

  // Seed all 32 teams so every team shows up even with zero transactions
  for (const abbrev of Object.keys(TEAM_NAMES)) {
    const t = emptyTeamImpact()
    t.capSpace = teamCap[abbrev] || 0
    teams.set(abbrev, t)
  }

  for (const tx of transactions) {
    const score = playerImpactScore(tx)
    const entry = { ...tx, impact: score }

    if (tx.type === 'extension') {
      // Re-signed with same team
      const team = teams.get(tx.toTeam) || emptyTeamImpact()
      team.retained.push(entry)
      const pg = ensurePosGroup(team, tx.positionGroup)
      pg.retained += score
      pg.players.push(entry)
      team.totalSpent += (tx.contract?.aav || 0)
      teams.set(tx.toTeam, team)
    } else {
      // signing or trade — player moves from fromTeam to toTeam
      if (tx.toTeam) {
        const to = teams.get(tx.toTeam) || emptyTeamImpact()
        to.gained.push(entry)
        const pg = ensurePosGroup(to, tx.positionGroup)
        pg.gained += score
        pg.net += score
        pg.players.push(entry)
        to.totalSpent += (tx.contract?.aav || 0)
        teams.set(tx.toTeam, to)
      }
      if (tx.fromTeam) {
        const from = teams.get(tx.fromTeam) || emptyTeamImpact()
        from.lost.push(entry)
        const pg = ensurePosGroup(from, tx.positionGroup)
        pg.lost += score
        pg.net -= score
        pg.players.push(entry)
        from.totalLost += (tx.contract?.aav || 0)
        teams.set(tx.fromTeam, from)
      }
    }
  }

  // Aggregate offense/defense/overall for each team
  for (const [, t] of teams) {
    for (const [pg, data] of Object.entries(t.byPosition)) {
      const side = OFFENSE_GROUPS.includes(pg) ? 'offense'
                 : DEFENSE_GROUPS.includes(pg) ? 'defense' : null
      if (side) {
        t[side].gained   += data.gained
        t[side].lost     += data.lost
        t[side].retained += data.retained
        t[side].net      += data.net
      }
    }
    t.overall  = +(t.offense.net + t.defense.net).toFixed(2)
    t.netSpend = t.totalSpent - t.totalLost
  }

  return teams
}

export function teamDirection(teamImpact) {
  if (teamImpact.overall > 0.5)  return 'improved'
  if (teamImpact.overall < -0.5) return 'declined'
  return 'neutral'
}

/*
 * Format dollars for display: $12.5M, $330M, etc.
 */
export function formatMoney(val) {
  if (val == null) return '—'
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1000)    return `${sign}$${(abs / 1000).toFixed(0)}K`
  return `${sign}$${abs}`
}

/*
 * Classify a contract's AAV as Premium / Mid-tier / Bargain
 */
export function dealTier(aav) {
  if (!aav) return null
  if (aav >= 20000000) return { label: 'Premium', cls: 'text-yellow-300 bg-yellow-500/20 border border-yellow-500/30' }
  if (aav >= 8000000)  return { label: 'Mid-tier', cls: 'text-gray-300 bg-gray-500/20 border border-gray-500/30' }
  return { label: 'Bargain', cls: 'text-green-300 bg-green-500/20 border border-green-500/30' }
}
