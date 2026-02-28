import { trendArrow } from '../utils/format.js'
import { renderRankingChart, destroyChart } from './rankingChart.js'
import { renderCollegeStats } from './collegeStats.js'
import { renderCombinePanel } from './combinePanel.js'
import { getState, setState, subscribe } from '../state.js'

// Cache for in-class college stat percentiles
let _statPctCache = null
let _statPctLen = 0

function buildCollegeStatPct(prospects) {
  if (_statPctCache && _statPctLen === prospects.length) return _statPctCache
  const result = {}  // {posGroup: {statKey: sorted_values[]}}
  for (const p of prospects) {
    const grp = p.positionGroup
    if (!result[grp]) result[grp] = {}
    const cs = p.collegeStats || {}
    // Use all years — accumulate all values
    for (const stats of Object.values(cs)) {
      for (const [key, val] of Object.entries(stats)) {
        if (typeof val === 'number' && !isNaN(val) && val > 0 && key !== 'games') {
          if (!result[grp][key]) result[grp][key] = []
          result[grp][key].push(val)
        }
      }
    }
  }
  // Sort each array
  for (const grp of Object.values(result)) {
    for (const key of Object.keys(grp)) {
      grp[key].sort((a, b) => a - b)
    }
  }
  _statPctCache = result
  _statPctLen = prospects.length
  return result
}

const POSITION_COLORS = {
  QB: 'bg-red-900 text-red-300',
  RB: 'bg-green-900 text-green-300',
  WR: 'bg-blue-900 text-blue-300',
  TE: 'bg-purple-900 text-purple-300',
  OL: 'bg-yellow-900 text-yellow-300',
  DL: 'bg-orange-900 text-orange-300',
  EDGE: 'bg-orange-900 text-orange-300',
  LB: 'bg-teal-900 text-teal-300',
  DB: 'bg-indigo-900 text-indigo-300',
}

const SOURCE_LABELS = {
  tankathon: 'Tankathon',
  espn: 'ESPN',
  walter_football: 'Walter Football',
}

