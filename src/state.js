const state = {
  prospects: [],
  news: [],
  meta: {},
  historical: {},
  historicalYear: 'all',
  draftYear: 2026,     // which draft class to view (2026 = current prospects)
  draftHistory: {},    // loaded from draft_history.json, keyed by year string
  wrTargetHistory: null, // historical first-round WR TGT/G for percentile comparison
  filters: {
    positionGroup: 'ALL',
    round: 'ALL',
    search: '',
    trend: 'ALL',
    watchlistOnly: false,
  },
  sort: 'consensusRank',
  listSort: { key: 'consensusRank', dir: 'asc' },
  viewMode: 'grid',  // 'grid' | 'list'
  watchlist: [],     // array of prospect IDs, synced to localStorage
  expandedCardId: null,
  loading: true,
  error: null,
  activePage: 'prospects',      // 'prospects' | 'analytics'
  analyticsTab: 'year',         // 'year' | 'round' | 'position' | 'players'
  analyticsPos: 'QB',
  analyticsPlayerPos:   'ALL',  // filter for players tab
  analyticsPlayerYear:  'ALL',
  analyticsPlayerRound: 'ALL',
  comparePos:    'RB',          // cross-draft comparison position
  compareView:   'grade',       // 'grade' | 'combine' | 'production'
  compareSort:   'espnGrade',   // column to sort by
  compareSortDir: 'desc',       // 'asc' | 'desc'
  compareRound:  'ALL',         // round filter for comparison
  // Free Agency tracker
  freeAgency: {},                // loaded from free_agency.json, keyed by year
  freeAgencyYear: String(new Date().getFullYear()),  // default to current year
  freeAgencyTab: 'teams',        // 'teams' | 'transactions'
  freeAgencyFilters: {
    positionGroup: 'ALL',
    side: 'ALL',                 // 'ALL' | 'offense' | 'defense'
    tier: 'ALL',
    type: 'ALL',                 // 'ALL' | 'signing' | 'trade' | 'extension'
    team: 'ALL',
    search: '',
  },
  freeAgencySort: 'impact',      // 'impact' | 'division'
}

// Subscribers can optionally declare which keys they care about.
// If keys is null/undefined, subscriber fires on every change.
const subscribers = []

export function getState() {
  return state
}

export function setState(patch) {
  const changedKeys = Object.keys(patch)
  Object.assign(state, patch)
  subscribers.forEach(({ fn, keys }) => {
    if (!keys || changedKeys.some(k => keys.includes(k))) {
      fn(state, changedKeys)
    }
  })
}

export function subscribe(fn, keys = null) {
  subscribers.push({ fn, keys })
  return () => {
    const i = subscribers.findIndex(s => s.fn === fn)
    if (i >= 0) subscribers.splice(i, 1)
  }
}
