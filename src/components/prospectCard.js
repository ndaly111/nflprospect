import { trendArrow, formatDate } from '../utils/format.js'
import { nflTeamLogo } from '../utils/teams.js'
import { renderRankingChart, destroyChart } from './rankingChart.js'
import { renderCollegeStats } from './collegeStats.js'
import { renderCombinePanel } from './combinePanel.js'
import { renderNflCareerStats } from './nflCareerStats.js'
import { getState, setState, subscribe } from '../state.js'

function accoladeBadges(accolades) {
  if (!accolades) return ''
  const b = (text, color) => `<span class="text-[10px] font-bold ${color} px-1.5 py-0.5 rounded-full whitespace-nowrap">${text}</span>`
  const items = []
  if (accolades.mvp)               items.push(b('MVP',  'text-purple-300 bg-purple-900/50'))
  if (accolades.sbmvp)             items.push(b('SB MVP','text-yellow-200 bg-yellow-900/50'))
  if (accolades.opoy)              items.push(b('OPOY', 'text-green-300 bg-green-900/50'))
  if (accolades.dpoy)              items.push(b('DPOY', 'text-red-300 bg-red-900/50'))
  if (accolades.oroy)              items.push(b('OROY', 'text-emerald-300 bg-emerald-900/50'))
  if (accolades.droy)              items.push(b('DROY', 'text-orange-300 bg-orange-900/50'))
  if (accolades.cpoy)              items.push(b('CPOY', 'text-sky-300 bg-sky-900/50'))
  if (accolades.allpro1 > 0) items.push(b(`${accolades.allpro1 > 1 ? accolades.allpro1 + '× ' : ''}AP1`, 'text-yellow-400 bg-yellow-900/50'))
  if (accolades.allpro2 > 0) items.push(b(`${accolades.allpro2 > 1 ? accolades.allpro2 + '× ' : ''}AP2`, 'text-gray-300 bg-gray-700/60'))
  if (!items.length) return ''
  return `<div class="flex flex-wrap gap-1 mt-0.5 mb-1">${items.join('')}</div>`
}

function tierBadge(draftGrade) {
  if (!draftGrade) return ''
  const { tier, score, yearsEvaluated, provisional, trajectory, trajectoryPct } = draftGrade
  const STYLES = {
    Elite:   'text-amber-300 bg-amber-900/50 border border-amber-700/40',
    Starter: 'text-emerald-300 bg-emerald-900/50 border border-emerald-700/40',
    Backup:  'text-slate-300 bg-slate-700/60 border border-slate-600/40',
    Bust:    'text-red-300 bg-red-900/50 border border-red-700/40',
  }
  const style = STYLES[tier] || STYLES.Backup
  const label = provisional ? `~${tier}` : tier
  const tooltip = provisional
    ? `Provisional (${yearsEvaluated} qualifying season${yearsEvaluated !== 1 ? 's' : ''})`
    : `${tier} — ${score}/100`
  let arrow = ''
  if (trajectory === 'rising') {
    const pctStr = trajectoryPct != null ? ` +${trajectoryPct}%` : ''
    arrow = `<span class="text-green-400 font-bold text-[11px]" title="Rising production${pctStr} vs prior season">↑</span>`
  } else if (trajectory === 'declining') {
    const pctStr = trajectoryPct != null ? ` ${trajectoryPct}%` : ''
    arrow = `<span class="text-red-400 font-bold text-[11px]" title="Declining production${pctStr} vs prior season">↓</span>`
  }
  return `${arrow}<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${provisional ? 'opacity-70' : ''} ${style}" title="${tooltip}">${label}</span>`
}

function classRankBadge(draftGrade) {
  if (!draftGrade?.classRank) return ''
  const { classRank, classSize } = draftGrade
  const color = classRank === 1 ? 'text-yellow-400'
    : classRank <= 3 ? 'text-amber-400'
    : classRank <= 10 ? 'text-blue-400'
    : 'text-gray-500'
  const sfx = n => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }
  return `<span class="text-[11px] font-semibold ${color} whitespace-nowrap" title="${sfx(classRank)} best career in class of ${classSize}">${sfx(classRank)} in class</span>`
}

