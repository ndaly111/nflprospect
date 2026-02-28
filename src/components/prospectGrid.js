import { applyFilters } from '../utils/filters.js'
import { renderProspectCard, wireCardEvents } from './prospectCard.js'
import { getState } from '../state.js'

let wired = false

export function renderProspectGrid() {
  const container = document.getElementById('prospect-grid')
  if (!container) return

  const { prospects, filters, sort } = getState()
  const filtered = applyFilters(prospects, filters, sort)

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 text-gray-500">
        <div class="text-4xl mb-3">🏈</div>
        <p class="text-lg font-medium">No prospects match your filters</p>
        <p class="text-sm mt-1">Try adjusting your search or filter criteria</p>
      </div>`
    return
  }

  container.innerHTML = filtered.map(p => renderProspectCard(p)).join('')

  if (!wired) {
    wireCardEvents(container)
    wired = true
  }
}

export function renderSkeleton() {
  const container = document.getElementById('prospect-grid')
  if (!container) return

  const skeletonCard = `
    <div class="bg-gray-800 rounded-xl border border-gray-700 p-4 skeleton">
      <div class="flex gap-2 mb-2">
        <div class="h-5 w-12 bg-gray-700 rounded-full"></div>
        <div class="h-5 w-20 bg-gray-700 rounded-full"></div>
      </div>
      <div class="h-5 w-40 bg-gray-700 rounded mb-3"></div>
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 bg-gray-700 rounded"></div>
        <div>
          <div class="h-3 w-12 bg-gray-700 rounded mb-1"></div>
          <div class="h-3 w-16 bg-gray-700 rounded"></div>
        </div>
      </div>
    </div>`

  container.innerHTML = Array(6).fill(skeletonCard).join('')
}
