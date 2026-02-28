import { getState } from '../state.js'

// Lower 40 time = better; higher everything else = better
const LOWER_IS_BETTER = new Set(['forty', 'cone', 'shuttle'])

export function renderCombinePanel(combineData, positionGroup) {
  if (!combineData) {
    return '<p class="text-gray-500 text-sm">No combine data available</p>'
  }

  const { historical, historicalYear } = getState()
  const year = historicalYear || 'all'
  const bucket = (historical || {})[year] || (historical || {})['all'] || {}
  const posPercentiles = bucket[positionGroup] || {}

  const metrics = [
    { key: 'height', label: 'Height', unit: '', historical: false },
    { key: 'weight', label: 'Weight', unit: 'lbs', historical: 'weight' },
    { key: 'forty', label: '40-Yard Dash', unit: 's', historical: 'forty' },
    { key: 'bench', label: 'Bench Press', unit: 'reps', historical: 'bench' },
    { key: 'vertical', label: 'Vertical Jump', unit: '"', historical: 'vertical' },
    { key: 'broadJump', label: 'Broad Jump', unit: '"', historical: 'broadJump' },
    { key: 'cone', label: '3-Cone Drill', unit: 's', historical: 'cone' },
    { key: 'shuttle', label: 'Shuttle', unit: 's', historical: 'shuttle' },
  ]

  // Build importance lookup from state
  const importance = (getState().historical || {}).importance || {}
  const importanceData = {}
  const impPos = importance[positionGroup] || {}
  for (const [key, data] of Object.entries(impPos)) {
    importanceData[key] = data.importance  // 'high', 'medium', 'low'
  }

  const items = metrics.map(m => {
    const val = combineData[m.key]
    const hasVal = val !== null && val !== undefined

    let pct = null
    if (hasVal && m.historical && posPercentiles[m.historical]?.length > 1) {
      pct = computePercentile(val, posPercentiles[m.historical], LOWER_IS_BETTER.has(m.key))
    }

    const valColor = pct !== null
      ? (pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-green-300/70' : pct >= 40 ? 'text-gray-200' : pct >= 20 ? 'text-amber-400/70' : 'text-red-400')
      : 'text-gray-200'

    const barColor = pct !== null
      ? (pct >= 80 ? '#22c55e' : pct >= 50 ? '#3b82f6' : pct >= 25 ? '#f59e0b' : '#6b7280')
      : null

    const pctDisplay = pct !== null ? `
      <div class="mt-1.5">
        <div class="text-[10px] text-gray-500 mb-0.5">${pct}th percentile</div>
        <div class="h-1 bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full rounded-full" style="width:${pct}%;background:${barColor}"></div>
        </div>
      </div>` : ''

    const display = hasVal
      ? `<span class="text-lg font-bold ${valColor}">${val}${m.unit}</span>`
      : `<span class="text-gray-600 text-lg">—</span>`

    // importance indicator
    const imp = importanceData[m.key]
    const impDot = imp === 'high' ? '<span class="ml-1 text-[9px] font-semibold text-blue-400 uppercase tracking-wide">KEY</span>'
      : imp === 'medium' ? '<span class="ml-1 text-[9px] text-gray-500 uppercase tracking-wide">MOD</span>'
      : ''

    return `
      <div class="bg-gray-700/50 rounded-lg p-3">
        <div class="text-xs text-gray-400 mb-1 flex items-center">${m.label}${impDot}</div>
        ${display}
        ${pctDisplay}
      </div>`
  }).join('')

  const participated = combineData.participated
  const note = !participated
    ? '<p class="text-xs text-gray-600 mt-2">Height/weight from ESPN. Combine drills from Tankathon. Full official results pending.</p>'
    : ''

  const yearLabel = year === 'all' ? "All Draft Classes ('20–'24)" : `${year} Draft Class`
  const hasPercentiles = Object.keys(posPercentiles).some(k => posPercentiles[k]?.length > 0)

  return `
    ${hasPercentiles ? `
    <div class="flex items-center gap-2 mb-3 px-1">
      <span class="text-[11px] text-gray-500 uppercase tracking-wide">Comparing vs</span>
      <span class="text-[11px] font-semibold text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">${yearLabel}</span>
    </div>` : ''}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${items}</div>
    ${note}`
}

function computePercentile(val, sorted, lowerIsBetter) {
  if (!sorted || sorted.length === 0) return 50
  const numVal = parseFloat(val)
  if (isNaN(numVal)) return 50

  let below = 0
  for (const v of sorted) {
    if (lowerIsBetter ? v > numVal : v < numVal) below++
  }
  return Math.round((below / sorted.length) * 100)
}