function renderProspectNews(name) {
  const { news } = getState()
  if (!news || news.length === 0) {
    return '<p class="text-gray-500 text-sm">No news available</p>'
  }
  // Match articles mentioning the player's last name (or full name)
  const lastName = name.split(' ').pop().toLowerCase()
  const firstName = name.split(' ')[0].toLowerCase()
  const matches = news.filter(item => {
    const text = ((item.headline || '') + ' ' + (item.description || '')).toLowerCase()
    return text.includes(lastName) && text.includes(firstName)
  })
  if (matches.length === 0) {
    return `<p class="text-gray-500 text-sm">No news mentioning ${name} found.</p>`
  }
  return matches.map(item => `
    <a href="${item.url || '#'}" target="_blank" rel="noopener"
       class="flex gap-3 py-2.5 border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20 -mx-4 px-4 transition-colors">
      ${item.image ? `<img src="${item.image}" alt="" class="w-14 h-10 object-cover rounded flex-shrink-0 bg-gray-700">` : ''}
      <div class="flex-1 min-w-0">
        <p class="text-sm text-gray-200 leading-snug line-clamp-2">${item.headline}</p>
        <p class="text-xs text-gray-500 mt-0.5">${formatDate(item.published)}</p>
      </div>
    </a>`).join('')
}

// Cache for in-class college stat percentiles
let _statPctCache = null
let _statPctLen = 0

function buildCollegeStatPct(prospects) {
  if (_statPctCache && _statPctLen === prospects.length) return _statPctCache
  const result = {}  // {posGroup: {statKey: sorted_values[]}}
  for (const p of prospects) {
    const grp = p.positionGroup
    if (!result[grp]) result[grp] = {}
    const cs = p.collegeStats || {}
    // Use all years — accumulate all values
    for (const stats of Object.values(cs)) {
      for (const [key, val] of Object.entries(stats)) {
        if (typeof val === 'number' && !isNaN(val) && val > 0 && key !== 'games') {
          if (!result[grp][key]) result[grp][key] = []
          result[grp][key].push(val)
        }
      }
    }
  }
  // Sort each array
  for (const grp of Object.values(result)) {
    for (const key of Object.keys(grp)) {
      grp[key].sort((a, b) => a - b)
    }
  }
  _statPctCache = result
  _statPctLen = prospects.length
  return result
}

const POSITION_COLORS = {
  QB: 'bg-red-900 text-red-300',
  RB: 'bg-green-900 text-green-300',
  WR: 'bg-blue-900 text-blue-300',
  TE: 'bg-purple-900 text-purple-300',
  OL: 'bg-yellow-900 text-yellow-300',
  DL: 'bg-orange-900 text-orange-300',
  EDGE: 'bg-orange-900 text-orange-300',
  LB: 'bg-teal-900 text-teal-300',
  DB: 'bg-indigo-900 text-indigo-300',
}

const SOURCE_LABELS = {
  tankathon: 'Tankathon',
  espn: 'ESPN',
  walter_football: 'Walter Football',
  cbs_sports: 'CBS Sports',
}

function renderSourceRankings(prospect) {
  const entries = Object.entries(prospect.rankBySource || {})
  if (entries.length === 0) return ''

  // Find the max rank across all prospects to scale bars
  const allRanks = getState().prospects.flatMap(p => Object.values(p.rankBySource || {}))
  const maxRank = allRanks.length ? Math.max(...allRanks) : 300

  const rows = entries.map(([src, rank]) => {
    const label = SOURCE_LABELS[src] || src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const barPct = Math.round((1 - (rank - 1) / maxRank) * 100)
    const barColor = rank <= 10 ? '#f59e0b' : rank <= 32 ? '#3b82f6' : rank <= 64 ? '#22c55e' : '#6b7280'
    return `
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-gray-500 w-28 flex-shrink-0 truncate">${label}</span>
        <div class="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full rounded-full" style="width:${barPct}%;background:${barColor}"></div>
        </div>
        <span class="text-[11px] font-bold text-gray-300 w-8 text-right flex-shrink-0">#${rank}</span>
      </div>`
  }).join('')

  const consensus = prospect.consensusRank
  const spread = entries.length >= 2
    ? Math.max(...entries.map(([,r]) => r)) - Math.min(...entries.map(([,r]) => r))
    : 0
  const spreadTxt = spread === 0 ? 'All sources agree' : spread <= 5 ? `${spread}-pick spread` : `${spread}-pick spread`
  const spreadColor = spread === 0 ? 'text-green-400' : spread <= 5 ? 'text-blue-400' : 'text-amber-400'

  return `
    <div class="mb-1">
      <div class="flex justify-between items-baseline mb-2">
        <span class="text-[11px] text-gray-500 uppercase tracking-wider">Source Rankings</span>
        <span class="text-[11px] ${spreadColor}">${spreadTxt}</span>
      </div>
      <div class="flex flex-col gap-1.5">${rows}</div>
    </div>`
}

