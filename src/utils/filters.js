import { trendArrow } from './format.js'

export function applyFilters(prospects, filters, sort, watchlist = []) {
  const watchSet = new Set(watchlist)
  let result = prospects.slice()

  // Position group filter
  if (filters.positionGroup !== 'ALL') {
    if (filters.positionGroup === 'FANTASY') {
      result = result.filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p.positionGroup))
    } else {
      result = result.filter(p => p.positionGroup === filters.positionGroup)
    }
  }

  // Round filter — use actualRound for historical prospects, projectedRound for current
  if (filters.round !== 'ALL') {
    const round = parseInt(filters.round)
    result = result.filter(p => (p.actualRound || p.projectedRound) === round)
  }

  // Trend filter — only applies to current prospects with rank history
  if (filters.trend === 'RISING') {
    result = result.filter(p => p.rankHistory && trendArrow(p.rankHistory, 30).delta > 0)
  } else if (filters.trend === 'FALLING') {
    result = result.filter(p => p.rankHistory && trendArrow(p.rankHistory, 30).delta < 0)
  }

  // Watchlist filter
  if (filters.watchlistOnly) {
    result = result.filter(p => watchSet.has(p.id))
  }

  // Search filter — matches name, school, position, team (projected or actual)
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.school.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q) ||
      (p.projectedTeam || '').toLowerCase().includes(q) ||
      (p.actualTeam || '').toLowerCase().includes(q)
    )
  }

  // Sort — for historical prospects prefer actualPick over espnRank
  result.sort((a, b) => {
    const rankA = a.consensusRank || a.actualPick || a.espnRank || 999
    const rankB = b.consensusRank || b.actualPick || b.espnRank || 999
    switch (sort) {
      case 'consensusRank':
        return rankA - rankB
      case 'projectedRound':
        return (a.projectedRound || a.actualRound || 8) - (b.projectedRound || b.actualRound || 8) ||
               rankA - rankB
      case 'espnGrade':
        // Highest grade first; prospects without grade go to bottom
        return (b.espnGrade || 0) - (a.espnGrade || 0)
      case 'trending':
        // Biggest movers first (absolute delta)
        return Math.abs(trendArrow(b.rankHistory, 30).delta) -
               Math.abs(trendArrow(a.rankHistory, 30).delta)
      case 'name':
        return a.name.localeCompare(b.name)
      case 'school':
        return a.school.localeCompare(b.school)
      default:
        return rankA - rankB
    }
  })

  return result
}
