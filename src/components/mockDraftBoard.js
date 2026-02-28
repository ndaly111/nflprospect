import { getState, setState } from '../state.js'

const ROUND_SIZES = [32, 32, 32, 9]  // approximate sizes for R1-R4

export function renderMockDraftBoard() {
  const container = document.getElementById('mock-draft-board')
  if (!container) return

  const { prospects } = getState()
  if (!prospects || prospects.length === 0) return

  // Build pick list from prospects with projectedPick
  const picks = prospects
    .filter(p => p.projectedPick)
    .sort((a, b) => a.projectedPick - b.projectedPick)

  if (picks.length === 0) {
    container.innerHTML = ''
    return
  }

  // Group by round
  const byRound = {}
  for (const p of picks) {
    const rnd = p.projectedRound || 1
    if (!byRound[rnd]) byRound[rnd] = []
    byRound[rnd].push(p)
  }

  const rounds = Object.keys(byRound).sort((a, b) => Number(a) - Number(b))

  // Show only Round 1 by default, with expand button for later rounds
  const r1Picks = byRound[1] || []

  const pickCards = r1Picks.map(p => {
    const posColors = {
      QB: 'text-red-400 bg-red-900/30', RB: 'text-green-400 bg-green-900/30',
      WR: 'text-blue-400 bg-blue-900/30', TE: 'text-purple-400 bg-purple-900/30',
      OL: 'text-yellow-400 bg-yellow-900/30', DL: 'text-orange-400 bg-orange-900/30',
      EDGE: 'text-orange-400 bg-orange-900/30', LB: 'text-teal-400 bg-teal-900/30',
      DB: 'text-indigo-400 bg-indigo-900/30',
    }
    const posColor = posColors[p.positionGroup] || 'text-gray-400 bg-gray-700/30'

    return `
      <div class="mock-pick flex items-center gap-2 py-2 border-b border-gray-700/40 last:border-0 hover:bg-gray-700/20 -mx-3 px-3 cursor-pointer transition-colors rounded"
           data-id="${p.id}">
        <div class="flex-shrink-0 w-7 text-right">
          <span class="text-[11px] font-bold text-gray-500">#${p.projectedPick}</span>
        </div>
        <div class="flex-shrink-0 w-16 text-[10px] text-gray-500 truncate">${p.projectedTeam ? p.projectedTeam.replace(/^(The |Los Angeles|New York|San Francisco|New England|New Orleans|Kansas City|Las Vegas|Green Bay|Tampa Bay|Washington)\s+/i, m => {
          const abbrevs = {
            'Los Angeles ': 'LA ', 'New York ': 'NY ', 'San Francisco ': 'SF ',
            'New England ': 'NE ', 'New Orleans ': 'NO ', 'Kansas City ': 'KC ',
            'Las Vegas ': 'LV ', 'Green Bay ': 'GB ', 'Tampa Bay ': 'TB ',
            'Washington ': 'WSH ',
          }
          return abbrevs[m] || m
        }) : '?'}</div>
        <div class="flex-1 min-w-0">
          <span class="text-sm font-semibold text-white truncate">${p.name}</span>
        </div>
        <span class="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${posColor}">${p.position}</span>
        <span class="flex-shrink-0 text-[10px] text-gray-500">${p.school.replace(/\s+(University|College|State|Tech)$/i, '').trim()}</span>
        <span class="flex-shrink-0 text-[10px] text-gray-600">#${p.consensusRank}</span>
      </div>`
  }).join('')

  const laterRounds = rounds.filter(r => Number(r) > 1)
  const laterRoundsHtml = laterRounds.length === 0 ? '' : `
    <details class="mt-2">
      <summary class="text-xs text-gray-500 hover:text-gray-300 cursor-pointer py-1">
        Show rounds 2–${Math.max(...laterRounds)} (${laterRounds.reduce((s, r) => s + (byRound[r]?.length || 0), 0)} picks)
      </summary>
      ${laterRounds.map(rnd => `
        <div class="mt-3">
          <div class="text-[11px] text-gray-600 uppercase tracking-wide mb-1 mt-2">Round ${rnd}</div>
          ${(byRound[rnd] || []).map(p => `
            <div class="mock-pick flex items-center gap-2 py-1.5 border-b border-gray-700/30 last:border-0 hover:bg-gray-700/20 -mx-3 px-3 cursor-pointer transition-colors rounded"
                 data-id="${p.id}">
              <span class="text-[10px] text-gray-600 w-7 text-right flex-shrink-0">#${p.projectedPick}</span>
              <span class="text-[10px] text-gray-500 w-14 truncate flex-shrink-0">${p.projectedTeam?.split(' ').pop() || '?'}</span>
              <span class="text-xs font-medium text-gray-200 flex-1 truncate">${p.name}</span>
              <span class="text-[10px] text-gray-500">${p.position}</span>
            </div>`).join('')}
        </div>`).join('')}
    </details>`

  container.innerHTML = `
    <div class="text-[11px] text-gray-600 uppercase tracking-wide mb-3">Round 1</div>
    ${pickCards}
    ${laterRoundsHtml}`

  container.querySelectorAll('.mock-pick').forEach(el => {
    el.addEventListener('click', () => {
      setState({ viewMode: 'grid', expandedCardId: el.dataset.id })
      document.getElementById('prospect-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}
