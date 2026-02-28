import { getState, setState } from '../state.js'

const DRILLS = [
  { key: 'forty',     label: '40-Yard Dash', unit: 's',  lowerBetter: true,  range: [4.2, 5.3] },
  { key: 'vertical',  label: 'Vertical',     unit: '"',  lowerBetter: false, range: [20, 45] },
  { key: 'broadJump', label: 'Broad Jump',   unit: '"',  lowerBetter: false, range: [100, 145] },
  { key: 'bench',     label: 'Bench Press',  unit: ' reps', lowerBetter: false, range: [10, 40] },
  { key: 'cone',      label: '3-Cone',       unit: 's',  lowerBetter: true,  range: [6.5, 8.0] },
]

export function renderCombineSpotlight() {
  const container = document.getElementById('combine-spotlight')
  if (!container) return

  const { prospects } = getState()
  if (!prospects || prospects.length === 0) return

  // Collect prospects with at least one drill time
  const withDrills = prospects.filter(p => {
    const c = p.combineData || {}
    return DRILLS.some(d => c[d.key] != null)
  })

  if (withDrills.length === 0) {
    container.innerHTML = ''
    return
  }

  const drillCols = DRILLS.map(drill => {
    // Top 5 by this drill
    const ranked = withDrills
      .filter(p => p.combineData?.[drill.key] != null)
      .sort((a, b) => {
        const va = parseFloat(a.combineData[drill.key])
        const vb = parseFloat(b.combineData[drill.key])
        return drill.lowerBetter ? va - vb : vb - va
      })
      .slice(0, 5)

    if (ranked.length === 0) return null

    const rows = ranked.map((p, i) => {
      const val = p.combineData[drill.key]
      const isFirst = i === 0
      return `
        <div class="flex items-center gap-2 py-1.5 border-b border-gray-700/40 last:border-0 cursor-pointer hover:bg-gray-700/20 -mx-3 px-3 rounded transition-colors combine-leader"
             data-id="${p.id}">
          <span class="text-[11px] font-bold ${isFirst ? 'text-yellow-400' : 'text-gray-600'} w-4 flex-shrink-0">${i + 1}</span>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold text-gray-200 truncate">${p.name}</div>
            <div class="text-[10px] text-gray-600 truncate">${p.positionGroup} · ${p.school}</div>
          </div>
          <span class="text-sm font-bold ${isFirst ? 'text-yellow-400' : 'text-gray-300'} flex-shrink-0">${val}${drill.unit}</span>
        </div>`
    }).join('')

    return `
      <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 min-w-0">
        <div class="text-[11px] font-semibold text-blue-400 uppercase tracking-wider mb-2">${drill.label}</div>
        ${rows}
      </div>`
  }).filter(Boolean)

  if (drillCols.length === 0) {
    container.innerHTML = ''
    return
  }

  container.innerHTML = drillCols.join('')

  // Wire click → expand card
  container.querySelectorAll('.combine-leader').forEach(el => {
    el.addEventListener('click', () => {
      setState({ viewMode: 'grid', expandedCardId: el.dataset.id })
      // Scroll to grid
      document.getElementById('prospect-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}
