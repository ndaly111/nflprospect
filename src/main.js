import './style.css'
import { getState, setState, subscribe } from './state.js'
import { renderFilterBar } from './components/filterBar.js'
import { renderProspectGrid, renderSkeleton } from './components/prospectGrid.js'
import { renderNewsPanel } from './components/newsPanel.js'
import { renderCombinePanel } from './components/combinePanel.js'
import { renderCombineSpotlight } from './components/combineSpotlight.js'
import { renderMockDraftBoard } from './components/mockDraftBoard.js'
import { initGlossaryModal } from './components/glossaryModal.js'
import { renderDraftAnalytics } from './components/draftAnalytics.js'
import { renderFreeAgency } from './components/freeAgency.js'
import { timeAgo } from './utils/format.js'

const BASE = import.meta.env.BASE_URL

function getDataUrl(file) {
  return `${BASE}data/${file}`
}

function renderApp() {
  document.getElementById('app').innerHTML = `
    <div class="alm-shell min-h-screen">
      <div class="alm-page-frame">
        <div class="alm-dateline" aria-hidden="true">
          <span class="seal">LIVE BIG BOARD</span>
          <span class="right">
            <span id="header-vol">CLASS · '26</span>
            <span id="header-issuedate"></span>
            <span>BROADCAST FROM THE WAR ROOM</span>
          </span>
        </div>

        <header class="alm-masthead">
          <h1 class="alm-mark">
            <span class="pros">Prospect</span><span class="pect">// 26</span>
          </h1>
          <div class="alm-strap">
            <span class="vol" id="header-meta">Loading…</span>
            <h2>Consensus from <em>four boards</em>. Combine. Tape. The wire. <em>Live</em>.</h2>
          </div>
          <nav class="alm-nav" aria-label="Primary">
            <div class="alm-tabs">
              <button id="nav-prospects" class="alm-tab is-active">Prospects</button>
              <button id="nav-analytics" class="alm-tab">Draft Results</button>
              <button id="nav-freeagency" class="alm-tab">Free Agency</button>
            </div>
            <div class="alm-updated"><span class="dot"></span><span id="header-updated">Loading data…</span></div>
            <div id="source-status" class="hidden alm-source-status"></div>
          </nav>
        </header>
      </div>

      <!-- Prospects page -->
      <div id="page-prospects">
        <div class="alm-page-frame">
          <div class="alm-seclabel">
            <span class="num">01</span> THE BIG BOARD <span class="pill">filters &amp; sort</span>
          </div>
          <div id="filter-bar"></div>
        </div>

        <main class="alm-page-frame" style="padding-top: 8px; padding-bottom: 8px;">
          <div id="error-banner" class="hidden mb-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm"></div>
          <div class="alm-seclabel"><span class="num">02</span> PROSPECTS <span id="result-count" style="font-family:var(--font-mono);letter-spacing:0.18em;font-size:11px;text-transform:uppercase;color:var(--steel);font-style:normal;font-weight:500;"></span></div>
          <div id="prospect-grid"></div>
        </main>

        <section class="alm-page-frame alm-section" id="mock-draft-section" style="display:none">
          <h2>Mock Board <span class="strap">Tankathon · click to view prospect</span></h2>
          <div id="mock-draft-board"></div>
        </section>

        <section class="alm-page-frame alm-section" id="combine-spotlight-section" style="display:none">
          <h2>Combine Spotlight <span id="combine-spotlight-year" class="strap">NFL Combine</span></h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" id="combine-spotlight"></div>
        </section>

        <section class="alm-page-frame alm-section">
          <h2>The Wire <span class="strap">ESPN · Draft News</span></h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="news-panel">
            <div class="col-span-full" style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--steel-dim);">Loading wire…</div>
          </div>
        </section>

        <footer class="alm-page-frame alm-foot">
          <span>© PROSPECT // 26 · LIVE BIG BOARD</span>
          <em>"They grade tape and chase coffee." — area scout</em>
          <span>SET IN SAIRA · SORA · IBM PLEX MONO</span>
        </footer>
      </div>

      <!-- Analytics page -->
      <div id="page-analytics" style="display:none">
        <main class="alm-page-frame" style="padding-top:18px;padding-bottom:48px;">
          <div id="analytics-page"></div>
        </main>
      </div>

      <!-- Free Agency page -->
      <div id="page-freeagency" style="display:none">
        <main class="alm-page-frame" style="padding-top:18px;padding-bottom:48px;">
          <div id="freeagency-page"></div>
        </main>
      </div>
    </div>`

  // Telemetry: live local time in the dateline
  const issueEl = document.getElementById('header-issuedate')
  if (issueEl) {
    const tick = () => {
      const d = new Date()
      const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      const date = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()
      issueEl.textContent = `${date} · ${time} ET`
    }
    tick()
    setInterval(tick, 30000)
  }
}

