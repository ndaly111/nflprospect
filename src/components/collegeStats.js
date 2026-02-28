import { formatStat } from '../utils/format.js'

// CFBD-sourced stats by year
const CFBD_COLUMNS = {
  QB: ['games','completions','attempts','passingYards','passingTDs','interceptions','rushingYards','rushingTDs'],
  RB: ['games','rushingAttempts','rushingYards','rushingTDs','receptions','receivingYards'],
  WR: ['games','receptions','receivingYards','receivingTDs'],
  TE: ['games','receptions','receivingYards','receivingTDs'],
  OL: ['games'],
  DL: ['games','tackles','sacks','tfls','interceptions'],
  EDGE: ['games','tackles','sacks','tfls','pbus'],
  LB: ['games','tackles','sacks','tfls','interceptions'],
  DB: ['games','tackles','sacks','interceptions','pbus'],
}

const CFBD_LABELS = {
  games:'G', completions:'CMP', attempts:'ATT', passingYards:'PASS YDS', passingTDs:'TD',
  interceptions:'INT', rushingYards:'RUSH YDS', rushingTDs:'RUSH TD',
  rushingAttempts:'ATT', receptions:'REC', receivingYards:'REC YDS', receivingTDs:'TD',
  tackles:'TKL', sacks:'SACK', tfls:'TFL', pbus:'PBU',
}

// Tankathon stat label → display label
const TANK_LABELS = {
  'TACKLES': 'TKL', 'SACKS': 'SACK', 'PASS DEF': 'PBU', 'INT': 'INT', 'FF': 'FF',
  'Pass Yds': 'PASS YDS', 'TD': 'TD', 'Pct': 'COMP%', 'Rating': 'QBR',
  'Rush Yds': 'RUSH YDS', 'AVG': 'YPC',
  'REC': 'REC', 'REC Yds': 'REC YDS', 'REC TD': 'REC TD',
  'RUSH YDS': 'RUSH YDS', 'RUSH TD': 'RUSH TD',
}

export function renderCollegeStats(prospect, classPct = {}) {
  const hasCFBD = prospect.collegeStats && Object.keys(prospect.collegeStats).length > 0
  const hasTankStats = prospect.tankStats && Object.keys(prospect.tankStats).length > 0

  if (!hasCFBD && !hasTankStats) {
    return '<p class="text-gray-500 text-sm">No college stats available yet</p>'
  }

  let html = ''

  // CFBD year-by-year table (if available)
  if (hasCFBD) {
    const cols = CFBD_COLUMNS[prospect.positionGroup] || CFBD_COLUMNS.DB
    const years = Object.keys(prospect.collegeStats).sort()
    const headerCells = ['Year', ...cols.map(c => CFBD_LABELS[c] || c)]
      .map(l => `<th class="text-left px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">${l}</th>`)
      .join('')
    const rows = years.map(year => {
      const s = prospect.collegeStats[year]
      const cells = cols.map(c => {
        const val = s[c]
        const sorted = classPct[c]
        let colorClass = 'text-gray-200'
        if (c !== 'games' && typeof val === 'number' && !isNaN(val) && sorted?.length > 1) {
          let below = 0
          for (const v of sorted) { if (v < val) below++ }
          const pct = Math.round((below / sorted.length) * 100)
          colorClass = pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-green-300/70' : pct >= 40 ? 'text-gray-200' : pct >= 20 ? 'text-amber-400/70' : 'text-red-400'
        }
        return `<td class="px-2 py-1.5 text-sm ${colorClass} whitespace-nowrap">${formatStat(val)}</td>`
      }).join('')
      return `<tr class="border-t border-gray-700/50 hover:bg-gray-700/30">
        <td class="px-2 py-1.5 text-sm font-semibold text-blue-400">${year}</td>${cells}</tr>`
    }).join('')

    html += `
      <div class="overflow-x-auto mb-4">
        <table class="w-full text-sm">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }

  // Tankathon recent-season stats summary
  if (hasTankStats && !hasCFBD) {
    const items = Object.entries(prospect.tankStats).map(([lbl, val]) => {
      const displayLbl = TANK_LABELS[lbl] || lbl
      return `<div class="bg-gray-700/50 rounded-lg p-3 text-center">
        <div class="text-xs text-gray-400 mb-1">${displayLbl}</div>
        <div class="text-base font-bold text-white">${val}</div>
      </div>`
    }).join('')

    html += `
      <div class="mb-2">
        <p class="text-xs text-gray-500 mb-2">2024 Season Totals</p>
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">${items}</div>
      </div>`
  } else if (hasTankStats && hasCFBD) {
    // Show tankStats as a compact row under CFBD
    const items = Object.entries(prospect.tankStats).map(([lbl, val]) => {
      const displayLbl = TANK_LABELS[lbl] || lbl
      return `<span class="text-xs text-gray-400">${displayLbl}: <span class="text-gray-200">${val}</span></span>`
    }).join('<span class="text-gray-700 mx-1">·</span>')
    html += `<div class="text-xs mt-1 flex flex-wrap gap-1">${items}</div>`
  }

  return html
}
