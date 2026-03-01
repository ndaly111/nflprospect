import { formatStat } from '../utils/format.js'

const NFL_COLUMNS = {
  QB:   ['games', 'completions', 'attempts', 'passing_yards', 'passing_tds', 'interceptions', 'carries', 'rushing_yards', 'rushing_tds', 'sacks'],
  RB:   ['games', 'carries', 'rushing_yards', 'rushing_tds', 'receptions', 'targets', 'receiving_yards', 'receiving_tds'],
  WR:   ['games', 'receptions', 'targets', 'receiving_yards', 'receiving_tds', 'carries', 'rushing_yards'],
  TE:   ['games', 'receptions', 'targets', 'receiving_yards', 'receiving_tds'],
  DL:   ['games', 'tackles_combined', 'sacks', 'tackles_for_loss', 'qb_hits'],
  EDGE: ['games', 'tackles_combined', 'sacks', 'tackles_for_loss', 'qb_hits'],
  LB:   ['games', 'tackles_combined', 'sacks', 'tackles_for_loss', 'interceptions', 'pass_defended'],
  DB:   ['games', 'tackles_combined', 'interceptions', 'pass_defended'],
  OL:   ['games'],
}

const NFL_LABELS = {
  games: 'G',
  completions: 'CMP', attempts: 'ATT', passing_yards: 'PASS YDS', passing_tds: 'TD',
  interceptions: 'INT', carries: 'CAR', rushing_yards: 'RUSH YDS', rushing_tds: 'RUSH TD',
  sacks: 'SACK', receptions: 'REC', targets: 'TGT', receiving_yards: 'REC YDS',
  receiving_tds: 'REC TD', tackles_combined: 'TKL', tackles_for_loss: 'TFL',
  qb_hits: 'QB HIT', pass_defended: 'PD',
}

// Sacks and TFL can be fractional (half-sacks etc.)
const DECIMAL_COLS = new Set(['sacks', 'tackles_for_loss', 'tackles_combined'])

export function renderNflCareerStats(prospect) {
  const { nflStats } = prospect
  if (!nflStats || Object.keys(nflStats).length === 0) {
    return '<p class="text-gray-500 text-sm">No NFL career stats available yet.</p>'
  }

  const cols = NFL_COLUMNS[prospect.positionGroup] || NFL_COLUMNS.DB
  // Newest season first
  const years = Object.keys(nflStats).sort((a, b) => b - a)

  const headerCells = ['Year', 'Team', ...cols.map(c => NFL_LABELS[c] || c)]
    .map(l => `<th class="text-left px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">${l}</th>`)
    .join('')

  const rows = years.map(year => {
    const s = nflStats[year]
    const team = s.team || '—'
    const cells = cols.map(c => {
      const val = s[c]
      return `<td class="px-2 py-1.5 text-sm text-gray-200 whitespace-nowrap">${formatStat(val, DECIMAL_COLS.has(c) ? 1 : 0)}</td>`
    }).join('')
    return `<tr class="border-t border-gray-700/50 hover:bg-gray-700/30">
      <td class="px-2 py-1.5 text-sm font-semibold text-blue-400">${year}</td>
      <td class="px-2 py-1.5 text-sm font-semibold text-amber-400">${team}</td>
      ${cells}
    </tr>`
  }).join('')

  return `
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}