function updateNavTabs() {
  const { activePage } = getState()
  for (const [id, page] of [['nav-prospects', 'prospects'], ['nav-analytics', 'analytics'], ['nav-freeagency', 'freeAgency']]) {
    const el = document.getElementById(id)
    if (!el) continue
    el.classList.toggle('is-active', activePage === page)
  }

  document.getElementById('page-prospects').style.display = activePage === 'prospects' ? '' : 'none'
  document.getElementById('page-analytics').style.display = activePage === 'analytics' ? '' : 'none'
  document.getElementById('page-freeagency').style.display = activePage === 'freeAgency' ? '' : 'none'
}

function bindNavTabs() {
  document.getElementById('nav-prospects')?.addEventListener('click', () => setState({ activePage: 'prospects' }))
  document.getElementById('nav-analytics')?.addEventListener('click', () => setState({ activePage: 'analytics' }))
  document.getElementById('nav-freeagency')?.addEventListener('click', () => setState({ activePage: 'freeAgency' }))
}

function updateHeader() {
  const { meta, prospects } = getState()
  const metaEl = document.getElementById('header-meta')
  const updatedEl = document.getElementById('header-updated')
  const statusEl = document.getElementById('source-status')
  if (!metaEl) return

  const count = prospects.length
  const ago = timeAgo(meta.lastUpdated)
  const draftYearForCountdown = meta?.draftYear
  const draftDate = draftYearForCountdown
    ? new Date(`${draftYearForCountdown}-04-25T00:00:00`)
    : null
  const daysUntil = draftDate ? Math.ceil((draftDate - Date.now()) / 86400000) : 0
  const countdown = daysUntil > 0 ? ` · Draft in ${daysUntil}d` : ''
  const classLabel = draftYearForCountdown ? `Class of '${String(draftYearForCountdown).slice(-2)}` : 'A Scouting Almanac'
  metaEl.textContent = `${classLabel} · ${count} prospect${count !== 1 ? 's' : ''}${countdown}`
  if (updatedEl) updatedEl.textContent = `Updated ${ago}`

  const combineYearEl = document.getElementById('combine-spotlight-year')
  if (combineYearEl && draftYearForCountdown) {
    combineYearEl.textContent = `${draftYearForCountdown} NFL Combine`
  }

  if (meta.sources && statusEl) {
    statusEl.classList.remove('hidden')
    const SOURCE_LABELS = {
      tankathon: 'Tankathon',
      espn: 'ESPN',
      walter_football: 'Walter F.',
      cbs_sports: 'CBS',
    }
    statusEl.innerHTML = Object.entries(meta.sources).map(([src, info]) => {
      const ok = info.status === 'ok'
      const label = SOURCE_LABELS[src] || src.replace(/_/g, ' ')
      const countTxt = info.count ? ` ${info.count}` : ''
      return `<span class="${ok ? 'ok' : 'down'}">${ok ? '◆' : '◇'} ${label}${countTxt}</span>`
    }).join('')
  }
}

