import { getState, setState } from '../state.js'
import { TIERS, TIER_COLORS, POSITIONS, POS_COLORS, OFFENSE_GROUPS, DEFENSE_GROUPS } from '../utils/tiers.js'
import { nflTeamLogo, TEAM_NAMES, NFL_DIVISIONS, DIVISION_ORDER } from '../utils/teams.js'
import { buildTeamImpacts, teamDirection, playerImpactScore, formatMoney, dealTier } from '../utils/freeAgencyCalc.js'

const FA_PAGE_SIZE = 40

/* ── Helpers ───────────────────────────────────────────────── */

function tierBadge(tier) {
  const c = TIER_COLORS[tier]
  if (!c) return ''
  return `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c.badge}">${tier}</span>`
}

function posBadge(pg) {
  return `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${POS_COLORS[pg] || 'text-gray-400 bg-gray-800'}">${pg}</span>`
}

function typeBadge(type) {
  const map = {
    signing:   { label: 'SIGNING',   cls: 'text-amber-300 bg-amber-500/20 border border-amber-500/30' },
    trade:     { label: 'TRADE',     cls: 'text-purple-300 bg-purple-500/20 border border-purple-500/30' },
    extension: { label: 'RE-SIGNED', cls: 'text-blue-300 bg-blue-500/20 border border-blue-500/30' },
  }
  const t = map[type]
  if (!t) return ''
  return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.cls}">${t.label}</span>`
}

function impactBadge(val) {
  if (val == null) return ''
  const sign = val > 0 ? '+' : ''
  const cls = val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-gray-500'
  return `<span class="${cls} font-bold text-sm">${sign}${val.toFixed(1)}</span>`
}

function directionCls(dir) {
  if (dir === 'improved') return 'border-green-500/40 bg-green-500/[0.04]'
  if (dir === 'declined') return 'border-red-500/40 bg-red-500/[0.04]'
  return 'border-gray-700 bg-gray-800/50'
}

function sideSummary(label, side) {
  const sign = side.net > 0 ? '+' : ''
  const cls = side.net > 0.5 ? 'text-green-400' : side.net < -0.5 ? 'text-red-400' : 'text-gray-500'
  return `<span class="text-[10px] text-gray-500 uppercase tracking-wider">${label}</span>
          <span class="${cls} font-semibold text-xs">${sign}${side.net.toFixed(1)}</span>`
}

function capBar(capSpace, totalSpent) {
  // Hide cap bar when no real cap data exists
  if (!capSpace) return ''
  const initial = capSpace + totalSpent
  const pct = initial > 0 ? Math.min(100, Math.round((totalSpent / initial) * 100)) : 0
  const color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'
  return `
    <div class="flex items-center gap-2 mt-1">
      <span class="text-[9px] text-gray-500 w-8">Cap</span>
      <div class="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div class="${color} h-full rounded-full" style="width:${pct}%"></div>
      </div>
      <span class="text-[10px] text-gray-400">${formatMoney(capSpace)} left</span>
    </div>`
}

function statLine(tx) {
  const s = tx.lastSeasonStats || {}
  const parts = []
  if (s.passYds != null) parts.push(`${s.passYds.toLocaleString()} yds`, `${s.passTD} TD`, `${s.int} INT`)
  if (s.rushYds != null) parts.push(`${s.rushYds.toLocaleString()} rush`)
  if (s.rec != null) parts.push(`${s.rec} rec`)
  if (s.recYds != null) parts.push(`${s.recYds.toLocaleString()} yds`)
  if (s.recTD != null && !s.passYds) parts.push(`${s.recTD} TD`)
  if (s.sacks != null) parts.push(`${s.sacks} sacks`)
  if (s.tackles != null) parts.push(`${s.tackles} tkl`)
  if (s.int != null && !s.passYds) parts.push(`${s.int} INT`)
  if (s.pd != null) parts.push(`${s.pd} PD`)
  return parts.length ? parts.join(' · ') : ''
}

/* ── Winners & Losers Summary ─────────────────────────────── */