export function renderProspectCard(prospect, isExpanded = false) {
  const statPct = buildCollegeStatPct(getState().prospects)
  const trend = trendArrow(prospect.rankHistory, 30)
  const posColor = POSITION_COLORS[prospect.positionGroup] || 'bg-gray-800 text-gray-300'
  const chartId = `chart-${prospect.id}`

  const sourcesList = Object.entries(prospect.rankBySource || {}).map(([src, rank]) => {
    const label = SOURCE_LABELS[src] || src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return `<span class="whitespace-nowrap text-gray-400">${label}: <span class="text-gray-200 font-medium">#${rank}</span></span>`
  }).join('<span class="text-gray-700 mx-1">·</span>')

  const gradeColor = prospect.espnGrade >= 90 ? 'text-green-400' : prospect.espnGrade >= 85 ? 'text-yellow-400' : 'text-gray-400'

  // Range bar: show spread across sources
  const sourceRanks = Object.values(prospect.rankBySource || {})
  const rangeBar = (() => {
    if (sourceRanks.length < 2) return ''
    const minRank = Math.min(...sourceRanks)
    const maxRank = Math.max(...sourceRanks)
    const spread = maxRank - minRank
    const dotPct = spread === 0 ? 50 : Math.round((prospect.consensusRank - minRank) / spread * 100)
    const spreadColor = spread <= 2 ? '#22c55e' : spread <= 6 ? '#3b82f6' : '#f59e0b'
    const spreadLabel = spread === 0 ? 'all agree' : spread <= 2 ? 'tight' : spread <= 6 ? 'moderate' : 'wide'
    return `
      <div class="mt-2 pt-2 border-t border-gray-700/40">
        <div class="flex justify-between text-[10px] mb-1">
          <span class="text-green-500/80">Best: #${minRank}</span>
          <span style="color:${spreadColor}">${spread === 0 ? '✓ ' : ''}${spreadLabel}${spread > 0 ? ` (${spread})` : ''}</span>
          <span class="text-amber-500/80">Worst: #${maxRank}</span>
        </div>
        <div class="relative h-1 bg-gray-700/60 rounded-full">
          <div class="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-gray-800"
               style="left:${dotPct}%;transform:translate(-50%,-50%);background:${spreadColor}"></div>
        </div>
      </div>`
  })()

  // Big mover badge (>= 7 spots in 30 days)
  const moverBadge = (() => {
    if (Math.abs(trend.delta) < 7) return ''
    if (trend.delta > 0) return `<span class="text-[10px] font-bold text-emerald-400 bg-emerald-900/40 px-1.5 py-0.5 rounded-full">🔥 +${trend.delta}</span>`
    return `<span class="text-[10px] font-bold text-red-400 bg-red-900/40 px-1.5 py-0.5 rounded-full">↘ ${trend.delta}</span>`
  })()

  return `
    <div class="prospect-card bg-gray-800 rounded-xl border ${isExpanded ? 'border-blue-600' : 'border-gray-700'} overflow-hidden hover:border-gray-500 transition-colors"
         data-id="${prospect.id}">

      <!-- Card Header -->
      <div class="card-header cursor-pointer p-4 select-none" data-id="${prospect.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${posColor}">${prospect.position}</span>
              <span class="text-xs text-gray-400 truncate">${prospect.school}</span>
              ${moverBadge}
            </div>
            <h2 class="text-base font-bold text-white leading-snug mb-1">${prospect.name}</h2>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-2xl font-black text-blue-400 leading-none">#${prospect.consensusRank}</span>
              <div class="text-xs text-gray-400 leading-snug">
                <div>Rd ${prospect.projectedRound || '?'} &nbsp;·&nbsp; #${prospect.positionRank} ${prospect.positionGroup}</div>
                <div class="${trend.cls} font-medium">${trend.arrow} (30d)</div>
              </div>
              ${prospect.espnGrade ? `
                <div class="ml-auto flex flex-col items-end">
                  <div class="text-[10px] text-gray-500 uppercase tracking-wider">ESPN</div>
                  <div class="text-base font-bold ${gradeColor}">${prospect.espnGrade}</div>
                </div>` : ''}
            </div>
          </div>
          <div class="flex flex-col items-end gap-2 flex-shrink-0">
            <button class="share-btn text-gray-600 hover:text-gray-300 transition-colors text-xs p-1" data-id="${prospect.id}" title="Copy link">⎘</button>
            <div class="text-gray-600 text-xs card-chevron" data-id="${prospect.id}">${isExpanded ? '▲' : '▼'}</div>
          </div>
        </div>
        ${rangeBar}
        ${sourcesList ? `
          <div class="mt-2 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
            ${sourcesList}
          </div>` : ''}
      </div>

      <!-- Expandable Detail -->
      <div class="card-detail ${isExpanded ? '' : 'hidden'} border-t border-gray-700" data-id="${prospect.id}">
        <div class="flex border-b border-gray-700">
          <button class="detail-tab flex-1 px-3 py-2 text-xs font-medium border-b-2 border-blue-500 text-blue-400" data-tab="ranking" data-card="${prospect.id}">Rankings</button>
          <button class="detail-tab flex-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white border-b-2 border-transparent transition-colors" data-tab="stats" data-card="${prospect.id}">Stats</button>
          <button class="detail-tab flex-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white border-b-2 border-transparent transition-colors" data-tab="combine" data-card="${prospect.id}">Combine</button>
        </div>
        <div class="p-4">
          <div class="tab-content" data-tab="ranking" data-card="${prospect.id}">
            <div style="height:180px; position:relative;">
              <canvas id="${chartId}"></canvas>
            </div>
          </div>
          <div class="tab-content hidden" data-tab="stats" data-card="${prospect.id}">
            ${renderCollegeStats(prospect, statPct[prospect.positionGroup] || {})}
          </div>
          <div class="tab-content hidden" data-tab="combine" data-card="${prospect.id}">
            ${renderCombinePanel(prospect.combineData, prospect.positionGroup, prospect.playerComps)}
          </div>
        </div>
      </div>
    </div>`
}

