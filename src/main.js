import './style.css'
import { getState, setState, subscribe } from './state.js'
import { renderFilterBar } from './components/filterBar.js'
import { renderProspectGrid, renderSkeleton } from './components/prospectGrid.js'
import { renderNewsPanel } from './components/newsPanel.js'
import { timeAgo } from './utils/format.js'

// Resolve base path for data fetching
const BASE = import.meta.env.BASE_URL

function getDataUrl(file) {
  return `${BASE}data/${file}`
}

function renderApp() {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen bg-gray-950">
      <!-- Header -->
      <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🏈</span>
            <div>
              <h1 class="text-lg font-bold text-white leading-tight">NFL Draft Tracker 2026</h1>
              <p class="text-xs text-gray-400" id="header-meta">Loading…</p>
            </div>
          </div>
          <div id="source-status" class="hidden sm:flex items-center gap-3 text-xs text-gray-500"></div>
        </div>
      </header>

      <!-- Filters -->
      <div class="bg-gray-900 border-b border-gray-800">
        <div class="max-w-7xl mx-auto px-4 py-3" id="filter-bar"></div>
      </div>

      <!-- Main Grid -->
      <main class="max-w-7xl mx-auto px-4 py-6">
        <div id="error-banner" class="hidden mb-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm"></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="prospect-grid"></div>
      </main>

      <!-- News Section -->
      <section class="max-w-7xl mx-auto px-4 pb-10">
        <h2 class="text-lg font-bold text-white mb-4">Draft News</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="news-panel">
          <div class="col-span-full text-gray-600 text-sm">Loading news…</div>
        </div>
      </section>
    </div>`

  renderSkeleton()
  renderFilterBar()
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
    statusEl.innerHTML = Object.entries(meta.sources).map(([src, info]) => {
      const ok = info.status === 'ok' || info.status === 'stub'
      const label = src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      return `<span class="${ok ? 'text-green-500' : 'text-red-500'}">● ${label}</span>`
    }).join(' ')
  }
}

async function loadData() {
  setState({ loading: true, error: null })

  try {
    const [prospectsRes, newsRes, metaRes] = await Promise.all([
      fetch(getDataUrl('prospects.json')),
      fetch(getDataUrl('news.json')),
      fetch(getDataUrl('meta.json')),
    ])

    const [prospects, news, meta] = await Promise.all([
      prospectsRes.ok ? prospectsRes.json() : [],
      newsRes.ok ? newsRes.json() : [],
      metaRes.ok ? metaRes.json() : {},
    ])

    setState({ prospects, news, meta, loading: false })
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

subscribe(state => {
  if (!state.loading) {
    renderProspectGrid()
    renderNewsPanel(state.news)
    updateHeader()
  }
})

loadData()
