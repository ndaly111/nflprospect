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

  const { filters, sort, historical, historicalYear } = getState()

  // Build year options from available historical buckets
  const histYears = Object.keys(historical || {})
    .filter(k => k !== 'all' && /^\d{4}$/.test(k))
    .sort()
    .reverse()

  const yearOptions = histYears.length > 0
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
    <div class="flex flex-wrap items-center gap-2 mb-3">
      ${POSITION_GROUPS.map(pos => `
        <button class="pos-tab px-3 py-1.5 rounded-full text-sm font-medium transition-colors
          ${filters.positionGroup === pos
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}"
          data-pos="${pos}">${pos}</button>`
      ).join('')}
      <span class="text-gray-700 mx-1">|</span>
      ${TREND_OPTIONS.map(t => `
        <button class="trend-tab px-3 py-1.5 rounded-full text-sm font-medium transition-colors
          ${filters.trend === t.value
            ? (t.value === 'RISING' ? 'bg-emerald-700 text-white' : t.value === 'FALLING' ? 'bg-red-800 text-white' : 'bg-blue-600 text-white')
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
          data-trend="${t.value}">${t.label}</button>`
      ).join('')}
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <label class="text-xs text-gray-400 whitespace-nowrap">Round:</label>
        <select id="round-filter" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
          <option value="ALL" ${filters.round === 'ALL' ? 'selected' : ''}>All Rounds</option>
          ${[1,2,3,4,5,6,7].map(r => `
            <option value="${r}" ${filters.round === String(r) ? 'selected' : ''}>Round ${r}</option>`
          ).join('')}
        </select>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-gray-400 whitespace-nowrap">Sort:</label>
        <select id="sort-select" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
          ${SORT_OPTIONS.map(o => `
            <option value="${o.value}" ${sort === o.value ? 'selected' : ''}>${o.label}</option>`
          ).join('')}
        </select>
      </div>
      ${yearOptions}
      <div class="flex-1 min-w-[160px]">
        <input id="search-input" type="text" placeholder="Search name, school, position…"
          value="${filters.search}"
          class="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-600">
      </div>
      ${(filters.positionGroup !== 'ALL' || filters.round !== 'ALL' || filters.search || filters.trend !== 'ALL')
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

  // Historical year comparison
  const histYearEl = document.getElementById('hist-year-select')
  if (histYearEl) {
    histYearEl.addEventListener('change', () => {
      setState({ historicalYear: histYearEl.value })
    })
  }

  // Clear all filters
  const clearBtn = document.getElementById('clear-filters-btn')
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      setState({
        filters: { positionGroup: 'ALL', round: 'ALL', search: '', trend: 'ALL' },
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
