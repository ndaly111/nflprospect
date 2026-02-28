import { trendArrow } from './format.js'

export function applyFilters(prospects, filters, sort, watchlist = []) {
  const watchSet = new Set(watchlist)
  let result = prospects.slice()

  // Position group filter
  if (filters.positionGroup !== 'ALL') {
    result = result.filter(p => p.positionGroup === filters.positionGroup)
  }

  // Round filter
  if (filters.round !== 'ALL') {
    const round = parseInt(filters.round)
    result = result.filter(p => p.projectedRound === round)
  }

  // Trend filter
  if (filters.trend === 'RISING') {
    result = result.filter(p => trendArrow(p.rankHistory, 30).delta > 0)
  } else if (filters.trend === 'FALLING') {
    result = result.filter(p => trendArrow(p.rankHistory, 30).delta < 0)
  }

  // Watchlist filter
  if (filters.watchlistOnly) {
    result = result.filter(p => watchSet.has(p.id))
  }

  // Search filter
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.school.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q)
    )
  }

  // Sort
  result.sort((a, b) => {
    switch (sort) {
      case 'consensusRank':
        return (a.consensusRank || 999) - (b.consensusRank || 999)
      case 'projectedRound':
        return (a.projectedRound || 8) - (b.projectedRound || 8) ||
               (a.consensusRank || 999) - (b.consensusRank || 999)
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
        return (a.consensusRank || 999) - (b.consensusRank || 999)
    }
  })

  return result
}
