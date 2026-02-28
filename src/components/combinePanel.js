export function renderCombinePanel(combineData) {
  if (!combineData || !combineData.participated) {
    return '<p class="text-gray-500 text-sm">No combine data available</p>'
  }

  const metrics = [
    { key: 'height', label: 'Height', unit: '' },
    { key: 'weight', label: 'Weight', unit: 'lbs' },
    { key: 'forty', label: '40-Yard Dash', unit: 's' },
    { key: 'bench', label: 'Bench Press', unit: 'reps' },
    { key: 'vertical', label: 'Vertical Jump', unit: '"' },
    { key: 'broadJump', label: 'Broad Jump', unit: '"' },
    { key: 'cone', label: '3-Cone Drill', unit: 's' },
    { key: 'shuttle', label: 'Shuttle', unit: 's' },
  ]

  const items = metrics.map(m => {
    const val = combineData[m.key]
    const display = val !== null && val !== undefined
      ? `${val}${m.unit}`
      : '<span class="text-gray-600">—</span>'
    return `
      <div class="bg-gray-800 rounded-lg p-3">
        <div class="text-xs text-gray-400 mb-1">${m.label}</div>
        <div class="text-base font-semibold text-white">${display}</div>
      </div>`
  }).join('')

  return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${items}</div>`
}
