import { getState, setState } from '../state.js'
import { TIERS, TIER_ORDER, TIER_COLORS, POSITIONS, POS_COLORS } from '../utils/tiers.js'

const ROUNDS = [1, 2, 3, 4, 5, 6, 7]

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

// ── Cross-Draft Comparison ──────────────────────────────────────────

const COMPARE_VIEWS = [
  { id: 'grade',      label: 'ESPN Grade' },
  { id: 'combine',    label: 'Combine' },
  { id: 'production', label: 'Production' },
]

function getBestSeason(collegeStats, pos) {
  if (!collegeStats) return {}
  const seasons = Object.values(collegeStats)
  if (!seasons.length) return {}
  if (['QB'].includes(pos)) {
    return seasons.reduce((best, s) => (s.passingYards || 0) > (best.passingYards || 0) ? s : best, {})
  }
  if (['RB'].includes(pos)) {
    return seasons.reduce((best, s) => (s.rushingYards || 0) > (best.rushingYards || 0) ? s : best, {})
  }
  if (['WR', 'TE'].includes(pos)) {
    return seasons.reduce((best, s) => (s.receivingYards || 0) > (best.receivingYards || 0) ? s : best, {})
  }
  if (['EDGE', 'DL', 'LB'].includes(pos)) {
    return seasons.reduce((best, s) => (s.sacks || 0) > (best.sacks || 0) ? s : best, {})
  }
  if (['DB'].includes(pos)) {
    return seasons.reduce((best, s) => (s.interceptions || 0) + (s.passesDefended || 0) > (best.interceptions || 0) + (best.passesDefended || 0) ? s : best, {})
  }
  return seasons[0] || {}
}

function fmtStat(v, decimals = 0) {
  if (v == null || v === '') return '—'
  return decimals ? Number(v).toFixed(decimals) : Math.round(Number(v)).toLocaleString()
}