async function loadData() {
  setState({ loading: true, error: null })

  try {
    const [prospectsRes, newsRes, metaRes, historicalRes, draftHistoryRes, freeAgencyRes, wrTargetRes, consensusRes] = await Promise.all([
      fetch(getDataUrl('prospects.json')),
      fetch(getDataUrl('news.json')),
      fetch(getDataUrl('meta.json')),
      fetch(getDataUrl('historical.json')),
      fetch(getDataUrl('draft_history.json')),
      fetch(getDataUrl('free_agency.json')),
      fetch(getDataUrl('wr_target_history.json')),
      fetch(getDataUrl('consensus_accuracy/latest.json')),
    ])

    const [prospects, news, meta, historical, draftHistory, freeAgency, wrTargetHistory, consensusAccuracy] = await Promise.all([
      prospectsRes.ok ? prospectsRes.json() : [],
      newsRes.ok ? newsRes.json() : [],
      metaRes.ok ? metaRes.json() : {},
      historicalRes.ok ? historicalRes.json() : {},
      draftHistoryRes.ok ? draftHistoryRes.json() : {},
      freeAgencyRes.ok ? freeAgencyRes.json() : {},
      wrTargetRes.ok ? wrTargetRes.json() : null,
      consensusRes.ok ? consensusRes.json() : null,
    ])

    // Default the viewing year to whatever draft we're currently tracking,
    // unless the user already changed it (e.g. via deep link or earlier session).
    const { draftYear: currentDraftYear } = getState()
    const resolvedDraftYear = currentDraftYear ?? (meta?.draftYear ?? null)

    setState({ prospects, news, meta, historical, draftHistory, freeAgency, wrTargetHistory, consensusAccuracy, draftYear: resolvedDraftYear, loading: false })

    // Deep-link: auto-expand a prospect from ?p=<id> query param
    const deepId = new URLSearchParams(location.search).get('p')
    if (deepId) {
      const match = prospects.find(p => p.id === deepId)
      if (match) {
        setState({ expandedCardId: deepId })
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
initGlossaryModal()
renderSkeleton()
renderFilterBar()
bindNavTabs()

// Load watchlist from localStorage
const savedWatchlist = JSON.parse(localStorage.getItem('nfl-watchlist') || '[]')
if (savedWatchlist.length) setState({ watchlist: savedWatchlist })

// Sync watchlist changes to localStorage
subscribe(state => {
  localStorage.setItem('nfl-watchlist', JSON.stringify(state.watchlist))
}, ['watchlist'])

// Page switching
subscribe(() => {
  updateNavTabs()
}, ['activePage'])

// Analytics page re-renders on data load or any analytics filter change
subscribe(state => {
  if (!state.loading && state.activePage === 'analytics') {
    renderDraftAnalytics()
  }
}, ['draftHistory', 'prospects', 'loading', 'activePage', 'analyticsTab', 'analyticsPos', 'analyticsPlayerPos', 'analyticsPlayerYear', 'analyticsPlayerRound', 'comparePos', 'compareView', 'compareSort', 'compareSortDir', 'compareRound', 'consensusAccuracy'])

// Free Agency page re-renders on data load or any FA filter/tab change
subscribe(state => {
  if (!state.loading && state.activePage === 'freeAgency') {
    renderFreeAgency()
  }
}, ['freeAgency', 'loading', 'activePage', 'freeAgencyYear', 'freeAgencyTab', 'freeAgencyFilters', 'freeAgencySort'])

// Grid re-renders when data/filters/sort/viewMode/watchlist/draftYear change — NOT on card expand
subscribe(state => {
  if (!state.loading) {
    renderProspectGrid()
  }
}, ['prospects', 'filters', 'sort', 'listSort', 'loading', 'viewMode', 'watchlist', 'draftYear', 'draftHistory'])

// News renders once on data load
subscribe(state => {
  if (!state.loading) {
    renderNewsPanel(state.news)
  }
}, ['news', 'loading'])

// Combine spotlight re-renders when prospects load or draft class changes
subscribe(state => {
  if (!state.loading) {
    const activeClass = (state.draftYear && state.draftHistory?.[String(state.draftYear)])
      ? state.draftHistory[String(state.draftYear)]
      : state.prospects
    renderCombineSpotlight()
    const combineSection = document.getElementById('combine-spotlight-section')
    const hasAnyDrills = activeClass.some(p => {
      const c = p.combineData || {}
      return c.forty || c.vertical || c.broadJump || c.bench || c.cone
    })
    if (combineSection) combineSection.style.display = hasAnyDrills ? '' : 'none'
  }
}, ['prospects', 'draftYear', 'draftHistory', 'loading'])

// Mock draft renders once when prospects load
subscribe(state => {
  if (!state.loading) {
    renderMockDraftBoard()
    const mockSection = document.getElementById('mock-draft-section')
    if (mockSection) mockSection.style.display = state.prospects.some(p => p.projectedPick) ? '' : 'none'
  }
}, ['prospects', 'loading'])

// Header updates when meta/prospects change
subscribe(state => {
  if (!state.loading) {
    updateHeader()
  }
}, ['meta', 'prospects', 'loading'])

// Filter bar re-renders on filter/sort/historical/view/watchlist/year changes
subscribe(() => {
  renderFilterBar()
}, ['filters', 'sort', 'historical', 'historicalYear', 'viewMode', 'watchlist', 'meta', 'draftYear', 'draftHistory'])

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
