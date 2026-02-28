const state = {
  prospects: [],
  news: [],
  meta: {},
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

const subscribers = []

export function getState() {
  return state
}

export function setState(patch) {
  Object.assign(state, patch)
  subscribers.forEach(fn => fn(state))
}

export function subscribe(fn) {
  subscribers.push(fn)
  return () => {
    const i = subscribers.indexOf(fn)
    if (i >= 0) subscribers.splice(i, 1)
  }
}
