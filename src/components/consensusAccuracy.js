import { POS_COLORS } from '../utils/tiers.js'

const SOURCE_LABELS = {
  walter_football: 'Walter Football',
  espn:            'ESPN',
  cbs_sports:      'CBS Sports',
  tankathon:       'Tankathon',
}

function pickCell(pickNo) {
  if (pickNo == null) return `<span class="text-red-400 text-xs font-medium">UDFA</span>`
  return `<span class="text-gray-300 text-sm">#${pickNo}</span>`
}

function rankCell(rank) {
  if (rank == null) return `<span class="text-gray-600 text-xs">—</span>`
  return `<span class="text-gray-300 text-sm">#${rank}</span>`
}

function deltaTag(value, kind = 'value') {
  if (value == null) return `<span class="text-gray-600 text-xs">—</span>`
  const v = Math.round(value)
  const suffix = kind === 'value' ? ' pts' : kind === 'rank' ? ' slots' : ''
  if (v === 0)
    return `<span class="px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-gray-400">±0${suffix}</span>`
  if (v > 0)
    return `<span class="px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/50 text-emerald-300">+${v}${suffix}</span>`
  return `<span class="px-2 py-0.5 rounded text-xs font-medium bg-rose-900/50 text-rose-300">${v}${suffix}</span>`
}

function posBadge(pos) {
  const cls = POS_COLORS[pos] || 'text-gray-400 bg-gray-800'
  return `<span class="px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}">${pos || '?'}</span>`
}

function statTile(label, value, sub = '') {
  return `
    <div class="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div class="text-[11px] uppercase tracking-wider text-gray-500 font-medium">${label}</div>
      <div class="mt-1 text-2xl font-bold text-white tabular-nums">${value}</div>
      ${sub ? `<div class="text-xs text-gray-500 mt-0.5">${sub}</div>` : ''}
    </div>`
}

function sourceCard(src, ps, isBest) {
  const label = SOURCE_LABELS[src] || src
  const sample = ps.sample
  const small  = sample > 0 && sample < 50
  const valueErr = ps.meanAbsValueDelta == null ? '—' : Math.round(ps.meanAbsValueDelta)
  const rankErr  = ps.meanAbsRankDelta == null  ? '—' : Math.round(ps.meanAbsRankDelta)
  return `
    <div class="bg-gray-900 border ${isBest ? 'border-emerald-700/60' : 'border-gray-800'} rounded-xl px-4 py-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium text-white">${label}</span>
        ${isBest ? '<span class="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">most accurate</span>' : ''}
      </div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="text-2xl font-bold text-white tabular-nums">${valueErr}</span>
        <span class="text-xs text-gray-500">avg pts off</span>
      </div>
      <div class="mt-1 flex items-center gap-3 text-xs text-gray-500">
        <span>${rankErr} slots</span>
        <span class="${small ? 'text-amber-400' : ''}">n=${sample}${small ? ' · small sample' : ''}</span>
      </div>
    </div>`
}

function rowCells(r, opts = {}) {
  const team   = r.actualTeam || '—'
  const school = r.school || '—'
  const tdRank = rankCell(r.consensusRank)
  const tdPick = pickCell(r.actualPick)
  const tdDelta = deltaTag(r.valueDelta, 'value')
  return `
    <tr class="border-b border-gray-800/60 hover:bg-gray-800/30">
      <td class="px-3 py-2 text-sm text-white whitespace-nowrap">${r.name}</td>
      <td class="px-3 py-2 text-center">${posBadge(r.position)}</td>
      <td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">${school}</td>
      <td class="px-3 py-2 text-center">${tdRank}</td>
      <td class="px-3 py-2 text-center">${tdPick}</td>
      <td class="px-3 py-2 text-center text-xs text-gray-400 whitespace-nowrap">${team}</td>
      <td class="px-3 py-2 text-center">${tdDelta}</td>
    </tr>`
}