function getCompareColumns(view, pos) {
  if (view === 'grade') {
    return [
      { key: 'espnGrade', label: 'ESPN Grade', fmt: v => fmtStat(v, 1) },
      { key: '_pick',     label: 'Pick',       fmt: v => v ? `#${v}` : '—' },
      { key: '_round',    label: 'Rd',         fmt: v => v || '—' },
      { key: '_team',     label: 'Team',       fmt: v => v || '—' },
      { key: '_tier',     label: 'Tier',       fmt: (v, p) => {
        const tc = TIER_COLORS[v]
        return tc ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${tc.badge}">${v}</span>` : '<span class="text-gray-600 text-xs">—</span>'
      }},
    ]
  }
  if (view === 'combine') {
    return [
      { key: '_forty',     label: '40 Yd',     fmt: v => fmtStat(v, 2) },
      { key: '_weight',    label: 'Weight',     fmt: v => fmtStat(v) },
      { key: '_height',    label: 'Height',     fmt: v => v || '—' },
      { key: '_vertical',  label: 'Vert',       fmt: v => fmtStat(v, 1) },
      { key: '_broadJump', label: 'Broad',      fmt: v => fmtStat(v) },
      { key: '_bench',     label: 'Bench',      fmt: v => fmtStat(v) },
      { key: '_cone',      label: '3-Cone',     fmt: v => fmtStat(v, 2) },
      { key: '_shuttle',   label: 'Shuttle',    fmt: v => fmtStat(v, 2) },
      { key: '_tier',      label: 'Tier',       fmt: (v, p) => {
        const tc = TIER_COLORS[v]
        return tc ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${tc.badge}">${v}</span>` : '<span class="text-gray-600 text-xs">—</span>'
      }},
    ]
  }
  // production
  const tierCol = { key: '_tier', label: 'Tier', fmt: (v, p) => {
    const tc = TIER_COLORS[v]
    return tc ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${tc.badge}">${v}</span>` : '<span class="text-gray-600 text-xs">—</span>'
  }}
  if (pos === 'QB') {
    return [
      { key: '_passYds',  label: 'Pass Yds',  fmt: v => fmtStat(v) },
      { key: '_passTDs',  label: 'Pass TD',   fmt: v => fmtStat(v) },
      { key: '_ints',     label: 'INT',        fmt: v => fmtStat(v) },
      { key: '_rushYds',  label: 'Rush Yds',  fmt: v => fmtStat(v) },
      { key: '_rushTDs',  label: 'Rush TD',   fmt: v => fmtStat(v) },
      tierCol,
    ]
  }
  if (pos === 'RB') {
    return [
      { key: '_rushYds',  label: 'Rush Yds',  fmt: v => fmtStat(v) },
      { key: '_rushTDs',  label: 'Rush TD',   fmt: v => fmtStat(v) },
      { key: '_rushAtt',  label: 'Carries',   fmt: v => fmtStat(v) },
      { key: '_recYds',   label: 'Rec Yds',   fmt: v => fmtStat(v) },
      { key: '_recs',     label: 'Rec',        fmt: v => fmtStat(v) },
      tierCol,
    ]
  }
  if (pos === 'WR' || pos === 'TE') {
    return [
      { key: '_recYds',   label: 'Rec Yds',   fmt: v => fmtStat(v) },
      { key: '_recTDs',   label: 'Rec TD',    fmt: v => fmtStat(v) },
      { key: '_recs',     label: 'Rec',        fmt: v => fmtStat(v) },
      tierCol,
    ]
  }
  if (['EDGE', 'DL', 'LB'].includes(pos)) {
    return [
      { key: '_sacks',    label: 'Sacks',     fmt: v => fmtStat(v, 1) },
      { key: '_tfl',      label: 'TFL',       fmt: v => fmtStat(v, 1) },
      { key: '_tackles',  label: 'Tackles',   fmt: v => fmtStat(v) },
      tierCol,
    ]
  }
  if (pos === 'DB') {
    return [
      { key: '_dbInts',   label: 'INT',        fmt: v => fmtStat(v) },
      { key: '_pd',       label: 'PD',         fmt: v => fmtStat(v) },
      { key: '_tackles',  label: 'Tackles',   fmt: v => fmtStat(v) },
      tierCol,
    ]
  }
  return [
    { key: 'espnGrade', label: 'ESPN Grade', fmt: v => fmtStat(v, 1) },
    tierCol,
  ]
}

function flattenPlayer(p, year, isCurrent) {
  const cd = p.combineData || {}
  const best = getBestSeason(p.collegeStats, p.positionGroup)
  return {
    name: p.name,
    school: p.school,
    positionGroup: p.positionGroup,
    espnGrade: p.espnGrade,
    _year: year,
    _isCurrent: isCurrent,
    _pick: isCurrent ? p.projectedPick : p.actualPick,
    _round: isCurrent ? p.projectedRound : p.actualRound,
    _team: isCurrent ? p.projectedTeam : p.actualTeam,
    _tier: p.draftGrade?.tier || null,
    _tierScore: p.draftGrade?.score,
    // combine
    _forty: cd.forty, _weight: cd.weight, _height: cd.height,
    _vertical: cd.vertical, _broadJump: cd.broadJump,
    _bench: cd.bench, _cone: cd.cone, _shuttle: cd.shuttle,
    // production (best college season)
    _passYds: best.passingYards, _passTDs: best.passingTDs, _ints: best.interceptions,
    _rushYds: best.rushingYards, _rushTDs: best.rushingTDs, _rushAtt: best.rushingAttempts,
    _recYds: best.receivingYards, _recTDs: best.receivingTDs, _recs: best.receptions,
    _sacks: best.sacks, _tfl: best.tacklesForLoss, _tackles: best.tackles,
    _dbInts: best.interceptions, _pd: best.passesDefended,
  }
}

