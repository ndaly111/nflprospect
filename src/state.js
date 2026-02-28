const state = {
  prospects: [],
  news: [],
  meta: {},
  historical: {},
  historicalYear: 'all',
  filters: {
    positionGroup: 'ALL',
    round: 'ALL',
    search: '',
  },
  sort: 'consensusRank',
  expandedCardId: null,
  loading: true,
  error: null,
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
