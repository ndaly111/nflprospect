import { applyFilters } from '../utils/filters.js'
import { renderProspectCard, wireCardEvents } from './prospectCard.js'
import { getState, setState } from '../state.js'

let eventsWired = false

export function renderProspectGrid() {
  const container = document.getElementById('prospect-grid')
  const countEl = document.getElementById('result-count')
  if (!container) return

  const { prospects, filters, sort, expandedCardId } = getState()
  const filtered = applyFilters(prospects, filters, sort)

  // Update result count
  if (countEl) {
    if (filters.positionGroup !== 'ALL' || filters.round !== 'ALL' || filters.search) {
      countEl.textContent = `${filtered.length} of ${prospects.length} prospects`
    } else {
      countEl.textContent = `${prospects.length} prospects`
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 text-gray-500">
        <div class="text-4xl mb-3">🏈</div>
        <p class="text-lg font-medium">No prospects match your filters</p>
        <p class="text-sm mt-1">Try adjusting your search or filter criteria</p>
      </div>`
    return
  }

  // Preserve expanded state across re-renders
  container.innerHTML = filtered.map(p => renderProspectCard(p, p.id === expandedCardId)).join('')

  // Wire events once using event delegation on the container
  if (!eventsWired) {
    wireCardEvents(container)
    eventsWired = true
  }

  // If a card should be expanded, init its chart after render
  if (expandedCardId) {
    const expandedProspect = prospects.find(p => p.id === expandedCardId)
    if (expandedProspect) {
      import('./rankingChart.js').then(({ renderRankingChart }) => {
        setTimeout(() => renderRankingChart(`chart-${expandedCardId}`, expandedProspect.rankHistory), 60)
      })
    }
  }
}

export function renderSkeleton() {
  const container = document.getElementById('prospect-grid')
  if (!container) return

  const card = `
    <div class="bg-gray-800 rounded-xl border border-gray-700 p-4 skeleton">
      <div class="flex gap-2 mb-2">
        <div class="h-5 w-12 bg-gray-700 rounded-full"></div>
        <div class="h-5 w-24 bg-gray-700 rounded-full"></div>
      </div>
      <div class="h-5 w-40 bg-gray-700 rounded mb-3"></div>
      <div class="flex items-center gap-3">
        <div class="h-9 w-10 bg-gray-700 rounded"></div>
        <div class="space-y-1">
          <div class="h-3 w-16 bg-gray-700 rounded"></div>
          <div class="h-3 w-20 bg-gray-700 rounded"></div>
        </div>
      </div>
    </div>`

  container.innerHTML = Array(9).fill(card).join('')
}
