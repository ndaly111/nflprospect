import { formatStat } from '../utils/format.js'

const COLUMNS = {
  QB: [
    { key: 'games', label: 'G' },
    { key: 'completions', label: 'CMP' },
    { key: 'attempts', label: 'ATT' },
    { key: 'passingYards', label: 'YDS' },
    { key: 'passingTDs', label: 'TD' },
    { key: 'interceptions', label: 'INT' },
    { key: 'rushingYards', label: 'RUSH YDS' },
    { key: 'rushingTDs', label: 'RUSH TD' },
  ],
  RB: [
    { key: 'games', label: 'G' },
    { key: 'rushingAttempts', label: 'ATT' },
    { key: 'rushingYards', label: 'YDS' },
    { key: 'rushingTDs', label: 'TD' },
    { key: 'receptions', label: 'REC' },
    { key: 'receivingYards', label: 'REC YDS' },
  ],
  WR: [
    { key: 'games', label: 'G' },
    { key: 'receptions', label: 'REC' },
    { key: 'receivingYards', label: 'YDS' },
    { key: 'receivingTDs', label: 'TD' },
  ],
  TE: [
    { key: 'games', label: 'G' },
    { key: 'receptions', label: 'REC' },
    { key: 'receivingYards', label: 'YDS' },
    { key: 'receivingTDs', label: 'TD' },
  ],
  OL: [
    { key: 'games', label: 'G' },
  ],
  DL: [
    { key: 'games', label: 'G' },
    { key: 'tackles', label: 'TKL' },
    { key: 'sacks', label: 'SACK' },
    { key: 'tfls', label: 'TFL' },
  ],
  EDGE: [
    { key: 'games', label: 'G' },
    { key: 'tackles', label: 'TKL' },
    { key: 'sacks', label: 'SACK' },
    { key: 'tfls', label: 'TFL' },
    { key: 'pbus', label: 'PBU' },
  ],
  LB: [
    { key: 'games', label: 'G' },
    { key: 'tackles', label: 'TKL' },
    { key: 'sacks', label: 'SACK' },
    { key: 'tfls', label: 'TFL' },
    { key: 'interceptions', label: 'INT' },
  ],
  DB: [
    { key: 'games', label: 'G' },
    { key: 'tackles', label: 'TKL' },
    { key: 'sacks', label: 'SACK' },
    { key: 'interceptions', label: 'INT' },
    { key: 'pbus', label: 'PBU' },
  ],
}

export function renderCollegeStats(prospect) {
  const stats = prospect.collegeStats
  if (!stats || Object.keys(stats).length === 0) {
    return '<p class="text-gray-500 text-sm">No college stats available</p>'
  }

  const cols = COLUMNS[prospect.positionGroup] || COLUMNS.DB
  const years = Object.keys(stats).sort()

  const headerCells = ['Year', ...cols.map(c => c.label)].map(l =>
    `<th class="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">${l}</th>`
  ).join('')

  const rows = years.map(year => {
    const s = stats[year]
    const cells = cols.map(c =>
      `<td class="px-3 py-2 text-sm text-gray-200 whitespace-nowrap">${formatStat(s[c.key])}</td>`
    ).join('')
    return `<tr class="border-t border-gray-700 hover:bg-gray-750">
      <td class="px-3 py-2 text-sm font-medium text-blue-400">${year}</td>
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