function storyTable(title, subtitle, rows) {
  if (!rows || !rows.length) {
    return `
      <div class="rounded-xl border border-gray-800 p-4">
        <h3 class="text-sm font-semibold text-white">${title}</h3>
        <p class="text-xs text-gray-500 mt-1">${subtitle}</p>
        <p class="text-xs text-gray-600 mt-3">No rows.</p>
      </div>`
  }

  return `
    <div class="rounded-xl border border-gray-800 overflow-hidden">
      <div class="px-4 py-3 bg-gray-900 border-b border-gray-800">
        <h3 class="text-sm font-semibold text-white">${title}</h3>
        <p class="text-xs text-gray-500 mt-0.5">${subtitle}</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 bg-gray-900/50">
              <th class="px-3 py-2 text-left text-xs text-gray-500 font-medium">Player</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500 font-medium">Pos</th>
              <th class="px-3 py-2 text-left text-xs text-gray-500 font-medium">School</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500 font-medium">Consensus</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500 font-medium">Actual</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500 font-medium">Team</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500 font-medium">Δ Value</th>
            </tr>
          </thead>
          <tbody>${rows.map(r => rowCells(r)).join('')}</tbody>
        </table>
      </div>
    </div>`
}

export function buildConsensusAccuracy(data) {
  if (!data || !data.stats) {
    return `<div class="rounded-xl border border-gray-800 p-6 text-center">
      <p class="text-gray-400 text-sm">No consensus accuracy data available yet.</p>
      <p class="text-gray-600 text-xs mt-2">Each year's pre-draft consensus is snapshotted automatically on draft day.</p>
    </div>`
  }

  const s = data.stats
  const exactPct = s.matchedPairs ? Math.round(100 * s.exactMatches / s.matchedPairs) : 0
  const w5Pct    = s.matchedPairs ? Math.round(100 * s.within5      / s.matchedPairs) : 0
  const w10Pct   = s.matchedPairs ? Math.round(100 * s.within10     / s.matchedPairs) : 0

  // Find the most accurate source (lowest mean abs value delta) with a meaningful sample (>=50)
  let bestSrc = null
  let bestErr = Infinity
  for (const [src, ps] of Object.entries(s.perSource || {})) {
    if (ps.sample >= 50 && ps.meanAbsValueDelta != null && ps.meanAbsValueDelta < bestErr) {
      bestErr = ps.meanAbsValueDelta
      bestSrc = src
    }
  }
  const sourceCards = Object.entries(s.perSource || {})
    .map(([src, ps]) => sourceCard(src, ps, src === bestSrc))
    .join('')

  return `
    <div class="space-y-6">
      <div>
        <div class="flex items-center justify-between flex-wrap gap-3 mb-2">
          <div>
            <h2 class="text-lg font-bold text-white">Consensus vs Actual — ${data.year} Draft</h2>
            <p class="text-xs text-gray-500 mt-0.5">
              Pre-draft consensus rankings (snapshotted ${data.year} draft eve) compared against where players actually went.
              Δ Value uses the Jimmy Johnson trade chart so top-of-draft moves count more than late-round ones.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${statTile('Pairs analyzed', s.matchedPairs, `${data.matchedPicks}/${data.totalPicks} picks matched`)}
          ${statTile('Within 5 slots', `${w5Pct}%`, `${s.within5} of ${s.matchedPairs}`)}
          ${statTile('Within 10 slots', `${w10Pct}%`, `${s.within10} of ${s.matchedPairs}`)}
          ${statTile('Mean error', `${Math.round(s.meanAbsValueDelta)} pts`, `${Math.round(s.meanAbsRankDelta)} slots avg`)}
        </div>
      </div>

      <div>
        <h3 class="text-sm font-semibold text-white mb-3">Source accuracy</h3>
        <p class="text-xs text-gray-500 mb-3">
          Mean absolute Jimmy-Johnson value error per matched prospect. Lower = closer to where the prospect actually went.
          Sources marked <span class="text-amber-400">small sample</span> only ranked the top of the board.
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${sourceCards}</div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${storyTable(
          'Biggest fallers',
          'Consensus said early, draft said late (or undrafted). Negative Δ pts.',
          data.biggestFalls
        )}
        ${storyTable(
          'Biggest risers',
          'Consensus underrated them. Positive Δ pts.',
          data.biggestRises
        )}
        ${storyTable(
          'Notable undrafted',
          'On consensus boards, never picked.',
          data.topUndrafted
        )}
        ${storyTable(
          'Surprise picks',
          'Drafted with no consensus rank from any source.',
          data.topSurprises
        )}
      </div>
    </div>`
}