export function wireCardEvents(container) {
  container.addEventListener('click', e => {
    // Share button
    const shareBtn = e.target.closest('.share-btn')
    if (shareBtn) {
      e.stopPropagation()
      const id = shareBtn.dataset.id
      const url = `${location.origin}${location.pathname}?p=${encodeURIComponent(id)}`
      navigator.clipboard?.writeText(url).then(() => {
        shareBtn.textContent = '✓'
        setTimeout(() => { shareBtn.textContent = '⎘' }, 1500)
      })
      return
    }

    const tab = e.target.closest('.detail-tab')
    if (tab) {
      handleTabClick(tab)
      return
    }
    const header = e.target.closest('.card-header')
    if (header) {
      handleCardToggle(header.dataset.id)
    }
  })
}

function handleCardToggle(id) {
  const state = getState()
  const wasExpanded = state.expandedCardId === id

  // Destroy chart for previously expanded card
  if (state.expandedCardId) {
    destroyChart(`chart-${state.expandedCardId}`)
  }

  if (wasExpanded) {
    setState({ expandedCardId: null })
    // Visually collapse immediately (DOM is still live)
    collapseCardDOM(id)
  } else {
    // Collapse previous
    if (state.expandedCardId) collapseCardDOM(state.expandedCardId)
    setState({ expandedCardId: id })
    expandCardDOM(id)
  }
}

function expandCardDOM(id) {
  const card = document.querySelector(`.prospect-card[data-id="${id}"]`)
  const detail = document.querySelector(`.card-detail[data-id="${id}"]`)
  const chevron = document.querySelector(`.card-chevron[data-id="${id}"]`)
  if (!detail) return

  detail.classList.remove('hidden')
  if (card) card.classList.replace('border-gray-700', 'border-blue-600')
  if (chevron) chevron.textContent = '▲'

  // Reset to ranking tab
  const firstTab = detail.querySelector('.detail-tab[data-tab="ranking"]')
  if (firstTab) activateTab(firstTab)

  // Init chart
  const prospect = getState().prospects.find(p => p.id === id)
  if (prospect) {
    setTimeout(() => renderRankingChart(`chart-${id}`, prospect.rankHistory), 60)
  }
}

function collapseCardDOM(id) {
  const card = document.querySelector(`.prospect-card[data-id="${id}"]`)
  const detail = document.querySelector(`.card-detail[data-id="${id}"]`)
  const chevron = document.querySelector(`.card-chevron[data-id="${id}"]`)
  if (!detail) return
  detail.classList.add('hidden')
  if (card) {
    card.classList.remove('border-blue-600')
    card.classList.add('border-gray-700')
  }
  if (chevron) chevron.textContent = '▼'
}

function handleTabClick(tab) {
  activateTab(tab)
  const cardId = tab.dataset.card
  const tabName = tab.dataset.tab

  document.querySelectorAll(`.tab-content[data-card="${cardId}"]`).forEach(c => {
    c.classList.toggle('hidden', c.dataset.tab !== tabName)
  })

  if (tabName === 'ranking') {
    const prospect = getState().prospects.find(p => p.id === cardId)
    if (prospect) setTimeout(() => renderRankingChart(`chart-${cardId}`, prospect.rankHistory), 60)
  }

  if (tabName === 'combine') {
    const prospect = getState().prospects.find(p => p.id === cardId)
    const combineEl = document.querySelector(`.tab-content[data-tab="combine"][data-card="${cardId}"]`)
    if (prospect && combineEl) {
      combineEl.innerHTML = renderCombinePanel(prospect.combineData, prospect.positionGroup, prospect.playerComps)
    }
  }
}

function activateTab(activeTab) {
  const cardId = activeTab.dataset.card
  document.querySelectorAll(`.detail-tab[data-card="${cardId}"]`).forEach(t => {
    const isActive = t === activeTab
    t.classList.toggle('border-blue-500', isActive)
    t.classList.toggle('text-blue-400', isActive)
    t.classList.toggle('border-transparent', !isActive)
    t.classList.toggle('text-gray-400', !isActive)
  })
}
