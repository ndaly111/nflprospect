import { formatStat } from '../utils/format.js'

// CFBD-sourced stats by year (also handles CBS Sports fallback keys)
const CFBD_COLUMNS = {
  QB: ['games','completions','attempts','passingYards','completionPct','passingTDs','interceptions','rushingYards','rushingTDs'],
  RB: ['games','rushingAttempts','rushingYards','avgRush','rushingTDs','receptions','receivingYards'],
  WR: ['games','receptions','receivingYards','avgRec','receivingTDs','recPerGame'],
  TE: ['games','receptions','receivingYards','avgRec','receivingTDs','recPerGame'],
  OL: ['games'],
  DL: ['games','tackles','sacks','tfls','interceptions'],
  EDGE: ['games','tackles','sacks','tfls','pbus'],
  LB: ['games','tackles','sacks','tfls','interceptions'],
  DB: ['games','tackles','sacks','interceptions','pbus'],
}

const CFBD_LABELS = {
  games:'G', completions:'CMP', attempts:'ATT', passingYards:'PASS YDS', passingTDs:'TD',
  completionPct:'COMP%', interceptions:'INT', rushingYards:'RUSH YDS', rushingTDs:'RUSH TD',
  rushingAttempts:'ATT', avgRush:'YPC', receptions:'REC', receivingYards:'REC YDS',
  avgRec:'YPR', receivingTDs:'TD', recPerGame:'REC/G',
  tackles:'TKL', sacks:'SACK', tfls:'TFL', pbus:'PBU',
}

// Columns that need 1 decimal place
const DECIMAL_COLS = new Set(['completionPct', 'avgRush', 'avgRec', 'recPerGame'])

// Tankathon stat label → display label
const TANK_LABELS = {
  'TACKLES': 'TKL', 'SACKS': 'SACK', 'PASS DEF': 'PBU', 'INT': 'INT', 'FF': 'FF',
  'Pass Yds': 'PASS YDS', 'TD': 'TD', 'Pct': 'COMP%', 'Rating': 'QBR',
  'Rush Yds': 'RUSH YDS', 'AVG': 'YPC',
  'REC': 'REC', 'REC Yds': 'REC YDS', 'REC TD': 'REC TD',
  'RUSH YDS': 'RUSH YDS', 'RUSH TD': 'RUSH TD',
}

/**
 * Compute percentile of val within a sorted array.
 * Returns 0-100 integer.
 */
function computePercentile(val, sorted) {
  if (!sorted || sorted.length < 2 || typeof val !== 'number' || isNaN(val)) return null
  let below = 0
  for (const v of sorted) { if (v < val) below++ }
  return Math.round((below / sorted.length) * 100)
}

function percentileColor(pct) {
  if (pct >= 80) return 'text-green-400'
  if (pct >= 60) return 'text-green-300/70'
  if (pct >= 40) return 'text-gray-200'
  if (pct >= 20) return 'text-amber-400/70'
  return 'text-red-400'
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function renderCollegeStats(prospect, classPct = {}, wrTargetHistory = null) {
  const hasCFBD = prospect.collegeStats && Object.keys(prospect.collegeStats).length > 0
  const hasTankStats = prospect.tankStats && Object.keys(prospect.tankStats).length > 0

  if (!hasCFBD && !hasTankStats) {
    if (prospect.positionGroup === 'OL') {
      return `
        <div class="text-center py-4 text-gray-500">
          <p class="text-sm font-medium mb-1">Individual stats not tracked for OL</p>
          <p class="text-xs text-gray-600">Evaluation based on film, combine measurements, and physical traits. Check the Combine tab for measurables.</p>
        </div>`
    }
    return '<p class="text-gray-500 text-sm">No college stats available yet</p>'
  }

  // Get the historical percentile distribution for TGT/G
  const tgtPercentiles = wrTargetHistory?.percentiles || null
  const isWrTe = prospect.positionGroup === 'WR' || prospect.positionGroup === 'TE'

  let html = ''

  // CFBD year-by-year table (if available)
  if (hasCFBD) {
    const cols = CFBD_COLUMNS[prospect.positionGroup] || CFBD_COLUMNS.DB
    const years = Object.keys(prospect.collegeStats).sort()
    const thClass = 'text-left px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap'
    const headerCells = [
      `<th class="${thClass}">Year</th>`,
      ...cols.map(c => {
        const label = CFBD_LABELS[c] || c
        const extra = (c === 'recPerGame' && isWrTe) ? ' title="Receptions per game vs first-round WRs (2013-2025)"' : ''
        return `<th class="${thClass}"${extra}>${label}</th>`
      })
    ].join('')

    const rows = years.map(year => {
      const raw = prospect.collegeStats[year]
      // Compute derived stats for display when not directly available
      const s = { ...raw }
      if (!s.completionPct && s.completions && s.attempts) {
        s.completionPct = (s.completions / s.attempts) * 100
      }
      if (!s.avgRush && s.rushingYards && s.rushingAttempts) {
        s.avgRush = s.rushingYards / s.rushingAttempts
      }
      if (!s.avgRec && s.receivingYards && s.receptions) {
        s.avgRec = s.receivingYards / s.receptions
      }
      if (!s.recPerGame && s.receptions && s.games) {
        s.recPerGame = s.receptions / s.games
      }
      const cells = cols.map(c => {
        const val = s[c]

        // Special handling for TGT/G column: show percentile badge vs Rd1 WRs
        if (c === 'recPerGame' && isWrTe) {
          if (typeof val !== 'number' || isNaN(val)) {
            return `<td class="px-2 py-1.5 text-sm text-gray-200 whitespace-nowrap">${formatStat(val, 1)}</td>`
          }
          const pct = computePercentile(val, tgtPercentiles)
          const valStr = val.toFixed(1)
          if (pct !== null) {
            const color = percentileColor(pct)
            const badge = `<span class="ml-1 text-[10px] font-semibold ${color} bg-gray-700/60 px-1 py-0.5 rounded" title="${ordinalSuffix(pct)} percentile vs first-round WRs (2013-2025)">${ordinalSuffix(pct)}</span>`
            return `<td class="px-2 py-1.5 text-sm ${color} whitespace-nowrap">${valStr}${badge}</td>`
          }
          return `<td class="px-2 py-1.5 text-sm text-gray-200 whitespace-nowrap">${valStr}</td>`
        }

        // Standard stat coloring (in-class percentile)
        const sorted = classPct[c]
        let colorClass = 'text-gray-200'
        if (c !== 'games' && typeof val === 'number' && !isNaN(val) && sorted?.length > 1) {
          const pct = computePercentile(val, sorted)
          if (pct !== null) colorClass = percentileColor(pct)
        }
        return `<td class="px-2 py-1.5 text-sm ${colorClass} whitespace-nowrap">${formatStat(val, DECIMAL_COLS.has(c) ? 1 : 0)}</td>`
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
    // Show tankStats as a labeled supplemental row
    const items = Object.entries(prospect.tankStats).map(([lbl, val]) => {
      const displayLbl = TANK_LABELS[lbl] || lbl
      return `<div class="bg-gray-700/50 rounded-lg p-2.5 text-center">
        <div class="text-[10px] text-gray-400 mb-0.5">${displayLbl}</div>
        <div class="text-sm font-bold text-gray-200">${val}</div>
      </div>`
    }).join('')
    html += `
      <div class="mt-2 pt-2 border-t border-gray-700/40">
        <p class="text-[11px] text-gray-500 mb-2">2024 Season (Tankathon)</p>
        <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5">${items}</div>
      </div>`
  }

  return html
}
