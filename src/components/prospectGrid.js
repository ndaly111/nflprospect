import { applyFilters } from '../utils/filters.js'
import { renderProspectCard, wireCardEvents } from './prospectCard.js'
import { renderRankingChart } from './rankingChart.js'
import { getState, setState } from '../state.js'
import { trendArrow } from '../utils/format.js'

const PAGE_SIZE = 30

let eventsWired = false
let visibleCount = PAGE_SIZE
let prevFilterKey = ''

function renderListView(filtered, watchlist, expandedCardId, isHistorical) {
  const watchSet = new Set(watchlist)
  const rows = filtered.map(p => {
    const displayRank = isHistorical ? (p.espnRank || p.actualPick) : p.consensusRank
    const rankColor = displayRank <= 5 ? 'text-yellow-400'
      : displayRank <= 32 ? 'text-blue-400'
      : displayRank <= 64 ? 'text-green-400'
      : 'text-gray-400'
    const isStarred = watchSet.has(p.id)
    const rowBg = p.id === expandedCardId ? 'bg-gray-700/40' : ''

    if (isHistorical) {
      const teamShort = p.actualTeam ? p.actualTeam.split(' ').pop() : '—'
      const histRank = p.espnRank || p.actualPick
      return [
        `<tr class="list-row border-t border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors ${rowBg}" data-id="${p.id}">`,
        `<td class="py-2.5 pl-3 pr-2 text-sm font-bold ${rankColor} w-10">#${histRank}</td>`,
        `<td class="py-2.5 pr-3 min-w-0">`,
        `<div class="font-semibold text-white text-sm truncate">${p.name}</div>`,
        `<div class="school-filter-btn text-xs text-gray-500 hover:text-blue-400 transition-colors cursor-pointer truncate" data-school="${p.school}">${p.school}</div>`,
        `</td>`,
        `<td class="py-2.5 pr-3 text-xs whitespace-nowrap">`,
        `<span class="text-gray-300">${p.position}</span>`,
        `<span class="text-gray-600 ml-1">${p.positionGroup !== p.position ? p.positionGroup : ''}</span>`,
        `</td>`,
        `<td class="py-2.5 pr-3 text-xs text-gray-400 whitespace-nowrap hidden sm:table-cell">Rd ${p.actualRound || '?'}</td>`,
        `<td class="py-2.5 pr-3 text-xs whitespace-nowrap hidden lg:table-cell ${p.actualTeam ? 'text-amber-400/80' : 'text-gray-700'}">#${p.actualPick} ${teamShort}</td>`,
        `<td class="py-2.5 pr-3 text-center">`,
        `<button class="star-btn text-lg leading-none transition-colors ${isStarred ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-400'}" data-id="${p.id}" title="${isStarred ? 'Remove from watchlist' : 'Add to watchlist'}">★</button>`,
        `</td></tr>`,
      ].join('')
    }

    const trend = trendArrow(p.rankHistory, 30)
    const gradeColor = p.espnGrade >= 90 ? 'text-green-400' : p.espnGrade >= 85 ? 'text-yellow-400' : 'text-gray-500'
    // Post-draft: prefer actual team/round over projected
    const displayTeam = p.actualTeam || p.projectedTeam
    const displayPick = p.actualPick || p.projectedPick
    const displayRound = p.actualRound || p.projectedRound
    const teamShort = displayTeam ? displayTeam.split(' ').pop() : '—'
    const teamClass = p.actualTeam ? 'text-green-400/90' : p.projectedTeam ? 'text-amber-400/80' : 'text-gray-700'
    return [
      `<tr class="list-row border-t border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors ${rowBg}" data-id="${p.id}">`,
      `<td class="py-2.5 pl-3 pr-2 text-sm font-bold ${rankColor} w-10">#${p.consensusRank}</td>`,
      `<td class="py-2.5 pr-3 min-w-0">`,
      `<div class="font-semibold text-white text-sm truncate">${p.name}</div>`,
      `<div class="school-filter-btn text-xs text-gray-500 hover:text-blue-400 transition-colors cursor-pointer truncate" data-school="${p.school}">${p.school}</div>`,
      `</td>`,
      `<td class="py-2.5 pr-3 text-xs whitespace-nowrap">`,
      `<span class="text-gray-300">${p.position}</span>`,
      `<span class="text-gray-600 ml-1">${p.positionGroup !== p.position ? p.positionGroup : ''}</span>`,
      `</td>`,
      `<td class="py-2.5 pr-3 text-xs text-gray-400 whitespace-nowrap hidden sm:table-cell">Rd ${displayRound || '?'}</td>`,
      `<td class="py-2.5 pr-3 text-xs whitespace-nowrap hidden lg:table-cell ${teamClass}">${displayPick ? '#' + displayPick + ' ' : ''}${teamShort}</td>`,
      `<td class="py-2.5 pr-3 text-xs whitespace-nowrap hidden md:table-cell ${trend.cls}">${trend.arrow}</td>`,
      `<td class="py-2.5 pr-3 text-xs ${gradeColor} whitespace-nowrap hidden sm:table-cell">${p.espnGrade || '—'}</td>`,
      `<td class="py-2.5 pr-3 text-center">`,
      `<button class="star-btn text-lg leading-none transition-colors ${isStarred ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-400'}" data-id="${p.id}" title="${isStarred ? 'Remove from watchlist' : 'Add to watchlist'}">★</button>`,
      `</td></tr>`,
    ].join('')
  }).join('')

  const headers = isHistorical
    ? `<th class="pb-2 pl-3 pr-2 text-left font-medium">Rank</th>
       <th class="pb-2 pr-3 text-left font-medium">Player</th>
       <th class="pb-2 pr-3 text-left font-medium">Pos</th>
       <th class="pb-2 pr-3 text-left font-medium hidden sm:table-cell">Round</th>
       <th class="pb-2 pr-3 text-left font-medium hidden lg:table-cell">Team (Drafted By)</th>
       <th class="pb-2 pr-3 text-center font-medium">★</th>`
    : `<th class="pb-2 pl-3 pr-2 text-left font-medium">#</th>
       <th class="pb-2 pr-3 text-left font-medium">Player</th>
       <th class="pb-2 pr-3 text-left font-medium">Pos</th>
       <th class="pb-2 pr-3 text-left font-medium hidden sm:table-cell">Round</th>
       <th class="pb-2 pr-3 text-left font-medium hidden lg:table-cell">Team</th>
       <th class="pb-2 pr-3 text-left font-medium hidden md:table-cell">Trend</th>
       <th class="pb-2 pr-3 text-left font-medium hidden sm:table-cell">Grade</th>
       <th class="pb-2 pr-3 text-center font-medium">★</th>`

  return [
    '<div class="col-span-full overflow-x-auto">',
    '<table class="w-full">',
    '<thead><tr class="text-[10px] text-gray-600 uppercase tracking-wider">',
    headers,
    '</tr></thead>',
    `<tbody>${rows}</tbody>`,
    '</table></div>',
  ].join('')
}

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
      `<button class="view-toggle px-2 py-0.5 rounded text-xs transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}" data-mode="grid">⊞ Grid</button>`,
      `<button class="view-toggle px-2 py-0.5 rounded text-xs transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}" data-mode="list">☰ List</button>`,
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
  const visible = filtered.slice(0, visibleCount)
  container.innerHTML = visible.map(p => renderProspectCard(p, p.id === expandedCardId)).join('')

  // Wire events once using event delegation on the container
  if (!eventsWired) {
    wireCardEvents(container)
    eventsWired = true
  }

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

  // If a card should be expanded, init its chart after render
  if (expandedCardId && visible.some(p => p.id === expandedCardId)) {
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
