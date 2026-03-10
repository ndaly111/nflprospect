import { applyFilters } from '../utils/filters.js'
import { renderProspectCard, wireCardEvents } from './prospectCard.js'
import { renderRankingChart } from './rankingChart.js'
import { getState, setState } from '../state.js'
import { trendArrow } from '../utils/format.js'

const PAGE_SIZE = 30

let eventsWired = false
let visibleCount = PAGE_SIZE
let prevFilterKey = ''

// ── List View Column Definitions ────────────────────────────────────
// Each column: { key, label, get(p,stats), format?, hide?, sortDir?, title? }
// hide: responsive breakpoint class (sm/md/lg) to hide on smaller screens
// sortDir: default sort direction when first clicked ('asc' or 'desc')

function getLatestStats(p) {
  const cs = p.collegeStats || {}
  const years = Object.keys(cs).sort()
  return years.length ? { ...cs[years[years.length - 1]], _year: years[years.length - 1] } : {}
}

function parseHeightInches(h) {
  if (!h) return 0
  const s = String(h).replace(/['"]/g, '').trim()
  if (s.includes('-')) {
    const [ft, ins] = s.split('-').map(Number)
    return ft * 12 + (ins || 0)
  }
  return parseFloat(s) || 0
}

function fmtHeight(h) {
  if (!h) return '—'
  const s = String(h).replace(/['"]/g, '').trim()
  return s.includes('-') ? s.replace('-', "'") + '"' : s
}

function fmtStat(v, dec = 0) {
  if (v === null || v === undefined || v === 0) return '—'
  return typeof v === 'number' ? v.toFixed(dec) : v
}

// Columns shown for every position
const BASE_COLS = [
  { key: 'projectedRound', label: 'RD', get: p => p.actualRound || p.projectedRound || 99, format: v => v >= 99 ? '—' : v, hide: 'sm', sortDir: 'asc' },
  { key: 'team', label: 'TEAM', get: p => {
    const t = p.actualTeam || p.projectedTeam
    return t ? t.split(' ').pop() : ''
  }, format: v => v || '—', hide: 'lg', sortDir: 'asc' },
]

const COMBINE_COLS = [
  { key: 'height', label: 'HT', get: p => parseHeightInches(p.combineData?.height), format: (v, p) => fmtHeight(p.combineData?.height), hide: 'md', sortDir: 'desc', title: 'Height' },
  { key: 'weight', label: 'WT', get: p => p.combineData?.weight || 0, format: v => v || '—', hide: 'md', sortDir: 'desc', title: 'Weight (lbs)' },
  { key: 'forty', label: '40', get: p => p.combineData?.forty || 99, format: v => v >= 99 ? '—' : v.toFixed(2), hide: 'lg', sortDir: 'asc', title: '40-yard dash' },
]

const GRADE_COL = { key: 'espnGrade', label: 'GRADE', get: p => p.espnGrade || 0, format: v => v || '—', hide: 'sm', sortDir: 'desc', title: 'ESPN Grade' }

// Position-specific stat columns
const POSITION_STAT_COLS = {
  QB: [
    { key: 'passingYards', label: 'YDS', get: (p, s) => s.passingYards || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'passingTDs', label: 'TD', get: (p, s) => s.passingTDs || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'interceptions', label: 'INT', get: (p, s) => s.interceptions || 0, format: v => fmtStat(v), sortDir: 'asc', hide: 'md' },
    { key: 'completionPct', label: 'CMP%', get: (p, s) => {
      if (s.completionPct) return s.completionPct
      if (s.completions && s.attempts) return (s.completions / s.attempts) * 100
      return 0
    }, format: v => v ? v.toFixed(1) : '—', sortDir: 'desc', hide: 'lg' },
  ],
  RB: [
    { key: 'rushingYards', label: 'RUSH', get: (p, s) => s.rushingYards || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'rushingTDs', label: 'TD', get: (p, s) => s.rushingTDs || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'avgRush', label: 'YPC', get: (p, s) => (s.rushingYards && s.rushingAttempts) ? s.rushingYards / s.rushingAttempts : 0, format: v => v ? v.toFixed(1) : '—', sortDir: 'desc', hide: 'md' },
    { key: 'receptions', label: 'REC', get: (p, s) => s.receptions || 0, format: v => fmtStat(v), sortDir: 'desc', hide: 'lg' },
  ],
  WR: [
    { key: 'receptions', label: 'REC', get: (p, s) => s.receptions || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'receivingYards', label: 'YDS', get: (p, s) => s.receivingYards || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'receivingTDs', label: 'TD', get: (p, s) => s.receivingTDs || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'recPerGame', label: 'REC/G', get: (p, s) => (s.receptions && s.games) ? s.receptions / s.games : 0, format: v => v ? v.toFixed(1) : '—', sortDir: 'desc', hide: 'md' },
  ],
  TE: [
    { key: 'receptions', label: 'REC', get: (p, s) => s.receptions || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'receivingYards', label: 'YDS', get: (p, s) => s.receivingYards || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'receivingTDs', label: 'TD', get: (p, s) => s.receivingTDs || 0, format: v => fmtStat(v), sortDir: 'desc', hide: 'md' },
  ],
  DL: [
    { key: 'tackles', label: 'TKL', get: (p, s) => s.tackles || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'sacks', label: 'SACK', get: (p, s) => s.sacks || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'tfls', label: 'TFL', get: (p, s) => s.tfls || 0, format: v => fmtStat(v), sortDir: 'desc', hide: 'md' },
  ],
  EDGE: [
    { key: 'tackles', label: 'TKL', get: (p, s) => s.tackles || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'sacks', label: 'SACK', get: (p, s) => s.sacks || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'tfls', label: 'TFL', get: (p, s) => s.tfls || 0, format: v => fmtStat(v), sortDir: 'desc', hide: 'md' },
  ],
  LB: [
    { key: 'tackles', label: 'TKL', get: (p, s) => s.tackles || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'sacks', label: 'SACK', get: (p, s) => s.sacks || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'tfls', label: 'TFL', get: (p, s) => s.tfls || 0, format: v => fmtStat(v), sortDir: 'desc', hide: 'md' },
    { key: 'interceptions', label: 'INT', get: (p, s) => s.interceptions || 0, format: v => fmtStat(v), sortDir: 'desc', hide: 'lg' },
  ],
  DB: [
    { key: 'tackles', label: 'TKL', get: (p, s) => s.tackles || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'interceptions', label: 'INT', get: (p, s) => s.interceptions || 0, format: v => fmtStat(v), sortDir: 'desc' },
    { key: 'pbus', label: 'PBU', get: (p, s) => s.pbus || 0, format: v => fmtStat(v), sortDir: 'desc', hide: 'md' },
  ],
  OL: [],
}

function getListColumns(posFilter, isHistorical) {
  const statCols = (posFilter !== 'ALL' && posFilter !== 'FANTASY')
    ? (POSITION_STAT_COLS[posFilter] || [])
    : []
  return [...BASE_COLS, ...statCols, ...COMBINE_COLS, GRADE_COL]
}

// ── Percentile color for stat values ────────────────────────────────
function statColor(val, allValues, higherIsBetter = true) {
  if (!allValues || allValues.length < 3 || !val) return ''
  const sorted = [...allValues].sort((a, b) => a - b)
  let below = 0
  for (const v of sorted) { if (v < val) below++ }
  let pct = Math.round((below / sorted.length) * 100)
  if (!higherIsBetter) pct = 100 - pct
  if (pct >= 80) return 'text-green-400'
  if (pct >= 60) return 'text-green-300/70'
  if (pct >= 40) return ''
  if (pct >= 20) return 'text-amber-400/70'
  return 'text-red-400'
}

// ── List View Renderer ──────────────────────────────────────────────
function renderListView(filtered, watchlist, expandedCardId, isHistorical) {
  const watchSet = new Set(watchlist)
  const { listSort, filters } = getState()
  const posFilter = filters.positionGroup
  const columns = getListColumns(posFilter, isHistorical)
  const statCols = (posFilter !== 'ALL' && posFilter !== 'FANTASY')
    ? (POSITION_STAT_COLS[posFilter] || [])
    : []

  // Pre-compute latest stats + sort values for each prospect
  const enriched = filtered.map(p => {
    const stats = getLatestStats(p)
    const sortVals = {}
    for (const col of columns) {
      sortVals[col.key] = col.get(p, stats)
    }
    sortVals.consensusRank = p.consensusRank || p.actualPick || p.espnRank || 999
    sortVals.name = p.name
    return { p, stats, sortVals }
  })

  // Collect all values per stat column for percentile coloring
  const statDistributions = {}
  for (const col of statCols) {
    statDistributions[col.key] = enriched
      .map(e => e.sortVals[col.key])
      .filter(v => typeof v === 'number' && v > 0)
  }

  // Sort by listSort
  const sortKey = listSort.key
  const sortDir = listSort.dir === 'desc' ? -1 : 1
  enriched.sort((a, b) => {
    const va = a.sortVals[sortKey] ?? a.p[sortKey] ?? 999
    const vb = b.sortVals[sortKey] ?? b.p[sortKey] ?? 999
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * sortDir
    return ((va || 0) - (vb || 0)) * sortDir
  })

  // Build header
  const sortArrow = (key) => {
    if (listSort.key !== key) return ''
    return listSort.dir === 'asc' ? ' ↑' : ' ↓'
  }
  const thBase = 'pb-2 pr-2 text-left font-medium cursor-pointer hover:text-gray-300 select-none whitespace-nowrap'

  let headerHtml = `<th class="${thBase} pl-3 sort-header" data-sort="consensusRank">#${sortArrow('consensusRank')}</th>`
  headerHtml += `<th class="${thBase} sort-header" data-sort="name">Player${sortArrow('name')}</th>`
  headerHtml += `<th class="${thBase} sort-header" data-sort="position">Pos${sortArrow('position')}</th>`

  for (const col of columns) {
    const hideClass = col.hide ? ` hidden ${col.hide}:table-cell` : ''
    const title = col.title ? ` title="${col.title}"` : ''
    headerHtml += `<th class="${thBase}${hideClass} sort-header" data-sort="${col.key}" data-default-dir="${col.sortDir || 'asc'}"${title}>${col.label}${sortArrow(col.key)}</th>`
  }
  headerHtml += `<th class="${thBase} text-center">★</th>`

  // Build rows
  const rowsHtml = enriched.map(({ p, stats, sortVals }) => {
    const displayRank = isHistorical ? (p.espnRank || p.actualPick) : p.consensusRank
    const rankColor = displayRank <= 5 ? 'text-yellow-400'
      : displayRank <= 32 ? 'text-blue-400'
      : displayRank <= 64 ? 'text-green-400'
      : 'text-gray-400'
    const isStarred = watchSet.has(p.id)
    const rowBg = p.id === expandedCardId ? 'bg-gray-700/40' : ''
    const gradeColor = p.espnGrade >= 90 ? 'text-green-400' : p.espnGrade >= 85 ? 'text-yellow-400' : 'text-gray-500'

    let cells = ''
    cells += `<td class="py-2 pl-3 pr-2 text-sm font-bold ${rankColor} w-10">#${displayRank}</td>`
    cells += `<td class="py-2 pr-2 min-w-0 max-w-[140px]">
      <div class="font-semibold text-white text-sm truncate">${p.name}</div>
      <div class="school-filter-btn text-[11px] text-gray-500 hover:text-blue-400 cursor-pointer truncate" data-school="${p.school}">${p.school}</div>
    </td>`
    cells += `<td class="py-2 pr-2 text-xs text-gray-300 whitespace-nowrap">${p.position}</td>`

    for (const col of columns) {
      const hideClass = col.hide ? ` hidden ${col.hide}:table-cell` : ''
      const rawVal = sortVals[col.key]
      const displayVal = col.format ? col.format(rawVal, p) : (rawVal || '—')

      // Apply percentile coloring for stat columns
      let colorClass = ''
      if (statCols.includes(col) && statDistributions[col.key]) {
        const higherBetter = col.sortDir === 'desc'
        colorClass = statColor(rawVal, statDistributions[col.key], higherBetter)
      }
      // Grade coloring
      if (col.key === 'espnGrade') colorClass = gradeColor
      // Team coloring
      if (col.key === 'team') {
        colorClass = p.actualTeam ? 'text-green-400/90' : p.projectedTeam ? 'text-amber-400/80' : 'text-gray-600'
      }

      cells += `<td class="py-2 pr-2 text-xs ${colorClass} whitespace-nowrap${hideClass}">${displayVal}</td>`
    }

    cells += `<td class="py-2 pr-2 text-center">
      <button class="star-btn text-base leading-none transition-colors ${isStarred ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-400'}" data-id="${p.id}">★</button>
    </td>`

    return `<tr class="list-row border-t border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors ${rowBg}" data-id="${p.id}">${cells}</tr>`
  }).join('')

  // Stats year label
  const hasStats = statCols.length > 0
  const yearLabel = hasStats ? enriched.find(e => e.stats._year)?.stats._year || '' : ''
  const statsNote = hasStats && yearLabel
    ? `<div class="text-[10px] text-gray-600 mb-1 pl-3">College stats from ${yearLabel} season (latest available)</div>`
    : ''

  return [
    statsNote,
    '<div class="col-span-full overflow-x-auto">',
    '<table class="w-full">',
    '<thead><tr class="text-[10px] text-gray-600 uppercase tracking-wider">',
    headerHtml,
    '</tr></thead>',
    `<tbody>${rowsHtml}</tbody>`,
    '</table></div>',
  ].join('')
}

// ── Grid Renderer (unchanged) ───────────────────────────────────────
export function renderProspectGrid() {
  const container = document.getElementById('prospect-grid')
  const countEl = document.getElementById('result-count')
  if (!container) return

  const { prospects, filters, sort, expandedCardId, viewMode, watchlist, draftYear, draftHistory } = getState()
  const isHistorical = draftYear !== 2026
  const activeProspects = isHistorical ? (draftHistory[String(draftYear)] || []) : prospects

  // Reset pagination when filters, sort, or year change
  const filterKey = JSON.stringify({ filters, sort, viewMode, draftYear })
  if (filterKey !== prevFilterKey) {
    visibleCount = PAGE_SIZE
    prevFilterKey = filterKey
  }

  const filtered = applyFilters(activeProspects, filters, sort, watchlist)

  // Update result count + view toggle
  if (countEl) {
    const activeFilters = filters.positionGroup !== 'ALL' || filters.round !== 'ALL'
      || filters.search || filters.trend !== 'ALL' || filters.watchlistOnly
    const countText = activeFilters
      ? `${filtered.length} of ${activeProspects.length} prospects`
      : `${activeProspects.length} prospects`
    countEl.innerHTML = [
      `<span>${countText}</span>`,
      `<span class="ml-3 flex items-center gap-1">`,
      `<button class="view-toggle px-2 py-0.5 rounded text-xs transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}" data-mode="grid">Grid</button>`,
      `<button class="view-toggle px-2 py-0.5 rounded text-xs transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}" data-mode="list">List</button>`,
      `</span>`,
    ].join('')
    countEl.classList.add('flex', 'items-center')
    countEl.querySelectorAll('.view-toggle').forEach(btn => {
      btn.addEventListener('click', () => setState({ viewMode: btn.dataset.mode }))
    })
  }

  if (filtered.length === 0) {
    container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
    container.innerHTML = [
      '<div class="col-span-full text-center py-16 text-gray-500">',
      '<div class="text-4xl mb-3">🏈</div>',
      '<p class="text-lg font-medium">No prospects match your filters</p>',
      '<p class="text-sm mt-1">Try adjusting your search or filter criteria</p>',
      '</div>',
    ].join('')
    return
  }

  // List view
  if (viewMode === 'list') {
    container.className = 'grid grid-cols-1'
    container.innerHTML = renderListView(filtered, watchlist, expandedCardId, isHistorical)

    // Sortable headers
    container.querySelectorAll('.sort-header').forEach(th => {
      th.addEventListener('click', e => {
        e.stopPropagation()
        const key = th.dataset.sort
        const { listSort } = getState()
        const defaultDir = th.dataset.defaultDir || 'asc'
        if (listSort.key === key) {
          setState({ listSort: { key, dir: listSort.dir === 'asc' ? 'desc' : 'asc' } })
        } else {
          setState({ listSort: { key, dir: defaultDir } })
        }
      })
    })

    container.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const id = btn.dataset.id
        const { watchlist: wl } = getState()
        const next = wl.includes(id) ? wl.filter(x => x !== id) : [...wl, id]
        setState({ watchlist: next })
      })
    })
    container.querySelectorAll('.school-filter-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const { filters } = getState()
        const school = btn.dataset.school
        setState({ filters: { ...filters, search: filters.search === school ? '' : school }, expandedCardId: null })
      })
    })
    container.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => {
        setState({ viewMode: 'grid', expandedCardId: row.dataset.id })
      })
    })
    return
  }

  // Grid view
  container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

  // Historical + all rounds → group by round with divider headers, no pagination
  if (isHistorical && filters.round === 'ALL') {
    const byRound = {}
    for (const p of filtered) {
      const r = p.actualRound ?? 'Unknown'
      if (!byRound[r]) byRound[r] = []
      byRound[r].push(p)
    }
    const rounds = Object.keys(byRound).map(Number).filter(Boolean).sort((a, b) => a - b)
    const parts = []
    for (const r of rounds) {
      const picks = byRound[r]
      parts.push(
        `<div class="col-span-full flex items-center gap-3 mt-2 mb-1">`,
        `<span class="text-sm font-bold text-gray-300 whitespace-nowrap">Round ${r}</span>`,
        `<div class="flex-1 border-t border-gray-700/60"></div>`,
        `<span class="text-xs text-gray-500">${picks.length} pick${picks.length !== 1 ? 's' : ''}</span>`,
        `</div>`,
        ...picks.map(p => renderProspectCard(p, p.id === expandedCardId)),
      )
    }
    container.innerHTML = parts.join('')
  } else {
    const visible = filtered.slice(0, visibleCount)
    container.innerHTML = visible.map(p => renderProspectCard(p, p.id === expandedCardId)).join('')

    // "Load more" button if there are hidden prospects
    if (filtered.length > visibleCount) {
      const remaining = filtered.length - visibleCount
      const btnWrap = document.createElement('div')
      btnWrap.className = 'col-span-full flex justify-center py-6'
      btnWrap.innerHTML = [
        `<button class="load-more-btn px-6 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors">`,
        `Load ${Math.min(PAGE_SIZE, remaining)} more`,
        `<span class="text-gray-500 text-xs ml-1">(${remaining} left)</span>`,
        `</button>`,
      ].join('')
      btnWrap.querySelector('.load-more-btn').addEventListener('click', () => {
        visibleCount += PAGE_SIZE
        renderProspectGrid()
      })
      container.appendChild(btnWrap)
    }
  }

  // Wire events once using event delegation on the container
  if (!eventsWired) {
    wireCardEvents(container)
    eventsWired = true
  }

  // If a card should be expanded, init its chart after render
  const allVisible = isHistorical && filters.round === 'ALL' ? filtered : filtered.slice(0, visibleCount)
  if (expandedCardId && allVisible.some(p => p.id === expandedCardId)) {
    const expandedProspect = activeProspects.find(p => p.id === expandedCardId)
    if (expandedProspect && expandedProspect.rankHistory) {
      setTimeout(() => renderRankingChart(`chart-${expandedCardId}`, expandedProspect.rankHistory), 60)
    }
  }
}

export function renderSkeleton() {
  const container = document.getElementById('prospect-grid')
  if (!container) return

  const card = [
    '<div class="bg-gray-800 rounded-xl border border-gray-700 p-4 skeleton">',
    '<div class="flex gap-2 mb-2">',
    '<div class="h-5 w-12 bg-gray-700 rounded-full"></div>',
    '<div class="h-5 w-24 bg-gray-700 rounded-full"></div>',
    '</div>',
    '<div class="h-5 w-40 bg-gray-700 rounded mb-3"></div>',
    '<div class="flex items-center gap-3">',
    '<div class="h-9 w-10 bg-gray-700 rounded"></div>',
    '<div class="space-y-1">',
    '<div class="h-3 w-16 bg-gray-700 rounded"></div>',
    '<div class="h-3 w-20 bg-gray-700 rounded"></div>',
    '</div></div></div>',
  ].join('')

  container.innerHTML = Array(9).fill(card).join('')
}
