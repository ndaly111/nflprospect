import { getState, setState } from '../state.js'


const POSITION_GROUPS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'EDGE', 'LB', 'DB']

const SORT_OPTIONS = [
  { value: 'consensusRank', label: 'Consensus Rank' },
  { value: 'projectedRound', label: 'Projected Round' },
  { value: 'espnGrade', label: 'ESPN Grade' },
  { value: 'trending', label: 'Biggest Movers' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'school', label: 'School' },
]

const TREND_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'RISING', label: '↑ Rising' },
  { value: 'FALLING', label: '↓ Falling' },
]

export function renderFilterBar() {
  const container = document.getElementById('filter-bar')
  if (!container) return

  const { filters, sort, historical, historicalYear, watchlist, draftYear, draftHistory } = getState()
  const isHistorical = draftYear !== 2026

  // Build draft year options from draftHistory
  const draftYears = Object.keys(draftHistory || {})
    .filter(k => /^\d{4}$/.test(k))
    .sort()
    .reverse()

  const draftYearSelector = `
    <div class="flex items-center gap-2">
      <label class="text-xs text-gray-400 whitespace-nowrap">Draft Year:</label>
      <select id="draft-year-select" class="bg-gray-800 border ${isHistorical ? 'border-blue-500' : 'border-gray-700'} text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
        <option value="2026" ${draftYear === 2026 ? 'selected' : ''}>2026 (Current)</option>
        ${draftYears.map(y => `
          <option value="${y}" ${draftYear === parseInt(y) ? 'selected' : ''}>${y} Draft</option>`
        ).join('')}
      </select>
    </div>`

  // Build year comparison options (for combine percentiles)
  const histYears = Object.keys(historical || {})
    .filter(k => k !== 'all' && /^\d{4}$/.test(k))
    .sort()
    .reverse()

  const compareOptions = histYears.length > 0
    ? `<div class="flex items-center gap-2">
        <label class="text-xs text-gray-400 whitespace-nowrap">Compare vs:</label>
        <select id="hist-year-select" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
          <option value="all" ${historicalYear === 'all' ? 'selected' : ''}>All Classes</option>
          ${histYears.map(y => `
            <option value="${y}" ${historicalYear === y ? 'selected' : ''}>${y} Draft</option>`
          ).join('')}
        </select>
      </div>`
    : ''

  container.innerHTML = `
    ${isHistorical ? `
      <div class="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-900/20 border border-blue-700/40 rounded-lg text-sm text-blue-300">
        <span>Viewing <strong>${draftYear} Draft Class</strong> — actual picks, rounds, and teams</span>
        <button id="glossary-btn" class="text-xs text-blue-400 hover:text-blue-200 underline whitespace-nowrap ml-auto" title="Explain these terms">What do these mean?</button>
        <button id="back-to-2026" class="text-xs text-blue-400 hover:text-blue-200 underline whitespace-nowrap">Back to 2026</button>
      </div>` : ''}
    <div class="flex flex-wrap items-center gap-2 mb-3">
      ${POSITION_GROUPS.map(pos => `
        <button class="pos-tab px-3 py-1.5 rounded-full text-sm font-medium transition-colors
          ${filters.positionGroup === pos
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}"
          data-pos="${pos}">${pos}</button>`
      ).join('')}
      ${!isHistorical ? `
        <span class="text-gray-700 mx-1">|</span>
        ${TREND_OPTIONS.map(t => `
          <button class="trend-tab px-3 py-1.5 rounded-full text-sm font-medium transition-colors
            ${filters.trend === t.value
              ? (t.value === 'RISING' ? 'bg-emerald-700 text-white' : t.value === 'FALLING' ? 'bg-red-800 text-white' : 'bg-blue-600 text-white')
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
            data-trend="${t.value}">${t.label}</button>`
        ).join('')}
        ${watchlist.length > 0 ? `
          <button id="watchlist-toggle" class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors
            ${filters.watchlistOnly ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-yellow-500/70 hover:bg-gray-700'}">
            ★ Watchlist${filters.watchlistOnly ? '' : ` (${watchlist.length})`}
          </button>` : ''}` : ''}
    </div>
    <div class="flex flex-wrap items-center gap-3">
      ${draftYearSelector}
      <div class="flex items-center gap-2">
        <label class="text-xs text-gray-400 whitespace-nowrap">Round:</label>
        <select id="round-filter" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
          <option value="ALL" ${filters.round === 'ALL' ? 'selected' : ''}>All Rounds</option>
          ${[1,2,3,4,5,6,7].map(r => `
            <option value="${r}" ${filters.round === String(r) ? 'selected' : ''}>Round ${r}</option>`
          ).join('')}
        </select>
      </div>
      ${!isHistorical ? `
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-400 whitespace-nowrap">Sort:</label>
          <select id="sort-select" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
            ${SORT_OPTIONS.map(o => `
              <option value="${o.value}" ${sort === o.value ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </div>
        ${compareOptions}` : ''}
      <div class="flex-1 min-w-[160px]">
        <input id="search-input" type="text" placeholder="Search name, school, team…"
          value="${filters.search}"
          class="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-600">
      </div>
      ${(filters.positionGroup !== 'ALL' || filters.round !== 'ALL' || filters.search || (!isHistorical && (filters.trend !== 'ALL' || filters.watchlistOnly)))
        ? `<button id="clear-filters-btn" class="text-xs text-gray-500 hover:text-red-400 transition-colors whitespace-nowrap">✕ Clear</button>`
        : ''}
    </div>`

  wireFilterEvents()
}

function wireFilterEvents() {
  // Position tabs
  document.querySelectorAll('.pos-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const { filters } = getState()
      setState({ filters: { ...filters, positionGroup: btn.dataset.pos }, expandedCardId: null })
    })
  })

  // Trend tabs
  document.querySelectorAll('.trend-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const { filters } = getState()
      setState({ filters: { ...filters, trend: btn.dataset.trend }, expandedCardId: null })
    })
  })

  // Round filter
  const roundEl = document.getElementById('round-filter')
  if (roundEl) {
    roundEl.addEventListener('change', () => {
      const { filters } = getState()
      setState({ filters: { ...filters, round: roundEl.value }, expandedCardId: null })
    })
  }

  // Sort
  const sortEl = document.getElementById('sort-select')
  if (sortEl) {
    sortEl.addEventListener('change', () => {
      setState({ sort: sortEl.value, expandedCardId: null })
    })
  }

  // Draft year selector (browse historical classes)
  const draftYearEl = document.getElementById('draft-year-select')
  if (draftYearEl) {
    draftYearEl.addEventListener('change', () => {
      const year = parseInt(draftYearEl.value)
      setState({
        draftYear: year,
        expandedCardId: null,
        filters: { positionGroup: 'ALL', round: 'ALL', search: '', trend: 'ALL', watchlistOnly: false },
      })
    })
  }

  // Back to 2026 button
  const backBtn = document.getElementById('back-to-2026')
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      setState({ draftYear: 2026, expandedCardId: null })
    })
  }

  // Glossary button
  const glossaryBtn = document.getElementById('glossary-btn')
  if (glossaryBtn) {
    glossaryBtn.addEventListener('click', () => {
      document.getElementById('glossary-modal')?.classList.remove('hidden')
    })
  }

  // Historical year comparison (combine percentiles)
  const histYearEl = document.getElementById('hist-year-select')
  if (histYearEl) {
    histYearEl.addEventListener('change', () => {
      setState({ historicalYear: histYearEl.value })
    })
  }

  // Watchlist toggle
  const watchlistToggle = document.getElementById('watchlist-toggle')
  if (watchlistToggle) {
    watchlistToggle.addEventListener('click', () => {
      const { filters: f } = getState()
      setState({ filters: { ...f, watchlistOnly: !f.watchlistOnly }, expandedCardId: null })
    })
  }

  // Clear all filters
  const clearBtn = document.getElementById('clear-filters-btn')
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      setState({
        filters: { positionGroup: 'ALL', round: 'ALL', search: '', trend: 'ALL', watchlistOnly: false },
        sort: 'consensusRank',
        expandedCardId: null,
      })
    })
  }

  // Search
  let searchTimer
  const searchEl = document.getElementById('search-input')
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        const { filters } = getState()
        setState({ filters: { ...filters, search: searchEl.value }, expandedCardId: null })
      }, 200)
    })
  }
}
