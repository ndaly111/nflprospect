import './style.css'
import { getState, setState, subscribe } from './state.js'
import { renderFilterBar } from './components/filterBar.js'
import { renderProspectGrid, renderSkeleton } from './components/prospectGrid.js'
import { renderNewsPanel } from './components/newsPanel.js'
import { renderCombinePanel } from './components/combinePanel.js'
import { timeAgo } from './utils/format.js'

const BASE = import.meta.env.BASE_URL

function getDataUrl(file) {
  return `${BASE}data/${file}`
}

function renderApp() {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen bg-gray-950">
      <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🏈</span>
            <div>
              <h1 class="text-lg font-bold text-white leading-tight">NFL Draft Tracker</h1>
              <p class="text-xs text-gray-400" id="header-meta">Loading…</p>
            </div>
          </div>
          <div id="source-status" class="hidden sm:flex items-center gap-2 flex-wrap text-xs"></div>
        </div>
      </header>

      <div class="bg-gray-900 border-b border-gray-800">
        <div class="max-w-7xl mx-auto px-4 py-3" id="filter-bar"></div>
      </div>

      <main class="max-w-7xl mx-auto px-4 py-6">
        <div id="error-banner" class="hidden mb-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm"></div>
        <div id="result-count" class="text-xs text-gray-500 mb-3"></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="prospect-grid"></div>
      </main>

      <section class="max-w-7xl mx-auto px-4 pb-10">
        <h2 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
          Draft News <span class="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">ESPN</span>
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="news-panel">
          <div class="col-span-full text-gray-600 text-sm">Loading news…</div>
        </div>
      </section>
    </div>`
}

function updateHeader() {
  const { meta, prospects } = getState()
  const metaEl = document.getElementById('header-meta')
  const statusEl = document.getElementById('source-status')
  if (!metaEl) return

  const count = prospects.length
  const ago = timeAgo(meta.lastUpdated)
  metaEl.textContent = `Updated ${ago} · ${count} prospect${count !== 1 ? 's' : ''}`

  if (meta.sources && statusEl) {
    statusEl.classList.remove('hidden')
    const SOURCE_LABELS = {
      tankathon: 'Tankathon',
      espn: 'ESPN',
      walter_football: 'Walter Football',
      pfn: 'PFN',
    }
    statusEl.innerHTML = Object.entries(meta.sources).map(([src, info]) => {
      const ok = info.status === 'ok'
      const label = SOURCE_LABELS[src] || src.replace(/_/g, ' ')
      const countTxt = info.count ? ` (${info.count})` : ''
      return `<span class="flex items-center gap-1 ${ok ? 'text-green-400' : 'text-gray-600'}">
        <span class="text-[10px]">●</span>${label}${countTxt}</span>`
    }).join('')
  }
}

function updateResultCount() {
  const el = document.getElementById('result-count')
  if (!el) return
  const { prospects, filters, sort } = getState()
  const { applyFilters } = window.__filters || {}
  // Just show total for now; filter count updated in grid render
  el.textContent = ''
}

async function loadData() {
  setState({ loading: true, error: null })

  try {
    const [prospectsRes, newsRes, metaRes, historicalRes] = await Promise.all([
      fetch(getDataUrl('prospects.json')),
      fetch(getDataUrl('news.json')),
      fetch(getDataUrl('meta.json')),
      fetch(getDataUrl('historical.json')),
    ])

    const [prospects, news, meta, historical] = await Promise.all([
      prospectsRes.ok ? prospectsRes.json() : [],
      newsRes.ok ? newsRes.json() : [],
      metaRes.ok ? metaRes.json() : {},
      historicalRes.ok ? historicalRes.json() : {},
    ])

    setState({ prospects, news, meta, historical, loading: false })

    // Deep-link: auto-expand a prospect from ?p=<id> query param
    const deepId = new URLSearchParams(location.search).get('p')
    if (deepId) {
      const match = prospects.find(p => p.id === deepId)
      if (match) {
        setState({ expandedCardId: deepId })
        // Scroll to card after grid renders
        setTimeout(() => {
          const el = document.querySelector(`.prospect-card[data-id="${deepId}"]`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 150)
      }
    }
  } catch (err) {
    console.error('Failed to load data:', err)
    setState({ loading: false, error: 'Failed to load prospect data. Please try again.' })
    const errEl = document.getElementById('error-banner')
    if (errEl) {
      errEl.classList.remove('hidden')
      errEl.textContent = getState().error
    }
  }
}

// Boot
renderApp()
renderSkeleton()
renderFilterBar()

// Grid only re-renders when data/filters/sort change — NOT on card expand
subscribe(state => {
  if (!state.loading) {
    renderProspectGrid()
  }
}, ['prospects', 'filters', 'sort', 'loading'])

// News renders once on data load
subscribe(state => {
  if (!state.loading) {
    renderNewsPanel(state.news)
  }
}, ['news', 'loading'])

// Header updates when meta/prospects change
subscribe(state => {
  if (!state.loading) {
    updateHeader()
  }
}, ['meta', 'prospects', 'loading'])

// Filter bar re-renders on filter/sort/historical changes
subscribe(() => {
  renderFilterBar()
}, ['filters', 'sort', 'historical', 'historicalYear'])

// When historicalYear changes, update the combine tab for the currently expanded card
subscribe(state => {
  const { expandedCardId, prospects } = state
  if (!expandedCardId) return
  const prospect = prospects.find(p => p.id === expandedCardId)
  if (!prospect) return
  const combineEl = document.querySelector(`.tab-content[data-tab="combine"][data-card="${expandedCardId}"]`)
  if (combineEl) {
    combineEl.innerHTML = renderCombinePanel(prospect.combineData, prospect.positionGroup, prospect.playerComps)
  }
}, ['historicalYear'])

loadData()