function renderWinnersLosers(transactions) {
  const impacts = buildTeamImpacts(transactions, {})
  const sorted = [...impacts.entries()]
    .filter(([, d]) => d.gained.length + d.lost.length + d.retained.length > 0)
    .sort((a, b) => b[1].overall - a[1].overall)

  if (sorted.length < 2) return ''

  const winners = sorted.slice(0, 5)
  const losers = sorted.slice(-5).reverse()

  function miniTeamRow(abbrev, data, isWinner) {
    const sign = data.overall > 0 ? '+' : ''
    const valCls = data.overall > 0 ? 'text-green-400' : data.overall < 0 ? 'text-red-400' : 'text-gray-500'
    const keyPlayers = isWinner
      ? data.gained.sort((a, b) => b.impact - a.impact).slice(0, 3)
      : data.lost.sort((a, b) => b.impact - a.impact).slice(0, 3)
    const playerNames = keyPlayers.map(p =>
      `<span class="text-gray-400">${p.name}</span>`
    ).join('<span class="text-gray-700 mx-0.5">·</span>')

    return `
      <div class="flex items-center gap-2 py-1.5 border-b border-gray-700/30 last:border-0">
        ${nflTeamLogo(abbrev, 'w-5 h-5')}
        <span class="font-semibold text-white text-xs w-8">${abbrev}</span>
        <span class="${valCls} font-bold text-xs w-10">${sign}${data.overall.toFixed(1)}</span>
        <div class="flex-1 min-w-0 text-[10px] truncate">${playerNames || '<span class="text-gray-600">—</span>'}</div>
      </div>`
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
      <div class="bg-green-500/[0.04] border border-green-500/20 rounded-xl p-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs font-bold text-green-400 uppercase tracking-wider">Biggest Winners</span>
        </div>
        ${winners.map(([a, d]) => miniTeamRow(a, d, true)).join('')}
      </div>
      <div class="bg-red-500/[0.04] border border-red-500/20 rounded-xl p-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs font-bold text-red-400 uppercase tracking-wider">Biggest Losers</span>
        </div>
        ${losers.map(([a, d]) => miniTeamRow(a, d, false)).join('')}
      </div>
    </div>`
}

/* ── Filters ───────────────────────────────────────────────── */

function applyFilters(transactions) {
  const { positionGroup, side, tier, type, team, search } = getState().freeAgencyFilters

  return transactions.filter(tx => {
    if (positionGroup !== 'ALL' && tx.positionGroup !== positionGroup) return false
    if (side === 'offense' && !OFFENSE_GROUPS.includes(tx.positionGroup)) return false
    if (side === 'defense' && !DEFENSE_GROUPS.includes(tx.positionGroup)) return false
    if (tier !== 'ALL' && tx.tier !== tier) return false
    if (type !== 'ALL' && tx.type !== type) return false
    if (team !== 'ALL' && tx.fromTeam !== team && tx.toTeam !== team) return false
    if (search) {
      const q = search.toLowerCase()
      const haystack = `${tx.name} ${TEAM_NAMES[tx.fromTeam] || ''} ${TEAM_NAMES[tx.toTeam] || ''} ${tx.fromTeam} ${tx.toTeam}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

/* ── Filter Bar ────────────────────────────────────────────── */

function renderFilterBar() {
  const f = getState().freeAgencyFilters
  const { freeAgencySort } = getState()

  const posButtons = ['ALL', ...POSITIONS].map(p => {
    const active = f.positionGroup === p
    return `<button class="fa-pos-btn px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors
      ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
      data-pos="${p}">${p}</button>`
  }).join('')

  const sideButtons = ['ALL', 'offense', 'defense'].map(s => {
    const active = f.side === s
    const label = s === 'ALL' ? 'All' : s === 'offense' ? 'OFF' : 'DEF'
    return `<button class="fa-side-btn px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors
      ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
      data-side="${s}">${label}</button>`
  }).join('')

  const typeButtons = ['ALL', 'signing', 'trade', 'extension'].map(t => {
    const active = f.type === t
    const label = { ALL: 'All', signing: 'Signings', trade: 'Trades', extension: 'Re-signed' }[t]
    return `<button class="fa-type-btn px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors
      ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
      data-type="${t}">${label}</button>`
  }).join('')

  const tierOptions = ['ALL', ...TIERS].map(t =>
    `<option value="${t}" ${f.tier === t ? 'selected' : ''}>${t === 'ALL' ? 'All Tiers' : t}</option>`
  ).join('')

  const sortButtons = ['impact', 'division', 'date'].map(s => {
    const active = freeAgencySort === s
    const label = { impact: 'By Impact', division: 'By Division', date: 'By Date' }[s]
    return `<button class="fa-sort-btn px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors
      ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
      data-sort="${s}">${label}</button>`
  }).join('')

  return `
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <div class="flex gap-1 flex-wrap">${posButtons}</div>
      <div class="w-px h-5 bg-gray-700"></div>
      <div class="flex gap-1">${sideButtons}</div>
      <div class="w-px h-5 bg-gray-700"></div>
      <div class="flex gap-1">${typeButtons}</div>
      <div class="w-px h-5 bg-gray-700"></div>
      <select class="fa-tier-select bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1 border border-gray-700">${tierOptions}</select>
      <div class="w-px h-5 bg-gray-700"></div>
      <div class="flex gap-1">${sortButtons}</div>
      <input type="text" class="fa-search bg-gray-800 text-gray-300 text-xs rounded-lg px-3 py-1.5 border border-gray-700 placeholder-gray-600 ml-auto w-48"
             placeholder="Search player, team…" value="${f.search || ''}">
    </div>`
}

/* ── Team Impact Board ─────────────────────────────────────── */

function renderTeamCard(abbrev, data, draftProspects) {
  const dir = teamDirection(data)
  const remaining = data.capSpace - data.totalSpent

  // Find draft needs: positions this team lost impact at
  const needs = Object.entries(data.byPosition)
    .filter(([, d]) => d.net < -0.5)
    .sort((a, b) => a[1].net - b[1].net)
    .map(([pg]) => pg)

  // Find draft prospects projected to this team
  const projectedPicks = draftProspects.filter(p =>
    p.projectedTeam && p.projectedTeam.includes(TEAM_NAMES[abbrev] || '___')
  ).slice(0, 3)

  // Build position breakdown
  const posRows = Object.entries(data.byPosition)
    .sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))
    .map(([pg, d]) => {
      const players = d.players.map(p => {
        const arrow = p.toTeam === abbrev
          ? (p.type === 'extension' ? '↺' : '←')
          : '→'
        const arrowCls = p.toTeam === abbrev
          ? (p.type === 'extension' ? 'text-blue-400' : 'text-green-400')
          : 'text-red-400'
        const tag = p.type === 'trade' ? ' <span class="text-purple-400 text-[8px]">TRADE</span>'
                  : p.type === 'extension' ? ' <span class="text-blue-400 text-[8px]">EXT</span>' : ''
        const stats = statLine(p)
        return `<div class="flex items-center gap-1 text-[11px]">
          <span class="${arrowCls}">${arrow}</span>
          <span class="text-gray-300">${p.name}</span>
          ${tierBadge(p.tier)}${tag}
          <span class="text-gray-600 ml-auto">${formatMoney(p.contract?.aav)}/yr</span>
        </div>
        ${stats ? `<div class="text-[9px] text-gray-600 pl-4 -mt-0.5 mb-0.5">${stats}</div>` : ''}`
      }).join('')

      const netSign = d.net > 0 ? '+' : ''
      const netCls = d.net > 0.5 ? 'text-green-400' : d.net < -0.5 ? 'text-red-400' : 'text-gray-500'
      return `<div class="mb-1.5">
        <div class="flex items-center gap-1.5 mb-0.5">
          ${posBadge(pg)}
          <span class="${netCls} text-[11px] font-semibold">${netSign}${d.net.toFixed(1)}</span>
        </div>
        <div class="pl-3 space-y-0.5">${players}</div>
      </div>`
    }).join('')

  // Draft needs section
  const needsHtml = needs.length > 0
    ? `<div class="mt-2 pt-2 border-t border-gray-700/50">
        <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Draft Needs</div>
        <div class="flex gap-1 flex-wrap">${needs.map(pg => posBadge(pg)).join('')}</div>
        ${projectedPicks.length ? `
          <div class="mt-1.5 space-y-0.5">
            ${projectedPicks.map(p => `
              <div class="text-[10px] text-gray-400">
                <span class="text-gray-500">#${p.projectedPick || '?'}</span>
                <span class="text-gray-300 font-medium">${p.name}</span>
                <span class="text-gray-600">${p.position}</span>
              </div>
            `).join('')}
          </div>` : ''}
      </div>`
    : ''

  return `
    <div class="fa-team-card border rounded-xl p-3 transition-colors cursor-pointer ${directionCls(dir)}" data-team="${abbrev}">
      <div class="flex items-center gap-2 mb-2">
        ${nflTeamLogo(abbrev, 'w-6 h-6')}
        <span class="font-bold text-white text-sm">${abbrev} ${TEAM_NAMES[abbrev] || ''}</span>
        <span class="ml-auto">${impactBadge(data.overall)}</span>
      </div>
      <div class="flex gap-4 mb-1">
        <div class="flex flex-col items-center">${sideSummary('OFF', data.offense)}</div>
        <div class="flex flex-col items-center">${sideSummary('DEF', data.defense)}</div>
        ${data.totalSpent ? `<div class="flex flex-col items-center ml-auto">
          <span class="text-[10px] text-gray-500 uppercase tracking-wider">Spent</span>
          <span class="text-xs text-gray-300 font-medium">${formatMoney(data.totalSpent)}</span>
        </div>` : ''}
      </div>
      ${capBar(remaining, data.totalSpent)}
      <div class="fa-team-detail hidden mt-3 pt-2 border-t border-gray-700/50 space-y-1">
        ${posRows || '<div class="text-xs text-gray-600">No transactions</div>'}
        ${needsHtml}
      </div>
      <div class="text-center mt-1.5">
        <span class="fa-expand-hint text-[10px] text-gray-600">click to expand</span>
      </div>
    </div>`
}