function buildCrossDraftComparison(history, prospects, pos, view, sortKey, sortDir, filterRound) {
  const years = Object.keys(history).sort()

  // Merge historical + current 2026 prospects
  let players = []
  for (const [year, list] of Object.entries(history)) {
    for (const p of list) {
      if (p.positionGroup !== pos) continue
      players.push(flattenPlayer(p, year, false))
    }
  }
  for (const p of prospects) {
    if (p.positionGroup !== pos) continue
    players.push(flattenPlayer(p, '2026', true))
  }

  // Filter by round
  if (filterRound !== 'ALL') {
    players = players.filter(p => String(p._round) === filterRound)
  }

  // Sort
  const columns = getCompareColumns(view, pos)
  const validSortKeys = ['espnGrade', '_year', ...columns.map(c => c.key)]
  const actualSortKey = validSortKeys.includes(sortKey) ? sortKey : columns[0]?.key || 'espnGrade'
  const dir = sortDir === 'asc' ? 1 : -1
  players.sort((a, b) => {
    const va = a[actualSortKey], vb = b[actualSortKey]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'string') return dir * va.localeCompare(vb)
    return dir * (va - vb)
  })

  // Position tabs
  const posTabs = POSITIONS.map(p => `
    <button class="compare-pos-tab px-3 py-1.5 rounded-full text-sm font-medium transition-colors
      ${p === pos ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}"
      data-pos="${p}">${p}</button>`
  ).join('')

  // View tabs
  const viewTabs = COMPARE_VIEWS.map(v => `
    <button class="compare-view-tab px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
      ${v.id === view ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      data-view="${v.id}">${v.label}</button>`
  ).join('')

  // Round filter
  const roundOpts = ['ALL', ...ROUNDS.map(String)].map(r =>
    `<option value="${r}" ${filterRound === r ? 'selected' : ''}>${r === 'ALL' ? 'All Rounds' : 'Round ' + r}</option>`
  ).join('')

  // Sort icon helper
  const sortIcon = (key) => {
    if (actualSortKey !== key) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  // Table headers
  const thCols = columns.map(c =>
    `<th class="px-3 py-2 text-center text-xs text-gray-400 font-medium cursor-pointer hover:text-white select-none compare-sort-th" data-sort="${c.key}">${c.label}${sortIcon(c.key)}</th>`
  ).join('')

  // Tier row tint styles (subtle left border + background)
  const TIER_ROW = {
    Elite:   'border-l-2 border-l-yellow-400/60 bg-yellow-500/[0.04]',
    Starter: 'border-l-2 border-l-green-400/60 bg-green-500/[0.04]',
    Backup:  'border-l-2 border-l-blue-400/40 bg-blue-500/[0.03]',
    Bust:    'border-l-2 border-l-red-400/40 bg-red-500/[0.03]',
  }

  // Table rows
  const rows = players.map(p => {
    const tierTint = (!p._isCurrent && p._tier) ? TIER_ROW[p._tier] || '' : ''
    const rowClass = p._isCurrent
      ? 'border-b border-blue-800/40 bg-blue-950/30 hover:bg-blue-900/30 border-l-2 border-l-blue-400'
      : `border-b border-gray-800/60 hover:bg-gray-800/30 ${tierTint}`
    const yearBadge = p._isCurrent
      ? `<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-600 text-white">2026</span>`
      : `<span class="text-xs text-gray-400">${p._year}</span>`
    const pc = POS_COLORS[p.positionGroup] || 'text-gray-400 bg-gray-800'

    const dataCols = columns.map(c => {
      const val = p[c.key]
      const rendered = c.fmt(val, p)
      return `<td class="px-3 py-2 text-center text-sm text-gray-300 whitespace-nowrap">${rendered}</td>`
    }).join('')

    return `
      <tr class="${rowClass}">
        <td class="px-3 py-2 text-sm font-medium text-white whitespace-nowrap sticky left-0 ${p._isCurrent ? 'bg-blue-950/80' : 'bg-gray-900/95'}">${p.name}</td>
        <td class="px-3 py-2 text-center">${yearBadge}</td>
        <td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">${p.school || '—'}</td>
        ${dataCols}
      </tr>`
  }).join('')

  return `
    <div>
      <div class="flex flex-wrap gap-2 mb-4">${posTabs}</div>
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="flex gap-1">${viewTabs}</div>
        <select id="compare-round-filter" class="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
          ${roundOpts}
        </select>
        <span class="text-xs text-gray-500">${players.length} player${players.length !== 1 ? 's' : ''}</span>
        <span class="ml-auto flex items-center gap-3 text-xs">
          <span class="flex items-center gap-1.5 text-blue-400"><span class="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>2026</span>
          <span class="flex items-center gap-1.5 text-yellow-400"><span class="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span>Elite</span>
          <span class="flex items-center gap-1.5 text-green-400"><span class="w-2 h-2 rounded-full bg-green-400 inline-block"></span>Starter</span>
          <span class="flex items-center gap-1.5 text-blue-300"><span class="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>Backup</span>
          <span class="flex items-center gap-1.5 text-red-400"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>Bust</span>
        </span>
      </div>
      <p class="text-xs text-gray-500 mb-3">
        ${view === 'grade' ? 'Pre-draft ESPN grades across all draft classes. 2026 shows projected pick/round/team.' :
          view === 'combine' ? 'NFL Combine measurements across draft classes. Click column headers to sort.' :
          'Best college season stats. Click column headers to sort.'}
      </p>
      <div class="overflow-x-auto rounded-xl border border-gray-700">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-700">
              <th class="px-3 py-2 text-left text-xs text-gray-400 font-medium sticky left-0 bg-gray-900 cursor-pointer hover:text-white select-none compare-sort-th" data-sort="_year">Player</th>
              <th class="px-3 py-2 text-center text-xs text-gray-400 font-medium cursor-pointer hover:text-white select-none compare-sort-th" data-sort="_year">Year${sortIcon('_year')}</th>
              <th class="px-3 py-2 text-center text-xs text-gray-400 font-medium">School</th>
              ${thCols}
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="20" class="px-3 py-6 text-center text-gray-600">No players match these filters.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`
}