// delta = actualPick - predrraftRank: positive = value (slid), negative = reach (early)
function pickValueBadge(delta) {
  if (!Number.isFinite(delta)) return ''
  if (delta >= 10) return `<span class="text-[10px] font-bold text-emerald-400 bg-emerald-900/40 px-1.5 py-0.5 rounded-full">Value +${delta}</span>`
  if (delta >= 5)  return `<span class="text-[10px] font-bold text-green-400 bg-green-900/40 px-1.5 py-0.5 rounded-full">+${delta}</span>`
  if (delta <= -10) return `<span class="text-[10px] font-bold text-red-400 bg-red-900/40 px-1.5 py-0.5 rounded-full">Reach ${delta}</span>`
  if (delta <= -5)  return `<span class="text-[10px] font-bold text-orange-400 bg-orange-900/40 px-1.5 py-0.5 rounded-full">${delta}</span>`
  return ''
}

function findProspectById(id) {
  const { prospects, draftYear, draftHistory } = getState()
  return prospects.find(p => p.id === id) ||
    (draftHistory[String(draftYear)] || []).find(p => p.id === id)
}

function renderHistoricalCard(prospect, isExpanded) {
  const posColor = POSITION_COLORS[prospect.positionGroup] || 'bg-gray-800 text-gray-300'
  const isStarred = getState().watchlist.includes(prospect.id)
  const displayRank = prospect.actualPick
  const histPickBadge = (prospect.espnRank && prospect.actualPick)
    ? pickValueBadge(prospect.actualPick - prospect.espnRank)
    : ''
  const rankColor = displayRank <= 5 ? 'text-yellow-400'
    : displayRank <= 32 ? 'text-blue-400'
    : displayRank <= 64 ? 'text-green-400'
    : 'text-gray-400'
  const gradeColor = (prospect.espnGrade || 0) >= 90 ? 'text-green-400'
    : (prospect.espnGrade || 0) >= 85 ? 'text-yellow-400' : 'text-gray-400'
  const headshotUrl = prospect.espnId
    ? `https://a.espncdn.com/i/headshots/college-football/players/full/${prospect.espnId}.png`
    : null

  const hw = (() => {
    const c = prospect.combineData || {}
    const parts = []
    if (c.height) {
      const h = String(c.height).replace(/['"]/g, '').trim()
      parts.push(h.includes('-') ? h.replace('-', "'") + '"' : h)
    }
    if (c.weight) parts.push(`${c.weight} lbs`)
    return parts.join(' · ')
  })()

  const teamSpan = prospect.actualTeam
    ? ` · ${nflTeamLogo(prospect.actualTeam)}<span class="text-amber-400 font-semibold ml-0.5">${prospect.actualTeam}</span>`
    : ''

  return [
    `<div class="prospect-card bg-gray-800 rounded-xl border ${isExpanded ? 'border-blue-600' : 'border-gray-700'} overflow-hidden hover:border-gray-500 transition-colors" data-id="${prospect.id}">`,
    `<div class="card-header cursor-pointer p-4 select-none" data-id="${prospect.id}">`,
    `<div class="flex items-start justify-between gap-2">`,
    `<div class="flex-1 min-w-0">`,
    `<div class="flex items-center gap-2 flex-wrap mb-1">`,
    `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${posColor}">${prospect.position}</span>`,
    `<span class="school-filter-btn text-xs text-gray-400 hover:text-blue-400 transition-colors cursor-pointer truncate" data-school="${prospect.school}">${prospect.school}</span>`,
    histPickBadge,
    tierBadge(prospect.draftGrade),
    `</div>`,
    `<h2 class="text-base font-bold text-white leading-snug mb-0.5">${prospect.name}</h2>`,
    accoladeBadges(prospect.accolades),
    `<div class="flex items-center gap-2 flex-wrap">`,
    `<span class="text-2xl font-black ${rankColor} leading-none">#${displayRank}</span>`,
    `<div class="text-xs text-gray-400 leading-snug">`,
    `<div class="flex items-center gap-2 flex-wrap">`,
    `<span>Round ${prospect.actualRound || '?'}${teamSpan}</span>`,
    classRankBadge(prospect.draftGrade),
    `</div>`,
    prospect.espnRank ? `<div class="text-gray-500 text-[11px]">ESPN pre-draft: #${prospect.espnRank}</div>` : '',
    hw ? `<div class="text-gray-500">${hw}</div>` : '',
    `</div>`,
    prospect.espnGrade ? [
      `<div class="ml-auto flex flex-col items-end">`,
      `<div class="text-[10px] text-gray-500 uppercase tracking-wider">ESPN</div>`,
      `<div class="text-base font-bold ${gradeColor}">${prospect.espnGrade}</div>`,
      `</div>`,
    ].join('') : '',
    `</div></div>`,
    `<div class="flex flex-col items-end gap-2 flex-shrink-0">`,
    headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" class="w-10 h-10 rounded-full object-cover object-top bg-gray-700 border border-gray-700" onerror="this.style.display='none'">` : '',
    `<button class="star-btn text-lg leading-none transition-colors ${isStarred ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-400'}" data-id="${prospect.id}" title="${isStarred ? 'Remove from watchlist' : 'Add to watchlist'}">★</button>`,
    `<div class="text-gray-600 text-xs card-chevron" data-id="${prospect.id}">${isExpanded ? '▲' : '▼'}</div>`,
    `</div></div></div>`,
    `<div class="card-detail ${isExpanded ? '' : 'hidden'} border-t border-gray-700" data-id="${prospect.id}">`,
    `<div class="flex border-b border-gray-700 overflow-x-auto">`,
    `<button class="detail-tab flex-1 px-3 py-2 text-xs font-medium border-b-2 border-blue-500 text-blue-400 whitespace-nowrap" data-tab="draft" data-card="${prospect.id}">Draft Info</button>`,
    `<button class="detail-tab flex-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white border-b-2 border-transparent transition-colors whitespace-nowrap" data-tab="stats" data-card="${prospect.id}">Stats</button>`,
    `<button class="detail-tab flex-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white border-b-2 border-transparent transition-colors whitespace-nowrap" data-tab="combine" data-card="${prospect.id}">Combine</button>`,
    `<button class="detail-tab flex-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white border-b-2 border-transparent transition-colors whitespace-nowrap" data-tab="nfl-career" data-card="${prospect.id}">NFL Career</button>`,
    `</div>`,
    `<div class="p-4">`,
    `<div class="tab-content" data-tab="draft" data-card="${prospect.id}">`,
    `<div class="text-sm space-y-0">`,
    prospect.espnRank ? `<div class="flex justify-between border-b border-gray-700/60 py-2"><span class="text-gray-500">ESPN Pre-Draft Rank</span><span class="font-bold text-blue-400">#${prospect.espnRank}</span></div>` : '',
    prospect.espnGrade ? `<div class="flex justify-between border-b border-gray-700/60 py-2"><span class="text-gray-500">ESPN Grade</span><span class="font-bold ${gradeColor}">${prospect.espnGrade}</span></div>` : '',
    `<div class="flex justify-between border-b border-gray-700/60 py-2"><span class="text-gray-500">Overall Pick</span><span class="font-bold text-white">#${prospect.actualPick}</span></div>`,
    `<div class="flex justify-between border-b border-gray-700/60 py-2"><span class="text-gray-500">Round</span><span class="text-white">${prospect.actualRound || '—'}</span></div>`,
    `<div class="flex justify-between border-b border-gray-700/60 py-2"><span class="text-gray-500">Team</span><span class="text-amber-400 font-semibold">${prospect.actualTeam || '—'}</span></div>`,
    `<div class="flex justify-between ${prospect.draftGrade ? 'border-b border-gray-700/60 ' : ''}py-2"><span class="text-gray-500">Position</span><span class="text-white">${prospect.position}${prospect.positionGroup !== prospect.position ? ' (' + prospect.positionGroup + ')' : ''}</span></div>`,
    prospect.draftGrade ? [
      `<div class="flex justify-between border-b border-gray-700/60 py-2"><span class="text-gray-500">NFL Grade</span><span class="flex items-center gap-2">${tierBadge(prospect.draftGrade)}<span class="text-xs text-gray-400">${prospect.draftGrade.score}/100</span></span></div>`,
      `<div class="flex justify-between py-2"><span class="text-gray-500">Class Rank</span>${classRankBadge(prospect.draftGrade)}</div>`,
    ].join('') : '',
    `</div></div>`,
    `<div class="tab-content hidden" data-tab="stats" data-card="${prospect.id}">`,
    renderCollegeStats(prospect, {}),
    `</div>`,
    `<div class="tab-content hidden" data-tab="combine" data-card="${prospect.id}">`,
    renderCombinePanel(prospect.combineData, prospect.positionGroup, null),
    `</div>`,
    `<div class="tab-content hidden" data-tab="nfl-career" data-card="${prospect.id}">`,
    renderNflCareerStats(prospect),
    `</div>`,
    `</div></div></div>`,
  ].join('')
}

export function renderProspectCard(prospect, isExpanded = false) {
  if (!prospect.consensusRank && prospect.actualPick !== undefined) {
    return renderHistoricalCard(prospect, isExpanded)
  }

  const { prospects, draftYear, draftHistory } = getState()
  const statPct = buildCollegeStatPct(prospects)
  const trend = trendArrow(prospect.rankHistory, 30)
  const isStarred = getState().watchlist.includes(prospect.id)
  const posColor = POSITION_COLORS[prospect.positionGroup] || 'bg-gray-800 text-gray-300'
  const chartId = `chart-${prospect.id}`

  const sourcesList = Object.entries(prospect.rankBySource || {}).map(([src, rank]) => {
    const label = SOURCE_LABELS[src] || src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return `<span class="whitespace-nowrap text-gray-400">${label}: <span class="text-gray-200 font-medium">#${rank}</span></span>`
  }).join('<span class="text-gray-700 mx-1">·</span>')

  const gradeColor = prospect.espnGrade >= 90 ? 'text-green-400' : prospect.espnGrade >= 85 ? 'text-yellow-400' : 'text-gray-400'
  const rankColor = prospect.consensusRank <= 5 ? 'text-yellow-400'
    : prospect.consensusRank <= 32 ? 'text-blue-400'
    : prospect.consensusRank <= 64 ? 'text-green-400'
    : 'text-gray-400'
  const headshotUrl = prospect.espnId
    ? `https://a.espncdn.com/i/headshots/college-football/players/full/${prospect.espnId}.png`
    : null

  // Height/weight compact display
  const hw = (() => {
    const c = prospect.combineData || {}
    const parts = []
    if (c.height) {
      // Normalize: '6-6' → "6'6\"", '6\'4"' → "6'4\""
      const h = String(c.height).replace(/['"]/g, '').trim()
      const formatted = h.includes('-') ? h.replace('-', "'") + '"' : h
      parts.push(formatted)
    }
    if (c.weight) parts.push(`${c.weight} lbs`)
    return parts.length ? parts.join(' · ') : ''
  })()

  // Range bar: show spread across sources
  const sourceRanks = Object.values(prospect.rankBySource || {})
  const rangeBar = (() => {
    if (sourceRanks.length < 2) return ''
    const minRank = Math.min(...sourceRanks)
    const maxRank = Math.max(...sourceRanks)
    const spread = maxRank - minRank
    const dotPct = spread === 0 ? 50 : Math.round((prospect.consensusRank - minRank) / spread * 100)
    const spreadColor = spread <= 2 ? '#22c55e' : spread <= 6 ? '#3b82f6' : '#f59e0b'
    const spreadLabel = spread === 0 ? 'all agree' : spread <= 2 ? 'tight' : spread <= 6 ? 'moderate' : 'wide'
    return `
      <div class="mt-2 pt-2 border-t border-gray-700/40">
        <div class="flex justify-between text-[10px] mb-1">
          <span class="text-green-500/80">Best: #${minRank}</span>
          <span style="color:${spreadColor}">${spread === 0 ? '✓ ' : ''}${spreadLabel}${spread > 0 ? ` (${spread})` : ''}</span>
          <span class="text-amber-500/80">Worst: #${maxRank}</span>
        </div>
        <div class="relative h-1 bg-gray-700/60 rounded-full">
          <div class="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-gray-800"
               style="left:${dotPct}%;transform:translate(-50%,-50%);background:${spreadColor}"></div>
        </div>
      </div>`
  })()

  // Big mover badge (>= 7 spots in 30 days)
  const moverBadge = (() => {
    if (prospect.actualPick) return ''  // post-draft: replace with drafted badge
    if (Math.abs(trend.delta) < 7) return ''
    if (trend.delta > 0) return `<span class="text-[10px] font-bold text-emerald-400 bg-emerald-900/40 px-1.5 py-0.5 rounded-full">🔥 +${trend.delta}</span>`
    return `<span class="text-[10px] font-bold text-red-400 bg-red-900/40 px-1.5 py-0.5 rounded-full">↘ ${trend.delta}</span>`
  })()

  // Post-draft badge + actual pick line (replaces projected info once draft happens)
  const draftedBadge = prospect.actualPick
    ? '<span class="text-[10px] font-bold text-green-400 bg-green-900/40 px-1.5 py-0.5 rounded-full">✓ DRAFTED</span>'
    : ''
  const postDraftPickBadge = (prospect.actualPick && prospect.consensusRank)
    ? pickValueBadge(prospect.actualPick - prospect.consensusRank)
    : ''

  const pickInfoLine = (() => {
    if (prospect.actualPick) {
      return [
        '<div>',
        `Round ${prospect.actualRound}`,
        ` · <span class="font-bold text-green-400">#${prospect.actualPick} overall</span>`,
        ` · ${nflTeamLogo(prospect.actualTeam)}<span class="team-filter-btn text-amber-400 font-semibold hover:text-amber-300 cursor-pointer transition-colors ml-0.5" data-team="${prospect.actualTeam}">${prospect.actualTeam}</span>`,
        '</div>',
      ].join('')
    }
    const posInfo = `#${prospect.positionRank}${prospect.positionTotal ? '<span class="text-gray-600">/' + prospect.positionTotal + '</span>' : ''} ${prospect.positionGroup}`
    const rdInfo = `Rd ${prospect.projectedRound || '?'}${prospect.projectedPickRange ? ' <span class="text-gray-600">(#' + prospect.projectedPickRange[0] + '–' + prospect.projectedPickRange[1] + ')</span>' : ''}`
    const teamOnly = prospect.projectedTeam
      ? ` &nbsp;·&nbsp; <span class="team-filter-btn text-amber-400 font-semibold hover:text-amber-300 cursor-pointer transition-colors" data-team="${prospect.projectedTeam}">${prospect.projectedTeam.split(' ').pop()}</span>`
      : ''
    return `<div>${rdInfo} &nbsp;·&nbsp; ${posInfo}${teamOnly}</div>`
  })()

  return `
    <div class="prospect-card bg-gray-800 rounded-xl border ${isExpanded ? 'border-blue-600' : 'border-gray-700'} overflow-hidden hover:border-gray-500 transition-colors"
         data-id="${prospect.id}">

      <!-- Card Header -->
      <div class="card-header cursor-pointer p-4 select-none" data-id="${prospect.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${posColor}">${prospect.position}</span>
              <span class="school-filter-btn text-xs text-gray-400 hover:text-blue-400 transition-colors cursor-pointer truncate"
                    data-school="${prospect.school}" title="Show all ${prospect.school} prospects">${prospect.school}</span>
              ${prospect.classYear ? `<span class="text-xs text-gray-600">${prospect.classYear}</span>` : ''}
              ${draftedBadge}${postDraftPickBadge}${moverBadge}
            </div>
            <h2 class="text-base font-bold text-white leading-snug mb-1">${prospect.name}</h2>
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex flex-col items-center mr-1">
                <span class="text-2xl font-black ${rankColor} leading-none">#${prospect.consensusRank}</span>
                <span class="text-[9px] text-gray-500 uppercase tracking-wider leading-tight mt-0.5">Rank</span>
              </div>
              ${(!prospect.actualPick && prospect.projectedPick) ? `
              <div class="flex flex-col items-center mr-1">
                <span class="text-2xl font-black text-gray-400 leading-none">#${prospect.projectedPick}</span>
                <span class="text-[9px] text-gray-500 uppercase tracking-wider leading-tight mt-0.5">Mock</span>
              </div>` : ''}
              <div class="text-xs text-gray-400 leading-snug">
                ${pickInfoLine}
                <div class="flex items-center gap-2">
                  <span class="${trend.cls} font-medium">${trend.arrow}</span>
                  ${hw ? `<span class="text-gray-600">·</span><span class="text-gray-500">${hw}</span>` : ''}
                </div>
              </div>
              ${prospect.espnGrade ? `
                <div class="ml-auto flex flex-col items-end">
                  <div class="text-[10px] text-gray-500 uppercase tracking-wider">ESPN</div>
                  <div class="text-base font-bold ${gradeColor}">${prospect.espnGrade}</div>
                </div>` : ''}
            </div>
          </div>
          <div class="flex flex-col items-end gap-2 flex-shrink-0">
            ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy"
              class="w-10 h-10 rounded-full object-cover object-top bg-gray-700 border border-gray-700"
              onerror="this.style.display='none'">` : ''}
            <button class="star-btn text-lg leading-none transition-colors ${isStarred ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-400'}" data-id="${prospect.id}" title="${isStarred ? 'Remove from watchlist' : 'Add to watchlist'}">★</button>
            <button class="share-btn text-gray-600 hover:text-gray-300 transition-colors text-xs p-1" data-id="${prospect.id}" title="Copy link">⎘</button>
            <div class="text-gray-600 text-xs card-chevron" data-id="${prospect.id}">${isExpanded ? '▲' : '▼'}</div>
          </div>
        </div>
        ${rangeBar}
        ${sourcesList ? `
          <div class="mt-2 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
            ${sourcesList}
          </div>` : ''}
      </div>

      <!-- Expandable Detail -->
      <div class="card-detail ${isExpanded ? '' : 'hidden'} border-t border-gray-700" data-id="${prospect.id}">
        <div class="flex border-b border-gray-700 overflow-x-auto">
          <button class="detail-tab flex-1 px-3 py-2 text-xs font-medium border-b-2 border-blue-500 text-blue-400 whitespace-nowrap" data-tab="ranking" data-card="${prospect.id}">Rankings</button>
          <button class="detail-tab flex-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white border-b-2 border-transparent transition-colors whitespace-nowrap" data-tab="stats" data-card="${prospect.id}">Stats</button>
          <button class="detail-tab flex-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white border-b-2 border-transparent transition-colors whitespace-nowrap" data-tab="combine" data-card="${prospect.id}">Combine</button>
          <button class="detail-tab flex-1 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white border-b-2 border-transparent transition-colors whitespace-nowrap" data-tab="news" data-card="${prospect.id}">News</button>
        </div>
        <div class="p-4">
          <div class="tab-content" data-tab="ranking" data-card="${prospect.id}">
            ${renderSourceRankings(prospect)}
            <div style="height:160px; position:relative;" class="mt-3">
              <canvas id="${chartId}"></canvas>
            </div>
          </div>
          <div class="tab-content hidden" data-tab="stats" data-card="${prospect.id}">
            ${renderCollegeStats(prospect, statPct[prospect.positionGroup] || {}, getState().wrTargetHistory)}
          </div>
          <div class="tab-content hidden" data-tab="combine" data-card="${prospect.id}">
            ${renderCombinePanel(prospect.combineData, prospect.positionGroup, prospect.playerComps)}
          </div>
          <div class="tab-content hidden" data-tab="news" data-card="${prospect.id}">
            ${renderProspectNews(prospect.name)}
          </div>
        </div>
      </div>
    </div>`
}

export function wireCardEvents(container) {
  container.addEventListener('click', e => {
    // School filter shortcut
    const schoolBtn = e.target.closest('.school-filter-btn')
    if (schoolBtn) {
      e.stopPropagation()
      const { filters } = getState()
      const school = schoolBtn.dataset.school
      setState({ filters: { ...filters, search: filters.search === school ? '' : school }, expandedCardId: null })
      return
    }

    // Team filter shortcut
    const teamBtn = e.target.closest('.team-filter-btn')
    if (teamBtn) {
      e.stopPropagation()
      const { filters } = getState()
      const team = teamBtn.dataset.team
      setState({ filters: { ...filters, search: filters.search === team ? '' : team }, expandedCardId: null })
      return
    }

    // Star / watchlist button
    const starBtn = e.target.closest('.star-btn')
    if (starBtn) {
      e.stopPropagation()
      const id = starBtn.dataset.id
      const { watchlist } = getState()
      const next = watchlist.includes(id) ? watchlist.filter(x => x !== id) : [...watchlist, id]
      setState({ watchlist: next })
      return
    }

    // Share button
    const shareBtn = e.target.closest('.share-btn')
    if (shareBtn) {
      e.stopPropagation()
      const id = shareBtn.dataset.id
      const url = `${location.origin}${location.pathname}?p=${encodeURIComponent(id)}`
      navigator.clipboard?.writeText(url).then(() => {
        shareBtn.textContent = '✓'
        setTimeout(() => { shareBtn.textContent = '⎘' }, 1500)
      })
      return
    }

    const tab = e.target.closest('.detail-tab')
    if (tab) {
      handleTabClick(tab)
      return
    }
    const header = e.target.closest('.card-header')
    if (header) {
      handleCardToggle(header.dataset.id)
    }
  })
}

function handleCardToggle(id) {
  const state = getState()
  const wasExpanded = state.expandedCardId === id

  // Destroy chart for previously expanded card
  if (state.expandedCardId) {
    destroyChart(`chart-${state.expandedCardId}`)
  }

  if (wasExpanded) {
    setState({ expandedCardId: null })
    // Visually collapse immediately (DOM is still live)
    collapseCardDOM(id)
  } else {
    // Collapse previous
    if (state.expandedCardId) collapseCardDOM(state.expandedCardId)
    setState({ expandedCardId: id })
    expandCardDOM(id)
  }
}

function expandCardDOM(id) {
  const card = document.querySelector(`.prospect-card[data-id="${id}"]`)
  const detail = document.querySelector(`.card-detail[data-id="${id}"]`)
  const chevron = document.querySelector(`.card-chevron[data-id="${id}"]`)
  if (!detail) return

  detail.classList.remove('hidden')
  if (card) card.classList.replace('border-gray-700', 'border-blue-600')
  if (chevron) chevron.textContent = '▲'

  // Reset to first available tab (ranking for current-year, draft for historical)
  const rankTab = detail.querySelector('.detail-tab[data-tab="ranking"]')
  const draftTab = detail.querySelector('.detail-tab[data-tab="draft"]')
  const firstTab = rankTab || draftTab
  if (firstTab) {
    activateTab(firstTab)
    const firstTabName = firstTab.dataset.tab
    detail.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('hidden', c.dataset.tab !== firstTabName)
    })
  }

  // Init chart (only for current-year prospects with rank history)
  const prospect = findProspectById(id)
  if (prospect && prospect.rankHistory) {
    setTimeout(() => renderRankingChart(`chart-${id}`, prospect.rankHistory), 60)
  }

  // Scroll expanded card into view on mobile (only if partially off-screen)
  if (card) {
    setTimeout(() => {
      const rect = card.getBoundingClientRect()
      if (rect.bottom > window.innerHeight || rect.top < 60) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 80)
  }
}

function collapseCardDOM(id) {
  const card = document.querySelector(`.prospect-card[data-id="${id}"]`)
  const detail = document.querySelector(`.card-detail[data-id="${id}"]`)
  const chevron = document.querySelector(`.card-chevron[data-id="${id}"]`)
  if (!detail) return
  detail.classList.add('hidden')
  if (card) {
    card.classList.remove('border-blue-600')
    card.classList.add('border-gray-700')
  }
  if (chevron) chevron.textContent = '▼'
}

function handleTabClick(tab) {
  activateTab(tab)
  const cardId = tab.dataset.card
  const tabName = tab.dataset.tab

  document.querySelectorAll(`.tab-content[data-card="${cardId}"]`).forEach(c => {
    c.classList.toggle('hidden', c.dataset.tab !== tabName)
  })

  if (tabName === 'ranking') {
    const prospect = findProspectById(cardId)
    if (prospect && prospect.rankHistory) {
      setTimeout(() => renderRankingChart(`chart-${cardId}`, prospect.rankHistory), 60)
    }
  }

  if (tabName === 'combine') {
    const prospect = findProspectById(cardId)
    const combineEl = document.querySelector(`.tab-content[data-tab="combine"][data-card="${cardId}"]`)
    if (prospect && combineEl) {
      combineEl.innerHTML = renderCombinePanel(prospect.combineData, prospect.positionGroup, prospect.playerComps || null)
    }
  }
}

function activateTab(activeTab) {
  const cardId = activeTab.dataset.card
  document.querySelectorAll(`.detail-tab[data-card="${cardId}"]`).forEach(t => {
    const isActive = t === activeTab
    t.classList.toggle('border-blue-500', isActive)
    t.classList.toggle('text-blue-400', isActive)
    t.classList.toggle('border-transparent', !isActive)
    t.classList.toggle('text-gray-400', !isActive)
  })
}
