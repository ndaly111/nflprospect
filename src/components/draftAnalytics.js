import { getState, setState } from '../state.js'

const TIERS     = ['Elite', 'Starter', 'Backup', 'Bust']
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'DL', 'LB', 'DB']
const ROUNDS    = [1, 2, 3, 4, 5, 6, 7]

const TIER_ORDER = { Elite: 0, Starter: 1, Backup: 2, Bust: 3 }

const TIER_COLORS = {
  Elite:   { bg: 'bg-yellow-500/20', text: 'text-yellow-300', dot: 'bg-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
  Starter: { bg: 'bg-green-500/20',  text: 'text-green-300',  dot: 'bg-green-400',  badge: 'bg-green-500/20 text-green-300 border border-green-500/30'   },
  Backup:  { bg: 'bg-blue-500/20',   text: 'text-blue-300',   dot: 'bg-blue-400',   badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'      },
  Bust:    { bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400',    badge: 'bg-red-500/15 text-red-400 border border-red-500/30'         },
}

const POS_COLORS = {
  QB: 'text-red-400 bg-red-900/30', RB: 'text-green-400 bg-green-900/30',
  WR: 'text-blue-400 bg-blue-900/30', TE: 'text-purple-400 bg-purple-900/30',
  OL: 'text-yellow-400 bg-yellow-900/30', DL: 'text-orange-400 bg-orange-900/30',
  EDGE: 'text-orange-400 bg-orange-900/30', LB: 'text-teal-400 bg-teal-900/30',
  DB: 'text-pink-400 bg-pink-900/30',
}

function tierCounts(players) {
  const c = { Elite: 0, Starter: 0, Backup: 0, Bust: 0, ungraded: 0, total: 0 }
  for (const p of players) {
    c.total++
    const t = p.draftGrade?.tier
    if (t && c[t] !== undefined) c[t]++
    else c.ungraded++
  }
  return c
}

function colorTierCell(tier, count, total) {
  if (!count) return `<td class="px-3 py-2 text-center text-gray-700 text-sm">—</td>`
  const p = Math.round(count / total * 100)
  const c = TIER_COLORS[tier]
  return `<td class="px-3 py-2 text-center">
    <span class="inline-flex flex-col items-center">
      <span class="text-sm font-medium ${c.text}">${count}</span>
      <span class="text-xs text-gray-500">${p}%</span>
    </span>
  </td>`
}

function tableHeader(label = 'Group') {
  return `
    <thead>
      <tr class="border-b border-gray-700">
        <th class="px-3 py-2 text-left text-xs text-gray-400 font-medium">${label}</th>
        <th class="px-3 py-2 text-center text-xs text-gray-400 font-medium">Picks</th>
        <th class="px-3 py-2 text-center text-xs text-yellow-400 font-medium">Elite</th>
        <th class="px-3 py-2 text-center text-xs text-green-400 font-medium">Starter</th>
        <th class="px-3 py-2 text-center text-xs text-blue-400 font-medium">Backup</th>
        <th class="px-3 py-2 text-center text-xs text-red-400 font-medium">Bust</th>
        <th class="px-3 py-2 text-center text-xs text-gray-500 font-medium">TBD</th>
      </tr>
    </thead>`
}

function buildByYear(history) {
  const years = Object.keys(history).sort()
  const rows = years.map(y => {
    const c = tierCounts(history[y])
    const graded = c.total - c.ungraded
    return `
      <tr class="border-b border-gray-800 hover:bg-gray-800/40">
        <td class="px-3 py-2 text-sm font-medium text-white">${y}</td>
        <td class="px-3 py-2 text-center text-sm text-gray-300">${c.total}</td>
        ${colorTierCell('Elite',   c.Elite,   graded)}
        ${colorTierCell('Starter', c.Starter, graded)}
        ${colorTierCell('Backup',  c.Backup,  graded)}
        ${colorTierCell('Bust',    c.Bust,    graded)}
        <td class="px-3 py-2 text-center text-sm text-gray-600">${c.ungraded || '—'}</td>
      </tr>`
  }).join('')

  return `
    <div>
      <p class="text-xs text-gray-500 mb-3">Percentages shown against graded picks only. 2023–2025 classes are still maturing. Pre-2012 OL grades may be incomplete (snap data unavailable).</p>
      <div class="overflow-x-auto rounded-xl border border-gray-700">
        <table class="w-full text-sm">
          ${tableHeader('Draft Year')}
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`
}

function buildByRound(history) {
  const byRound = {}
  for (const r of ROUNDS) byRound[r] = []
  for (const prospects of Object.values(history)) {
    for (const p of prospects) {
      const r = p.actualRound
      if (r && byRound[r]) byRound[r].push(p)
    }
  }

  const rows = ROUNDS.map(r => {
    const c = tierCounts(byRound[r])
    const graded = c.total - c.ungraded
    return `
      <tr class="border-b border-gray-800 hover:bg-gray-800/40">
        <td class="px-3 py-2 text-sm font-medium text-white">Round ${r}</td>
        <td class="px-3 py-2 text-center text-sm text-gray-300">${c.total}</td>
        ${colorTierCell('Elite',   c.Elite,   graded)}
        ${colorTierCell('Starter', c.Starter, graded)}
        ${colorTierCell('Backup',  c.Backup,  graded)}
        ${colorTierCell('Bust',    c.Bust,    graded)}
        <td class="px-3 py-2 text-center text-sm text-gray-600">${c.ungraded || '—'}</td>
      </tr>`
  }).join('')

  return `
    <div>
      <p class="text-xs text-gray-500 mb-3">All draft classes combined (2005–2025). Percentages against graded picks only.</p>
      <div class="overflow-x-auto rounded-xl border border-gray-700">
        <table class="w-full text-sm">
          ${tableHeader('Round')}
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`
}

function buildByPosition(history, activePos) {
  const byPosRound = {}
  for (const pos of POSITIONS) {
    byPosRound[pos] = {}
    for (const r of ROUNDS) byPosRound[pos][r] = []
  }
  for (const prospects of Object.values(history)) {
    for (const p of prospects) {
      const pos = p.positionGroup
      const r   = p.actualRound
      if (pos && byPosRound[pos] && r && byPosRound[pos][r]) {
        byPosRound[pos][r].push(p)
      }
    }
  }

  const posTabs = POSITIONS.map(pos => `
    <button class="pos-analytics-tab px-3 py-1.5 rounded-full text-sm font-medium transition-colors
      ${pos === activePos ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}"
      data-pos="${pos}">${pos}</button>`
  ).join('')

  const rows = ROUNDS.map(r => {
    const players = byPosRound[activePos][r]
    if (!players.length) return ''
    const c = tierCounts(players)
    const graded = c.total - c.ungraded
    return `
      <tr class="border-b border-gray-800 hover:bg-gray-800/40">
        <td class="px-3 py-2 text-sm font-medium text-white">Round ${r}</td>
        <td class="px-3 py-2 text-center text-sm text-gray-300">${c.total}</td>
        ${colorTierCell('Elite',   c.Elite,   graded)}
        ${colorTierCell('Starter', c.Starter, graded)}
        ${colorTierCell('Backup',  c.Backup,  graded)}
        ${colorTierCell('Bust',    c.Bust,    graded)}
        <td class="px-3 py-2 text-center text-sm text-gray-600">${c.ungraded || '—'}</td>
      </tr>`
  }).join('')

  return `
    <div>
      <div class="flex flex-wrap gap-2 mb-4">${posTabs}</div>
      <p class="text-xs text-gray-500 mb-3">All draft classes combined (2005–2025). Percentages against graded picks only.</p>
      <div class="overflow-x-auto rounded-xl border border-gray-700">
        <table class="w-full text-sm">
          ${tableHeader('Round')}
          <tbody>${rows || '<tr><td colspan="7" class="px-3 py-4 text-center text-gray-600">No data</td></tr>'}</tbody>
        </table>
      </div>
    </div>`
}

function buildPlayerList(history, filterPos, filterYear, filterRound) {
  const years = Object.keys(history).sort()

  // Flatten all players, apply filters
  let players = []
  for (const [year, prospects] of Object.entries(history)) {
    if (filterYear !== 'ALL' && year !== filterYear) continue
    for (const p of prospects) {
      if (filterPos !== 'ALL') {
        if (filterPos === 'FANTASY' && !['QB', 'RB', 'WR', 'TE'].includes(p.positionGroup)) continue
        if (filterPos !== 'FANTASY' && p.positionGroup !== filterPos) continue
      }
      if (filterRound !== 'ALL' && String(p.actualRound) !== filterRound) continue
      players.push({ ...p, _year: year })
    }
  }

  // Sort: tier order first, then by draft year desc, then pick asc
  const tierOrd = t => TIER_ORDER[t] ?? 4
  players.sort((a, b) => {
    const ta = tierOrd(a.draftGrade?.tier)
    const tb = tierOrd(b.draftGrade?.tier)
    if (ta !== tb) return ta - tb
    if (a._year !== b._year) return b._year - a._year  // newer class first within tier
    return (a.actualPick || 999) - (b.actualPick || 999)
  })

  // Filter controls
  const posOpts = ['ALL', 'FANTASY', ...POSITIONS].map(p =>
    `<option value="${p}" ${filterPos === p ? 'selected' : ''}>${p === 'ALL' ? 'All Positions' : p === 'FANTASY' ? 'Fantasy (QB/RB/WR/TE)' : p}</option>`
  ).join('')

  const yearOpts = ['ALL', ...years.reverse()].map(y =>
    `<option value="${y}" ${filterYear === y ? 'selected' : ''}>${y === 'ALL' ? 'All Years' : y}</option>`
  ).join('')

  const roundOpts = ['ALL', ...ROUNDS.map(String)].map(r =>
    `<option value="${r}" ${filterRound === r ? 'selected' : ''}>${r === 'ALL' ? 'All Rounds' : 'Round ' + r}</option>`
  ).join('')

  const controls = `
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <select id="player-filter-pos" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
        ${posOpts}
      </select>
      <select id="player-filter-year" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
        ${yearOpts}
      </select>
      <select id="player-filter-round" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
        ${roundOpts}
      </select>
      <span class="text-xs text-gray-500">${players.length} player${players.length !== 1 ? 's' : ''}</span>
    </div>`

  if (!players.length) {
    return controls + `<p class="text-gray-600 text-sm py-8 text-center">No players match these filters.</p>`
  }

  // Group rows by tier for visual separation
  let lastTier = null
  const rows = players.map(p => {
    const tier  = p.draftGrade?.tier
    const tc    = TIER_COLORS[tier] || { badge: 'bg-gray-800 text-gray-400 border border-gray-700', text: 'text-gray-400' }
    const pc    = POS_COLORS[p.positionGroup] || 'text-gray-400 bg-gray-800'
    const pick  = p.actualPick  ? `#${p.actualPick}` : '—'
    const team  = p.actualTeam  || '—'
    const score = p.draftGrade?.score != null ? Math.round(p.draftGrade.score) : null
    const scoreTxt = score != null ? `<span class="text-gray-600 text-xs ml-1">${score}th pct</span>` : ''

    let divider = ''
    if (tier !== lastTier && tier) {
      lastTier = tier
      divider = `<tr><td colspan="6" class="px-3 pt-4 pb-1">
        <span class="text-xs font-semibold uppercase tracking-wider ${tc.text} opacity-60">${tier}</span>
      </td></tr>`
    }

    return divider + `
      <tr class="border-b border-gray-800/60 hover:bg-gray-800/30">
        <td class="px-3 py-2 text-sm font-medium text-white whitespace-nowrap">${p.name}</td>
        <td class="px-3 py-2 text-center text-xs text-gray-400">${p._year}</td>
        <td class="px-3 py-2 text-center text-xs text-gray-400">${pick}</td>
        <td class="px-3 py-2 text-center">
          <span class="px-1.5 py-0.5 rounded text-xs font-medium ${pc}">${p.positionGroup}</span>
        </td>
        <td class="px-3 py-2 text-center text-xs text-gray-400">${team}</td>
        <td class="px-3 py-2 text-center">
          ${tier
            ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${tc.badge}">${tier}</span>${scoreTxt}`
            : `<span class="text-gray-600 text-xs">TBD</span>`}
        </td>
      </tr>`
  }).join('')

  return `
    ${controls}
    <div class="overflow-x-auto rounded-xl border border-gray-700">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700">
            <th class="px-3 py-2 text-left text-xs text-gray-400 font-medium">Player</th>
            <th class="px-3 py-2 text-center text-xs text-gray-400 font-medium">Year</th>
            <th class="px-3 py-2 text-center text-xs text-gray-400 font-medium">Pick</th>
            <th class="px-3 py-2 text-center text-xs text-gray-400 font-medium">Pos</th>
            <th class="px-3 py-2 text-center text-xs text-gray-400 font-medium">Team</th>
            <th class="px-3 py-2 text-center text-xs text-gray-400 font-medium">Grade</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

export function renderDraftAnalytics() {
  const container = document.getElementById('analytics-page')
  if (!container) return

  const {
    draftHistory,
    analyticsTab      = 'year',
    analyticsPos      = 'QB',
    analyticsPlayerPos   = 'ALL',
    analyticsPlayerYear  = 'ALL',
    analyticsPlayerRound = 'ALL',
  } = getState()

  if (!draftHistory || !Object.keys(draftHistory).length) {
    container.innerHTML = `<p class="text-gray-500 text-sm">Loading draft history…</p>`
    return
  }

  const history = Object.fromEntries(
    Object.entries(draftHistory).filter(([y]) => parseInt(y) < 2026)
  )

  const tabs = [
    { id: 'year',     label: 'By Draft Year' },
    { id: 'round',    label: 'By Round'       },
    { id: 'position', label: 'By Position'    },
    { id: 'players',  label: 'Players'        },
  ]

  const tabBar = tabs.map(t => `
    <button class="analytics-tab px-4 py-2 text-sm font-medium rounded-lg transition-colors
      ${analyticsTab === t.id
        ? 'bg-gray-700 text-white'
        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
      data-tab="${t.id}">${t.label}</button>`
  ).join('')

  let content = ''
  if (analyticsTab === 'year')         content = buildByYear(history)
  else if (analyticsTab === 'round')   content = buildByRound(history)
  else if (analyticsTab === 'position') content = buildByPosition(history, analyticsPos)
  else if (analyticsTab === 'players') content = buildPlayerList(history, analyticsPlayerPos, analyticsPlayerYear, analyticsPlayerRound)

  const legend = TIERS.map(t => {
    const c = TIER_COLORS[t]
    return `<span class="flex items-center gap-1.5 text-xs ${c.text}">
      <span class="w-2 h-2 rounded-full ${c.dot} inline-block"></span>${t}
    </span>`
  }).join('')

  container.innerHTML = `
    <div class="flex items-center justify-between flex-wrap gap-3 mb-6">
      <div>
        <h2 class="text-xl font-bold text-white">Historical Draft Results</h2>
        <p class="text-sm text-gray-400 mt-0.5">2005–2025 draft classes · Grades based on career production + accolades</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">${legend}</div>
    </div>

    <div class="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-6 w-fit">
      ${tabBar}
    </div>

    ${content}`

  // Tab switcher
  container.querySelectorAll('.analytics-tab').forEach(btn => {
    btn.addEventListener('click', () => setState({ analyticsTab: btn.dataset.tab }))
  })

  // Position switcher (By Position tab)
  container.querySelectorAll('.pos-analytics-tab').forEach(btn => {
    btn.addEventListener('click', () => setState({ analyticsPos: btn.dataset.pos }))
  })

  // Players tab filters
  container.querySelector('#player-filter-pos')?.addEventListener('change', e => {
    setState({ analyticsPlayerPos: e.target.value })
  })
  container.querySelector('#player-filter-year')?.addEventListener('change', e => {
    setState({ analyticsPlayerYear: e.target.value })
  })
  container.querySelector('#player-filter-round')?.addEventListener('change', e => {
    setState({ analyticsPlayerRound: e.target.value })
  })
}