export function renderDraftAnalytics() {
  const container = document.getElementById('analytics-page')
  if (!container) return

  const {
    draftHistory,
    prospects,
    analyticsTab      = 'year',
    analyticsPos      = 'QB',
    analyticsPlayerPos   = 'ALL',
    analyticsPlayerYear  = 'ALL',
    analyticsPlayerRound = 'ALL',
    comparePos    = 'RB',
    compareView   = 'grade',
    compareSort   = 'espnGrade',
    compareSortDir = 'desc',
    compareRound  = 'ALL',
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
    { id: 'compare',  label: 'Compare Across Drafts' },
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
  else if (analyticsTab === 'compare') content = buildCrossDraftComparison(history, prospects || [], comparePos, compareView, compareSort, compareSortDir, compareRound)

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

  // Compare tab: position tabs
  container.querySelectorAll('.compare-pos-tab').forEach(btn => {
    btn.addEventListener('click', () => setState({ comparePos: btn.dataset.pos }))
  })
  // Compare tab: view tabs (grade/combine/production)
  container.querySelectorAll('.compare-view-tab').forEach(btn => {
    btn.addEventListener('click', () => setState({ compareView: btn.dataset.view }))
  })
  // Compare tab: round filter
  container.querySelector('#compare-round-filter')?.addEventListener('change', e => {
    setState({ compareRound: e.target.value })
  })
  // Compare tab: sortable column headers
  container.querySelectorAll('.compare-sort-th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort
      if (!key) return
      const { compareSort: curKey, compareSortDir: curDir } = getState()
      if (curKey === key) {
        setState({ compareSortDir: curDir === 'desc' ? 'asc' : 'desc' })
      } else {
        setState({ compareSort: key, compareSortDir: 'desc' })
      }
    })
  })
}
