import { getState, setState } from '../state.js'

const TIERS    = ['Elite', 'Starter', 'Backup', 'Bust']
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'DL', 'LB', 'DB']
const ROUNDS   = [1, 2, 3, 4, 5, 6, 7]

const TIER_COLORS = {
  Elite:   { bg: 'bg-yellow-500/20', text: 'text-yellow-300', dot: 'bg-yellow-400' },
  Starter: { bg: 'bg-green-500/20',  text: 'text-green-300',  dot: 'bg-green-400'  },
  Backup:  { bg: 'bg-blue-500/20',   text: 'text-blue-300',   dot: 'bg-blue-400'   },
  Bust:    { bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400'    },
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

function pct(n, total) {
  if (!total) return ''
  return Math.round(n / total * 100) + '%'
}

function tierCell(count, total) {
  if (!count) return `<td class="px-3 py-2 text-center text-gray-700 text-sm">—</td>`
  const p = Math.round(count / total * 100)
  return `<td class="px-3 py-2 text-center text-sm text-gray-200">${count} <span class="text-gray-500 text-xs">${p}%</span></td>`
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
      <p class="text-xs text-gray-500 mb-3">Percentages shown against graded picks only. 2024–2025 classes are still maturing.</p>
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
      <p class="text-xs text-gray-500 mb-3">All draft classes combined (2020–2025). Percentages against graded picks only.</p>
      <div class="overflow-x-auto rounded-xl border border-gray-700">
        <table class="w-full text-sm">
          ${tableHeader('Round')}
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`
}

function buildByPosition(history, activePos) {
  // Build lookup: pos → round → players
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
      <p class="text-xs text-gray-500 mb-3">All draft classes combined (2020–2025). Percentages against graded picks only.</p>
      <div class="overflow-x-auto rounded-xl border border-gray-700">
        <table class="w-full text-sm">
          ${tableHeader('Round')}
          <tbody>${rows || '<tr><td colspan="7" class="px-3 py-4 text-center text-gray-600">No data</td></tr>'}</tbody>
        </table>
      </div>
    </div>`
}

export function renderDraftAnalytics() {
  const container = document.getElementById('analytics-page')
  if (!container) return

  const { draftHistory, analyticsTab = 'year', analyticsPos = 'QB' } = getState()

  if (!draftHistory || !Object.keys(draftHistory).length) {
    container.innerHTML = `<p class="text-gray-500 text-sm">Loading draft history…</p>`
    return
  }

  // Filter to historical years only (not 2026 current prospects which have no grades)
  const history = Object.fromEntries(
    Object.entries(draftHistory).filter(([y]) => parseInt(y) < 2026)
  )

  const tabs = [
    { id: 'year',     label: 'By Draft Year' },
    { id: 'round',    label: 'By Round'       },
    { id: 'position', label: 'By Position'    },
  ]

  const tabBar = tabs.map(t => `
    <button class="analytics-tab px-4 py-2 text-sm font-medium rounded-lg transition-colors
      ${analyticsTab === t.id
        ? 'bg-gray-700 text-white'
        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
      data-tab="${t.id}">${t.label}</button>`
  ).join('')

  let content = ''
  if (analyticsTab === 'year')     content = buildByYear(history)
  else if (analyticsTab === 'round')    content = buildByRound(history)
  else if (analyticsTab === 'position') content = buildByPosition(history, analyticsPos)

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
        <p class="text-sm text-gray-400 mt-0.5">2020–2025 draft classes · Grades based on career production + accolades</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">${legend}</div>
    </div>

    <div class="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-6 w-fit">
      ${tabBar}
    </div>

    ${content}`

  // Tab switcher
  container.querySelectorAll('.analytics-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ analyticsTab: btn.dataset.tab })
    })
  })

  // Position switcher (only present on position tab)
  container.querySelectorAll('.pos-analytics-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ analyticsPos: btn.dataset.pos })
    })
  })
}
