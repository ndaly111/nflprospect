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

/* ── Free Agent Ranking & Salary Estimation ──────────────── */

/*
 * Draft capital bonus: first-round picks command a premium in FA,
 * especially coming off rookie deals.  Undrafted players get no bonus.
 * Scale: Round 1 → 1.25x, Round 2 → 1.12x, Round 3 → 1.05x, later → 1.0x
 */
function draftCapitalMultiplier(player) {
  const round = player.draftRound
  if (!round) return 0.92  // UDFAs are paid ~25% less than Rd1 at same tier
  if (round === 1) return 1.20
  if (round === 2) return 1.08
  if (round === 3) return 1.0
  return 0.95  // later rounds get slight discount
}

/*
 * Age factor: younger FAs (24-26) get a premium, older ones (30+) a discount.
 * Peak value age in FA is ~26.  Scale from 1.15x at 24 down to 0.7x at 33+.
 */
function ageFactor(player) {
  const age = player.age
  if (!age) return 1.0
  if (age <= 24) return 1.15
  if (age <= 26) return 1.10
  if (age <= 28) return 1.0
  if (age <= 30) return 0.88
  if (age <= 32) return 0.78
  return 0.70  // 33+
}

/*
 * Composite free agent ranking score.  Combines:
 *   - Production (existing impact score: tier × production multiplier)
 *   - Draft capital (first-rounders command a premium)
 *   - Age (younger = more valuable in FA)
 *
 * The score is on a 0-100 scale for display purposes.
 */
export function freeAgentScore(player) {
  const impact = playerImpactScore(player)   // 0-3.75 range
  const draftMult = draftCapitalMultiplier(player)
  const ageMult = ageFactor(player)

  // Raw composite: impact (0-3.75) × draft × age
  const raw = impact * draftMult * ageMult

  // Normalize to 0-100 where max theoretical = 3.75 × 1.25 × 1.15 ≈ 5.39
  const normalized = Math.min(100, Math.round((raw / 5.4) * 100))
  return normalized
}

/*
 * Estimate expected salary for a free agent as a percentage of the salary cap.
 *
 * Method:
 *   1. Look at the top 5 paid players at this position group (marketRates)
 *   2. The player's FA score determines where they fall relative to that top-5 avg
 *   3. Score of 100 → top-5 avg cap%. Score of 50 → ~40% of that. Score of 25 → ~20%.
 *   4. Apply a floor (veteran minimum ~0.4% of cap) and a ceiling (top-5 avg × 1.2)
 *
 * Returns { capPct, estimatedAAV, low, high } or null if insufficient data.
 */
export function estimateSalary(player, marketRates, salaryCap) {
  if (!marketRates || !salaryCap) return null

  // Use salaryGroup for finer granularity (OT vs IOL), fall back to positionGroup
  const sg = player.salaryGroup || player.positionGroup
  const rates = marketRates[sg] || marketRates[player.positionGroup]
  if (!rates) return null

  const score = freeAgentScore(player)
  const topAvgPct = rates.top5AvgCapPct

  // Map score (0-100) to a fraction of top-5 average.
  // Calibrated against 2020-2023 historical contracts.
  // Score 80+ → elite FA, near or above top-5 avg
  // Score 50-80 → solid starter, moderate fraction of top-5
  // Score 25-50 → low-end starter / rotational
  // Score 0-25 → depth / veteran minimum territory
  let fraction
  if (score >= 80) {
    fraction = 0.75 + (score - 80) / 80   // 0.75-1.00
  } else if (score >= 50) {
    fraction = 0.25 + (score - 50) / 60    // 0.25-0.75
  } else if (score >= 25) {
    fraction = 0.08 + (score - 25) / 147   // 0.08-0.25
  } else {
    fraction = 0.03 + score / 714           // 0.03-0.065
  }

  let capPct = +(topAvgPct * fraction).toFixed(2)
  let estimatedAAV = Math.round(salaryCap * capPct / 100)

  // Salary floor: veteran minimum (~$1.1M for experienced players)
  const VET_MIN = 1100000
  if (estimatedAAV < VET_MIN) {
    estimatedAAV = VET_MIN
    capPct = +(estimatedAAV / salaryCap * 100).toFixed(2)
  }

  // Range: ±30% for uncertainty (wider for less certain estimates)
  const rangePct = score >= 60 ? 0.25 : 0.35
  const low = Math.round(estimatedAAV * (1 - rangePct))
  const high = Math.round(estimatedAAV * (1 + rangePct))

  return { capPct, estimatedAAV, low, high, score }
}

/*
 * Rank all free agents (new signings only, not extensions) by their FA score.
 * Returns a sorted array with salary estimates attached.
 */
export function rankFreeAgents(transactions, marketRates, salaryCap) {
  // Only rank new signings (players changing teams or entering FA)
  const freeAgents = transactions
    .filter(tx => tx.type === 'signing' || tx.type === 'trade')
    .map(tx => {
      const score = freeAgentScore(tx)
      const salary = estimateSalary(tx, marketRates, salaryCap)
      return { ...tx, faScore: score, salaryEstimate: salary }
    })
    .sort((a, b) => b.faScore - a.faScore)

  // Assign rank
  freeAgents.forEach((fa, i) => { fa.faRank = i + 1 })

  return freeAgents
}
