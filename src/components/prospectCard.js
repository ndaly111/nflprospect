import { trendArrow } from '../utils/format.js'
import { renderRankingChart, destroyChart } from './rankingChart.js'
import { renderCollegeStats } from './collegeStats.js'
import { renderCombinePanel } from './combinePanel.js'
import { getState, setState } from '../state.js'

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

export function renderProspectCard(prospect) {
  const trend = trendArrow(prospect.rankHistory, 30)
  const posColor = POSITION_COLORS[prospect.positionGroup] || 'bg-gray-800 text-gray-300'
  const chartId = `chart-${prospect.id}`

  const sourcesList = Object.entries(prospect.rankBySource || {}).map(([src, rank]) => {
    const label = src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return `<span class="text-xs text-gray-400">${label}: <span class="text-white font-medium">#${rank}</span></span>`
  }).join(' &nbsp;·&nbsp; ')

  return `
    <div class="prospect-card bg-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-all"
         data-id="${prospect.id}">
      <!-- Card Header (always visible) -->
      <div class="card-header cursor-pointer p-4 select-none" data-id="${prospect.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${posColor}">${prospect.position}</span>
              <span class="text-xs text-gray-400">${prospect.school}</span>
              ${prospect.class ? `<span class="text-xs text-gray-500">${prospect.class}</span>` : ''}
            </div>
            <h2 class="text-base font-bold text-white truncate">${prospect.name}</h2>
            <div class="flex items-center gap-3 mt-1">
              <span class="text-2xl font-black text-blue-400">#${prospect.consensusRank}</span>
              <div>
                <div class="text-xs text-gray-400">Rd ${prospect.projectedRound || '?'}</div>
                <div class="${trend.cls} text-xs font-medium">${trend.arrow} (30d)</div>
              </div>
            </div>
          </div>
          <div class="text-gray-500 text-sm card-chevron" data-id="${prospect.id}">▼</div>
        </div>
        ${sourcesList ? `<div class="mt-2 text-xs border-t border-gray-700 pt-2 flex flex-wrap gap-1">${sourcesList}</div>` : ''}
      </div>

      <!-- Expandable Detail -->
      <div class="card-detail hidden border-t border-gray-700" data-id="${prospect.id}">
        <!-- Tabs -->
        <div class="flex border-b border-gray-700 bg-gray-850">
          <button class="detail-tab active px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-400" data-tab="ranking" data-card="${prospect.id}">Rankings</button>
          <button class="detail-tab px-4 py-2 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent" data-tab="stats" data-card="${prospect.id}">College Stats</button>
          <button class="detail-tab px-4 py-2 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent" data-tab="combine" data-card="${prospect.id}">Combine</button>
        </div>

        <!-- Tab content -->
        <div class="p-4">
          <div class="tab-content" data-tab="ranking" data-card="${prospect.id}">
            <div style="height:180px; position:relative;">
              <canvas id="${chartId}"></canvas>
            </div>
          </div>
          <div class="tab-content hidden" data-tab="stats" data-card="${prospect.id}">
            ${renderCollegeStats(prospect)}
          </div>
          <div class="tab-content hidden" data-tab="combine" data-card="${prospect.id}">
            ${renderCombinePanel(prospect.combineData)}
          </div>
        </div>
      </div>
    </div>`
}

export function wireCardEvents(container) {
  // Card expand/collapse
  container.addEventListener('click', e => {
    const header = e.target.closest('.card-header')
    const tab = e.target.closest('.detail-tab')

    if (tab) {
      handleTabClick(tab)
      return
    }

    if (header) {
      const id = header.dataset.id
      const state = getState()
      const wasExpanded = state.expandedCardId === id

      // Collapse previous
      if (state.expandedCardId) {
        collapseCard(state.expandedCardId)
      }

      if (wasExpanded) {
        setState({ expandedCardId: null })
      } else {
        expandCard(id)
        setState({ expandedCardId: id })
      }
    }
  })
}

function expandCard(id) {
  const detail = document.querySelector(`.card-detail[data-id="${id}"]`)
  const chevron = document.querySelector(`.card-chevron[data-id="${id}"]`)
  if (!detail) return
  detail.classList.remove('hidden')
  if (chevron) chevron.textContent = '▲'

  // Init chart on the ranking tab (default)
  const prospect = getState().prospects.find(p => p.id === id)
  if (prospect) {
    setTimeout(() => {
      renderRankingChart(`chart-${id}`, prospect.rankHistory)
    }, 50)
  }
}

function collapseCard(id) {
  const detail = document.querySelector(`.card-detail[data-id="${id}"]`)
  const chevron = document.querySelector(`.card-chevron[data-id="${id}"]`)
  if (!detail) return
  detail.classList.add('hidden')
  if (chevron) chevron.textContent = '▼'
  destroyChart(`chart-${id}`)
}

function handleTabClick(tab) {
  const cardId = tab.dataset.card
  const tabName = tab.dataset.tab

  // Update tab buttons
  document.querySelectorAll(`.detail-tab[data-card="${cardId}"]`).forEach(t => {
    t.classList.remove('border-blue-500', 'text-blue-400')
    t.classList.add('border-transparent', 'text-gray-400')
  })
  tab.classList.remove('border-transparent', 'text-gray-400')
  tab.classList.add('border-blue-500', 'text-blue-400')

  // Show/hide content
  document.querySelectorAll(`.tab-content[data-card="${cardId}"]`).forEach(c => {
    c.classList.toggle('hidden', c.dataset.tab !== tabName)
  })

  // Re-init chart if switching to ranking tab
  if (tabName === 'ranking') {
    const prospect = getState().prospects.find(p => p.id === cardId)
    if (prospect) {
      setTimeout(() => {
        renderRankingChart(`chart-${cardId}`, prospect.rankHistory)
      }, 50)
    }
  }
}