function renderTeamImpactBoard(transactions, teamCap) {
  const filtered = applyFilters(transactions)
  const impacts = buildTeamImpacts(filtered, teamCap)
  const { freeAgencySort, prospects } = getState()
  const draftProspects = prospects || []

  let html = ''

  if (freeAgencySort === 'division') {
    for (const div of DIVISION_ORDER) {
      const divTeams = Object.entries(Object.fromEntries(impacts))
        .filter(([abbrev]) => NFL_DIVISIONS[abbrev] === div)
        .sort((a, b) => b[1].overall - a[1].overall)

      html += `<div class="mb-6">
        <h3 class="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">${div}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          ${divTeams.map(([abbrev, data]) => renderTeamCard(abbrev, data, draftProspects)).join('')}
        </div>
      </div>`
    }
  } else {
    const sorted = [...impacts.entries()].sort((a, b) => b[1].overall - a[1].overall)
    html = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${sorted.map(([abbrev, data]) => renderTeamCard(abbrev, data, draftProspects)).join('')}
    </div>`
  }

  return html
}

/* ── Transaction Feed ──────────────────────────────────────── */

function renderTransactionRow(tx) {
  const deal = dealTier(tx.contract?.aav)
  const contractStr = tx.contract
    ? (tx.contract.aav
        ? `${tx.contract.years}yr / ${formatMoney(tx.contract.aav)} AAV`
        : `${tx.contract.years}yr deal`)
    : ''

  const teamFlow = tx.type === 'extension'
    ? `${nflTeamLogo(tx.toTeam)} <span class="text-gray-300 text-xs">${tx.toTeam}</span> <span class="text-blue-400 text-[10px]">Extended</span>`
    : `${nflTeamLogo(tx.fromTeam)} <span class="text-gray-500 text-xs">${tx.fromTeam || 'FA'}</span>
       <span class="text-gray-600 mx-1">→</span>
       ${nflTeamLogo(tx.toTeam)} <span class="text-gray-300 text-xs font-medium">${tx.toTeam}</span>`

  const tradeInfo = tx.type === 'trade' && tx.tradeDetails
    ? `<div class="text-[10px] text-purple-300/70 mt-0.5 pl-4">
        ${tx.toTeam} sent: ${tx.tradeDetails.toGives.join(', ')}
      </div>`
    : ''

  const stats = statLine(tx)

  return `
    <div class="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 hover:border-gray-600 transition-colors">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap mb-1">
          ${typeBadge(tx.type)}
          ${posBadge(tx.positionGroup)}
          ${tierBadge(tx.tier)}
          <span class="font-semibold text-white text-sm">${tx.name}</span>
          <span class="text-[10px] text-gray-600">${tx.age ? tx.age + ' yrs' : ''}</span>
        </div>
        <div class="flex items-center gap-1 mb-1">${teamFlow}</div>
        ${tradeInfo}
        ${stats ? `<div class="text-[11px] text-gray-400 mt-1 mb-1">${stats}</div>` : ''}
        <div class="flex items-center gap-2 flex-wrap">
          ${contractStr ? `<span class="text-xs text-gray-400">${contractStr}</span>` : ''}
          ${deal ? `<span class="text-[9px] px-1.5 py-0.5 rounded-full ${deal.cls}">${deal.label}</span>` : ''}
        </div>
      </div>
      <div class="flex flex-col items-end flex-shrink-0">
        ${impactBadge(playerImpactScore(tx))}
        <span class="text-[9px] text-gray-600 mt-0.5">${tx.date || ''}</span>
      </div>
    </div>`
}

function renderTransactionFeed(transactions) {
  const { freeAgencySort } = getState()
  const filtered = applyFilters(transactions)

  let sorted
  if (freeAgencySort === 'date') {
    sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  } else {
    sorted = [...filtered].sort((a, b) => playerImpactScore(b) - playerImpactScore(a))
  }

  if (!sorted.length) {
    return '<div class="text-gray-500 text-sm py-8 text-center">No transactions match your filters.</div>'
  }

  // Paginate
  const page = sorted.slice(0, FA_PAGE_SIZE)
  const remaining = sorted.length - FA_PAGE_SIZE

  // Group by date if date sort is active
  let content
  if (freeAgencySort === 'date') {
    const byDate = new Map()
    for (const tx of page) {
      const d = tx.date || 'Unknown'
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d).push(tx)
    }
    content = [...byDate.entries()].map(([date, txs]) => `
      <div class="mb-4">
        <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2 sticky top-0 bg-gray-950/80 py-1">${date}</div>
        <div class="space-y-2">${txs.map(renderTransactionRow).join('')}</div>
      </div>
    `).join('')
  } else {
    content = `<div class="space-y-2">${page.map(renderTransactionRow).join('')}</div>`
  }

  const loadMoreBtn = remaining > 0
    ? `<div class="flex justify-center py-4">
        <button class="fa-load-more px-6 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
          Load ${Math.min(FA_PAGE_SIZE, remaining)} more
          <span class="text-gray-500 text-xs ml-1">(${remaining} left)</span>
        </button>
      </div>`
    : ''

  return `
    <div class="text-[10px] text-gray-600 mb-2">${sorted.length} transactions</div>
    ${content}
    ${loadMoreBtn}`
}

/* ── Main Render ───────────────────────────────────────────── */

let faVisibleCount = FA_PAGE_SIZE

export function renderFreeAgency() {
  const container = document.getElementById('freeagency-page')
  if (!container) return

  let { freeAgency, freeAgencyYear, freeAgencyTab } = getState()

  // Auto-select the most recent year if current selection doesn't exist
  const availableYears = Object.keys(freeAgency).sort()
  if (!freeAgency[freeAgencyYear] && availableYears.length) {
    freeAgencyYear = availableYears[availableYears.length - 1]
    setState({ freeAgencyYear })
  }

  const yearData = freeAgency[freeAgencyYear]
  if (!yearData) {
    container.innerHTML = '<div class="text-gray-500 text-center py-12">No free agency data available.</div>'
    return
  }

  const transactions = yearData.transactions || []
  const teamCap = yearData.teamCap || {}

  const tabs = [
    { id: 'teams', label: 'Team Impact' },
    { id: 'transactions', label: 'Transactions' },
  ]

  const tabBar = tabs.map(t => {
    const active = freeAgencyTab === t.id
    return `<button class="fa-tab px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
      ${active ? 'border-blue-500 text-blue-400' : 'text-gray-400 hover:text-white border-transparent'}"
      data-tab="${t.id}">${t.label}
      ${t.id === 'transactions' ? `<span class="text-[10px] text-gray-600 ml-1">(${transactions.length})</span>` : ''}
    </button>`
  }).join('')

  const yearSelector = Object.keys(freeAgency).sort().reverse().map(y => {
    const sel = y === freeAgencyYear ? 'selected' : ''
    return `<option value="${y}" ${sel}>${y}</option>`
  }).join('')

  // Winners/Losers summary (only for team impact tab)
  const summary = freeAgencyTab === 'teams' ? renderWinnersLosers(transactions) : ''

  let content = ''
  if (freeAgencyTab === 'teams') {
    content = renderTeamImpactBoard(transactions, teamCap)
  } else {
    faVisibleCount = FA_PAGE_SIZE  // reset pagination on re-render
    content = renderTransactionFeed(transactions)
  }

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold text-white flex items-center gap-2">
        Free Agency Tracker
        <select class="fa-year-select bg-gray-800 text-gray-300 text-sm rounded-lg px-2 py-1 border border-gray-700 font-normal">${yearSelector}</select>
      </h1>
      <div class="text-xs text-gray-500">${transactions.length} transactions</div>
    </div>
    <div class="flex border-b border-gray-700 mb-4">${tabBar}</div>
    ${summary}
    ${renderFilterBar()}
    <div id="fa-content">${content}</div>`

  // Wire events
  container.querySelectorAll('.fa-tab').forEach(btn => {
    btn.addEventListener('click', () => setState({ freeAgencyTab: btn.dataset.tab }))
  })

  container.querySelector('.fa-year-select')?.addEventListener('change', e => {
    setState({ freeAgencyYear: e.target.value })
  })

  container.querySelectorAll('.fa-pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = { ...getState().freeAgencyFilters, positionGroup: btn.dataset.pos }
      setState({ freeAgencyFilters: f })
    })
  })

  container.querySelectorAll('.fa-side-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = { ...getState().freeAgencyFilters, side: btn.dataset.side }
      setState({ freeAgencyFilters: f })
    })
  })

  container.querySelectorAll('.fa-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = { ...getState().freeAgencyFilters, type: btn.dataset.type }
      setState({ freeAgencyFilters: f })
    })
  })

  container.querySelector('.fa-tier-select')?.addEventListener('change', e => {
    const f = { ...getState().freeAgencyFilters, tier: e.target.value }
    setState({ freeAgencyFilters: f })
  })

  container.querySelectorAll('.fa-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => setState({ freeAgencySort: btn.dataset.sort }))
  })

  const searchInput = container.querySelector('.fa-search')
  if (searchInput) {
    let debounce
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        const f = { ...getState().freeAgencyFilters, search: searchInput.value }
        setState({ freeAgencyFilters: f })
      }, 200)
    })
  }

  // Load more button for transactions
  container.querySelector('.fa-load-more')?.addEventListener('click', () => {
    faVisibleCount += FA_PAGE_SIZE
    // Re-render just the content area
    const contentEl = document.getElementById('fa-content')
    if (contentEl && freeAgencyTab === 'transactions') {
      const allFiltered = applyFilters(transactions)
      const { freeAgencySort: sort } = getState()
      let sorted
      if (sort === 'date') {
        sorted = [...allFiltered].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      } else {
        sorted = [...allFiltered].sort((a, b) => playerImpactScore(b) - playerImpactScore(a))
      }
      const page = sorted.slice(0, faVisibleCount)
      const remaining = sorted.length - faVisibleCount

      let rows
      if (sort === 'date') {
        const byDate = new Map()
        for (const tx of page) {
          const d = tx.date || 'Unknown'
          if (!byDate.has(d)) byDate.set(d, [])
          byDate.get(d).push(tx)
        }
        rows = [...byDate.entries()].map(([date, txs]) => `
          <div class="mb-4">
            <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">${date}</div>
            <div class="space-y-2">${txs.map(renderTransactionRow).join('')}</div>
          </div>
        `).join('')
      } else {
        rows = `<div class="space-y-2">${page.map(renderTransactionRow).join('')}</div>`
      }

      contentEl.innerHTML = `
        <div class="text-[10px] text-gray-600 mb-2">${sorted.length} transactions</div>
        ${rows}
        ${remaining > 0 ? `
          <div class="flex justify-center py-4">
            <button class="fa-load-more px-6 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
              Load ${Math.min(FA_PAGE_SIZE, remaining)} more
              <span class="text-gray-500 text-xs ml-1">(${remaining} left)</span>
            </button>
          </div>` : ''}`

      // Re-wire load more
      contentEl.querySelector('.fa-load-more')?.addEventListener('click', () => {
        faVisibleCount += FA_PAGE_SIZE
        renderFreeAgency()
      })
    }
  })

  // Team card expand/collapse
  container.querySelectorAll('.fa-team-card').forEach(card => {
    card.addEventListener('click', () => {
      const detail = card.querySelector('.fa-team-detail')
      const hint = card.querySelector('.fa-expand-hint')
      if (detail) {
        detail.classList.toggle('hidden')
        if (hint) hint.textContent = detail.classList.contains('hidden') ? 'click to expand' : 'click to collapse'
      }
    })
  })
}
