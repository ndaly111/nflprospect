import { trendArrow, formatDate } from '../utils/format.js'
import { nflTeamLogo } from '../utils/teams.js'
import { renderRankingChart, destroyChart } from './rankingChart.js'
import { renderCollegeStats } from './collegeStats.js'
import { renderCombinePanel } from './combinePanel.js'
import { renderNflCareerStats } from './nflCareerStats.js'
import { getState, setState, subscribe } from '../state.js'

// ─── Helpers ─────────────────────────────────────────────────

const TEAM_COLORS = {
  'Arizona Cardinals': '#97233F', 'Atlanta Falcons': '#A71930',
  'Baltimore Ravens': '#241773', 'Buffalo Bills': '#00338D',
  'Carolina Panthers': '#0085CA', 'Chicago Bears': '#0B162A',
  'Cincinnati Bengals': '#FB4F14', 'Cleveland Browns': '#311D00',
  'Dallas Cowboys': '#003594', 'Denver Broncos': '#FB4F14',
  'Detroit Lions': '#0076B6', 'Green Bay Packers': '#203731',
  'Houston Texans': '#03202F', 'Indianapolis Colts': '#002C5F',
  'Jacksonville Jaguars': '#006778', 'Kansas City Chiefs': '#E31837',
  'Las Vegas Raiders': '#1a1a1a', 'Los Angeles Chargers': '#0080C6',
  'Los Angeles Rams': '#003594', 'Miami Dolphins': '#008E97',
  'Minnesota Vikings': '#4F2683', 'New England Patriots': '#002244',
  'New Orleans Saints': '#A28C5C', 'New York Giants': '#0B2265',
  'New York Jets': '#125740', 'Philadelphia Eagles': '#004C54',
  'Pittsburgh Steelers': '#101820', 'San Francisco 49ers': '#AA0000',
  'Seattle Seahawks': '#002244', 'Tampa Bay Buccaneers': '#D50A0A',
  'Tennessee Titans': '#0C2340', 'Washington Commanders': '#5A1414',
}
const SCHOOL_COLORS = {
  'Texas': '#BF5700', 'Ohio State': '#BB0000', 'Alabama': '#9E1B32',
  'Georgia': '#BA0C2F', 'Michigan': '#00274C', 'Notre Dame': '#0C2340',
  'LSU': '#461D7C', 'USC': '#990000', 'Oregon': '#154733',
  'Penn State': '#041E42', 'Clemson': '#F56600', 'Tennessee': '#FF8200',
  'Florida': '#0021A5', 'Miami': '#F47321', 'Auburn': '#0C2340',
  'Oklahoma': '#841617', 'Indiana': '#990000', 'Texas A&M': '#500000',
  'South Carolina': '#73000a', 'Iowa': '#FFCD00', 'Nebraska': '#E41C38',
  'Wisconsin': '#C5050C', 'North Carolina': '#7BAFD4', 'Stanford': '#8C1515',
  'Utah': '#CC0000', 'Washington': '#4B2E83',
}
function teamColor(p) {
  if (p.actualTeam && TEAM_COLORS[p.actualTeam]) return TEAM_COLORS[p.actualTeam]
  if (p.projectedTeam && TEAM_COLORS[p.projectedTeam]) return TEAM_COLORS[p.projectedTeam]
  if (p.school && SCHOOL_COLORS[p.school]) return SCHOOL_COLORS[p.school]
  return 'var(--ink-soft)'
}

function splitName(name) {
  if (!name) return { first: '', last: '' }
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first: '', last: parts[0] }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}
function padRank(n) { return n == null ? '—' : String(n).padStart(2, '0') }
function fmtHeight(c) {
  if (!c?.height) return null
  const h = String(c.height).replace(/['"]/g, '').trim()
  return h.includes('-') ? h.replace('-', "'") + '"' : h
}
function fmtFortyVert(c, key, suffix) {
  const v = c?.[key]
  if (v == null || v === '') return { v: '—', muted: true, suffix: '' }
  return { v: typeof v === 'number' ? v.toFixed(suffix === 's' ? 2 : 0) : String(v), muted: false, suffix }
}

function trendSvg(delta) {
  if (delta === 0 || !delta) {
    return `<svg viewBox="0 0 10 10" aria-hidden="true"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.6"/></svg>`
  }
  if (delta > 0) {
    return `<svg viewBox="0 0 10 10" aria-hidden="true"><polyline points="1,8 5,2 9,8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`
  }
  return `<svg viewBox="0 0 10 10" aria-hidden="true"><polyline points="1,2 5,8 9,2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`
}

function sourceDots(prospect, sources = ['tankathon','espn','walter_football','cbs_sports']) {
  const present = prospect.rankBySource || {}
  return `<span class="alm-sources" aria-label="Source coverage">${
    sources.map(s => `<i class="${present[s] != null ? 'on' : ''}"></i>`).join('')
  }</span>`
}

// ─── Existing helpers (unchanged behavior, only minor restyles) ──

function accoladeBadges(accolades) {
  if (!accolades) return ''
  const b = (text, kind) => `<span class="alm-badge ${kind}">${text}</span>`
  const items = []
  if (accolades.mvp)               items.push(b('MVP',  'ox'))
  if (accolades.sbmvp)             items.push(b('SB MVP','brass'))
  if (accolades.opoy)              items.push(b('OPOY', 'moss'))
  if (accolades.dpoy)              items.push(b('DPOY', 'ox'))
  if (accolades.oroy)              items.push(b('OROY', 'moss'))
  if (accolades.droy)              items.push(b('DROY', 'ox'))
  if (accolades.cpoy)              items.push(b('CPOY', 'ink'))
  if (accolades.allpro1 > 0) items.push(b(`${accolades.allpro1 > 1 ? accolades.allpro1 + '× ' : ''}AP1`, 'brass'))
  if (accolades.allpro2 > 0) items.push(b(`${accolades.allpro2 > 1 ? accolades.allpro2 + '× ' : ''}AP2`, 'ink'))
  if (!items.length) return ''
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 2px;">${items.join('')}</div>`
}

function tierBadge(draftGrade) {
  if (!draftGrade) return ''
  const { tier, score, yearsEvaluated, provisional, trajectory, trajectoryPct } = draftGrade
  const KIND = { Elite: 'brass', Starter: 'moss', Backup: 'ink', Bust: 'ox' }
  const kind = KIND[tier] || 'ink'
  const label = provisional ? `~${tier}` : tier
  const tooltip = provisional
    ? `Provisional (${yearsEvaluated} qualifying season${yearsEvaluated !== 1 ? 's' : ''})`
    : `${tier} — ${score}/100`
  let arrow = ''
  if (trajectory === 'rising') {
    const pctStr = trajectoryPct != null ? ` +${trajectoryPct}%` : ''
    arrow = `<span style="color:var(--moss);font-weight:700;font-family:var(--font-mono);" title="Rising production${pctStr} vs prior season">↑</span>`
  } else if (trajectory === 'declining') {
    const pctStr = trajectoryPct != null ? ` ${trajectoryPct}%` : ''
    arrow = `<span style="color:var(--oxblood);font-weight:700;font-family:var(--font-mono);" title="Declining production${pctStr} vs prior season">↓</span>`
  }
  return `${arrow}<span class="alm-badge ${kind}" style="${provisional ? 'opacity:0.7;' : ''}" title="${tooltip}">${label}</span>`
}

function classRankBadge(draftGrade) {
  if (!draftGrade?.classRank) return ''
  const { classRank, classSize } = draftGrade
  const sfx = n => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }
  const color = classRank === 1 ? 'var(--brass)' : classRank <= 10 ? 'var(--ink)' : 'var(--ink-faint)'
  return `<span style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${color};" title="${sfx(classRank)} best career in class of ${classSize}">${sfx(classRank)} in class</span>`
}

function renderProspectNews(name) {
  const { news } = getState()
  if (!news || news.length === 0) {
    return '<p style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">No news on the wire.</p>'
  }
  const lastName = name.split(' ').pop().toLowerCase()
  const firstName = name.split(' ')[0].toLowerCase()
  const matches = news.filter(item => {
    const text = ((item.headline || '') + ' ' + (item.description || '')).toLowerCase()
    return text.includes(lastName) && text.includes(firstName)
  })
  if (matches.length === 0) {
    return `<p style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">No filings mention ${name}.</p>`
  }
  return matches.map(item => `
    <a href="${item.url || '#'}" target="_blank" rel="noopener"
       style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--rule-soft);text-decoration:none;color:inherit;">
      ${item.image ? `<img src="${item.image}" alt="" style="width:56px;height:40px;object-fit:cover;border:1px solid var(--rule);">` : ''}
      <div style="flex:1;min-width:0;">
        <p style="margin:0;font-family:var(--font-serif);font-size:14px;line-height:1.35;color:var(--ink);">${item.headline}</p>
        <p style="margin:2px 0 0;font-family:var(--font-mono);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-faint);">${formatDate(item.published)}</p>
      </div>
    </a>`).join('')
}

let _statPctCache = null
let _statPctLen = 0

function buildCollegeStatPct(prospects) {
  if (_statPctCache && _statPctLen === prospects.length) return _statPctCache
  const result = {}
  for (const p of prospects) {
    const grp = p.positionGroup
    if (!result[grp]) result[grp] = {}
    const cs = p.collegeStats || {}
    for (const stats of Object.values(cs)) {
      for (const [key, val] of Object.entries(stats)) {
        if (typeof val === 'number' && !isNaN(val) && val > 0 && key !== 'games') {
          if (!result[grp][key]) result[grp][key] = []
          result[grp][key].push(val)
        }
      }
    }
  }
  for (const grp of Object.values(result)) {
    for (const key of Object.keys(grp)) grp[key].sort((a, b) => a - b)
  }
  _statPctCache = result
  _statPctLen = prospects.length
  return result
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
  const allRanks = getState().prospects.flatMap(p => Object.values(p.rankBySource || {}))
  const maxRank = allRanks.length ? Math.max(...allRanks) : 300

  const rows = entries.map(([src, rank]) => {
    const label = SOURCE_LABELS[src] || src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const barPct = Math.round((1 - (rank - 1) / maxRank) * 100)
    const barColor = rank <= 10 ? 'var(--brass)' : rank <= 32 ? 'var(--ink)' : rank <= 64 ? 'var(--moss)' : 'var(--ink-faint)'
    return `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ink-soft);width:120px;flex-shrink:0;">${label}</span>
        <div style="flex:1;height:2px;background:var(--rule-soft);position:relative;">
          <div style="position:absolute;left:0;top:0;height:100%;background:${barColor};width:${barPct}%;"></div>
        </div>
        <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--ink);width:32px;text-align:right;flex-shrink:0;">#${rank}</span>
      </div>`
  }).join('')

  const consensus = prospect.consensusRank
  const spread = entries.length >= 2
    ? Math.max(...entries.map(([,r]) => r)) - Math.min(...entries.map(([,r]) => r))
    : 0
  const spreadTxt = spread === 0 ? 'All boards agree' : `${spread}-pick spread`
  const spreadColor = spread === 0 ? 'var(--moss)' : spread <= 5 ? 'var(--ink)' : 'var(--brass)'

  return `
    <div style="margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
        <span style="font-family:var(--font-display);font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-soft);font-weight:700;">Source Rankings</span>
        <span style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${spreadColor};">${spreadTxt}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">${rows}</div>
    </div>`
}

function pickValueBadge(delta) {
  if (!Number.isFinite(delta)) return ''
  if (delta >= 10) return `<span class="alm-badge moss">Value +${delta}</span>`
  if (delta >= 5)  return `<span class="alm-badge moss">+${delta}</span>`
  if (delta <= -10) return `<span class="alm-badge ox">Reach ${delta}</span>`
  if (delta <= -5)  return `<span class="alm-badge ox">${delta}</span>`
  return ''
}

function findProspectById(id) {
  const { prospects, draftYear, draftHistory } = getState()
  return prospects.find(p => p.id === id) ||
    (draftHistory[String(draftYear)] || []).find(p => p.id === id)
}

// ─── Stat tile builders (4 universal headline measurables) ──

function statTilesCurrent(prospect) {
  const c = prospect.combineData || {}
  const ht = fmtHeight(c)
  const wt = c.weight ? String(c.weight) : null
  const f = c.forty != null ? Number(c.forty).toFixed(2) : null
  const v = c.vertical != null ? String(Math.round(c.vertical)) : null
  return [
    { k: 'Ht',   v: ht ?? '—',                muted: !ht,        suffix: '' },
    { k: 'Wt',   v: wt ?? '—',                muted: !wt,        suffix: wt ? 'lb' : '' },
    { k: '40-yd', v: f ?? '—',                 muted: !f,         suffix: f ? 's' : '' },
    { k: 'Vert', v: v ?? '—',                 muted: !v,         suffix: v ? '"' : '' },
  ]
}

function statTilesHistorical(prospect) {
  const c = prospect.combineData || {}
  const ht = fmtHeight(c)
  const wt = c.weight ? String(c.weight) : null
  const f = c.forty != null ? Number(c.forty).toFixed(2) : null
  return [
    { k: 'Ht',   v: ht ?? '—',                muted: !ht,        suffix: '' },
    { k: 'Wt',   v: wt ?? '—',                muted: !wt,        suffix: wt ? 'lb' : '' },
    { k: '40-yd', v: f ?? '—',                 muted: !f,         suffix: f ? 's' : '' },
    { k: 'Pick', v: prospect.actualPick ? `#${prospect.actualPick}` : '—', muted: !prospect.actualPick, suffix: '' },
  ]
}

function renderStatTiles(tiles) {
  return `<div class="alm-stats">${
    tiles.map(t => `
      <div class="alm-stat">
        <span class="alm-k">${t.k}</span>
        <span class="alm-v${t.muted ? ' muted' : ''}">${t.v}${t.suffix ? `<small>${t.suffix}</small>` : ''}</span>
      </div>`).join('')
  }</div>`
}

// ─── Spread bar (current-year only) ──

function renderSpreadBar(prospect) {
  const sourceRanks = Object.values(prospect.rankBySource || {})
  if (sourceRanks.length < 2) return ''
  const minRank = Math.min(...sourceRanks)
  const maxRank = Math.max(...sourceRanks)
  const spread = maxRank - minRank
  const dotPct = spread === 0 ? 50 : Math.round((prospect.consensusRank - minRank) / spread * 100)
  const spreadLabel = spread === 0 ? 'all agree' : spread <= 2 ? 'tight' : spread <= 6 ? 'moderate' : 'wide'
  return `
    <div class="alm-spread">
      <div class="lab">
        <span class="min">Best · #${minRank}</span>
        <span>${spreadLabel}${spread > 0 ? ` (${spread})` : ''}</span>
        <span class="max">Worst · #${maxRank}</span>
      </div>
      <div class="bar"><i style="left:${dotPct}%"></i></div>
    </div>`
}

// ═══ Historical card (drafted prospects in past classes) ══════════════════

function renderHistoricalCard(prospect, isExpanded) {
  const isStarred = getState().watchlist.includes(prospect.id)
  const displayRank = prospect.actualPick
  const histPickBadge = (prospect.espnRank && prospect.actualPick)
    ? pickValueBadge(prospect.actualPick - prospect.espnRank)
    : ''
  const headshotUrl = prospect.espnId
    ? `https://a.espncdn.com/i/headshots/college-football/players/full/${prospect.espnId}.png`
    : null
  const { first, last } = splitName(prospect.name)
  const tiles = statTilesHistorical(prospect)
  const teamCol = teamColor(prospect)
  const featured = displayRank && displayRank <= 3 ? ' featured' : ''

  return [
    `<div class="prospect-card${featured} ${isExpanded ? 'border-blue-600' : ''}" style="--team:${teamCol};" data-id="${prospect.id}">`,
    `<div class="alm-stripe" aria-hidden="true"></div>`,
    `<div class="card-header" data-id="${prospect.id}">`,
    `<span class="alm-rank">${padRank(displayRank)}</span>`,
    `<div class="alm-side">`,
    headshotUrl ? `<img src="${headshotUrl}" class="alm-headshot" alt="" loading="lazy" onerror="this.style.display='none'">` : '',
    `<button class="star-btn" data-id="${prospect.id}" data-on="${isStarred ? '1' : '0'}" title="${isStarred ? 'Remove from watchlist' : 'Add to watchlist'}">★</button>`,
    `<span class="card-chevron" data-id="${prospect.id}">${isExpanded ? '▲' : '▼'}</span>`,
    `</div>`,
    `<div class="alm-name">`,
    first ? `<span class="alm-first">${first}</span>` : '',
    `<span class="alm-last">${last || prospect.name}</span>`,
    `</div>`,
    `<div class="alm-meta">`,
    `<span class="alm-pos">${prospect.position}</span>`,
    `<span class="school-filter-btn" data-school="${prospect.school}">${prospect.school}</span>`,
    prospect.actualTeam ? `<span class="sep">·</span><span class="team-filter-btn" data-team="${prospect.actualTeam}" style="cursor:pointer;color:var(--brass);">${prospect.actualTeam}</span>` : '',
    `</div>`,
    accoladeBadges(prospect.accolades),
    renderStatTiles(tiles),
    `<div class="alm-row">`,
    `<span style="display:flex;align-items:center;gap:8px;">`,
    `<span>Round ${prospect.actualRound || '—'}</span>`,
    histPickBadge,
    tierBadge(prospect.draftGrade),
    `</span>`,
    `<span>${classRankBadge(prospect.draftGrade)}</span>`,
    `</div>`,
    prospect.espnRank || prospect.espnGrade ? [
      `<div class="alm-srcline">`,
      prospect.espnRank ? `<span>ESPN Pre-Draft: <strong>#${prospect.espnRank}</strong></span>` : '',
      prospect.espnGrade ? `<span>ESPN Grade: <strong>${prospect.espnGrade}</strong></span>` : '',
      `</div>`,
    ].join('') : '',
    `</div>`,
    `<div class="card-detail ${isExpanded ? '' : 'hidden'}" data-id="${prospect.id}">`,
    `<div class="flex border-b overflow-x-auto" style="border-color:var(--rule-soft);">`,
    `<button class="detail-tab flex-1 px-3 py-2 border-b-2 border-blue-500" data-tab="draft" data-card="${prospect.id}">Draft Info</button>`,
    `<button class="detail-tab flex-1 px-3 py-2 border-b-2 border-transparent" data-tab="stats" data-card="${prospect.id}">Stats</button>`,
    `<button class="detail-tab flex-1 px-3 py-2 border-b-2 border-transparent" data-tab="combine" data-card="${prospect.id}">Combine</button>`,
    `<button class="detail-tab flex-1 px-3 py-2 border-b-2 border-transparent" data-tab="nfl-career" data-card="${prospect.id}">NFL Career</button>`,
    `</div>`,
    `<div class="p-4">`,
    `<div class="tab-content" data-tab="draft" data-card="${prospect.id}">`,
    `<div style="font-family:var(--font-serif);font-size:14px;">`,
    prospect.espnRank ? `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--rule-soft);padding:8px 0;"><span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">ESPN Pre-Draft Rank</span><span style="font-weight:700;">#${prospect.espnRank}</span></div>` : '',
    prospect.espnGrade ? `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--rule-soft);padding:8px 0;"><span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">ESPN Grade</span><span style="font-weight:700;">${prospect.espnGrade}</span></div>` : '',
    `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--rule-soft);padding:8px 0;"><span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Overall Pick</span><span style="font-weight:700;">#${prospect.actualPick}</span></div>`,
    `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--rule-soft);padding:8px 0;"><span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Round</span><span>${prospect.actualRound || '—'}</span></div>`,
    `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--rule-soft);padding:8px 0;"><span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Team</span><span style="color:var(--brass);font-weight:700;">${prospect.actualTeam || '—'}</span></div>`,
    `<div style="display:flex;justify-content:space-between;${prospect.draftGrade ? 'border-bottom:1px solid var(--rule-soft);' : ''}padding:8px 0;"><span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Position</span><span>${prospect.position}${prospect.positionGroup !== prospect.position ? ' (' + prospect.positionGroup + ')' : ''}</span></div>`,
    prospect.draftGrade ? [
      `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--rule-soft);padding:8px 0;align-items:center;"><span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">NFL Grade</span><span style="display:flex;align-items:center;gap:8px;">${tierBadge(prospect.draftGrade)}<span style="font-family:var(--font-mono);font-size:11px;color:var(--ink-soft);">${prospect.draftGrade.score}/100</span></span></div>`,
      `<div style="display:flex;justify-content:space-between;padding:8px 0;align-items:center;"><span style="color:var(--ink-faint);font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Class Rank</span>${classRankBadge(prospect.draftGrade)}</div>`,
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

// ═══ Current-year prospect card ═══════════════════════════════════════════

export function renderProspectCard(prospect, isExpanded = false) {
  if (!prospect.consensusRank && prospect.actualPick !== undefined) {
    return renderHistoricalCard(prospect, isExpanded)
  }

  const { prospects } = getState()
  const statPct = buildCollegeStatPct(prospects)
  const trend = trendArrow(prospect.rankHistory, 30)
  const isStarred = getState().watchlist.includes(prospect.id)
  const chartId = `chart-${prospect.id}`
  const { first, last } = splitName(prospect.name)
  const headshotUrl = prospect.espnId
    ? `https://a.espncdn.com/i/headshots/college-football/players/full/${prospect.espnId}.png`
    : null
  const teamCol = teamColor(prospect)
  const featured = prospect.consensusRank <= 3 ? ' featured' : ''

  // Pick info line
  const pickInfoLine = (() => {
    if (prospect.actualPick) {
      return `<span>R${prospect.actualRound} · #${prospect.actualPick} overall · <span class="team-filter-btn" data-team="${prospect.actualTeam}" style="cursor:pointer;color:var(--brass);font-weight:700;">${prospect.actualTeam}</span></span>`
    }
    const posInfo = `${prospect.positionGroup} #${prospect.positionRank}${prospect.positionTotal ? ` of ${prospect.positionTotal}` : ''}`
    const rdInfo = `Rd ${prospect.projectedRound || '?'}${prospect.projectedPickRange ? ` · #${prospect.projectedPickRange[0]}–${prospect.projectedPickRange[1]}` : ''}`
    const teamOnly = prospect.projectedTeam
      ? ` · <span class="team-filter-btn" data-team="${prospect.projectedTeam}" style="cursor:pointer;color:var(--brass);font-weight:700;">${prospect.projectedTeam.split(' ').pop()}</span>`
      : ''
    return `<span>${rdInfo} · ${posInfo}${teamOnly}</span>`
  })()

  // Trend marker
  const trendCls = trend.delta > 0 ? '' : trend.delta < 0 ? ' down' : ' flat'
  const trendNum = trend.delta > 0 ? `+${trend.delta}` : (trend.delta || '0')
  const trendBlock = `<span class="alm-trend${trendCls}">${trendSvg(trend.delta)} ${trendNum} · 30-day</span>`

  // Big-mover marker (≥7 spots)
  const moverBadge = (prospect.actualPick || Math.abs(trend.delta) < 7)
    ? ''
    : (trend.delta > 0
        ? `<span class="alm-badge moss">Riser +${trend.delta}</span>`
        : `<span class="alm-badge ox">Falling ${trend.delta}</span>`)

  const draftedBadge = prospect.actualPick
    ? `<span class="alm-badge moss">✓ Drafted</span>`
    : ''
  const postDraftPickBadge = (prospect.actualPick && prospect.consensusRank)
    ? pickValueBadge(prospect.actualPick - prospect.consensusRank)
    : ''

  // Sources line
  const srcLine = Object.entries(prospect.rankBySource || {}).map(([src, rank]) => {
    const label = SOURCE_LABELS[src] || src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return `<span>${label}: <strong>#${rank}</strong></span>`
  }).join('')

  const tiles = statTilesCurrent(prospect)

  // ESPN grade — small corner mark when present
  const espnTag = prospect.espnGrade
    ? `<span style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-faint);">ESPN <strong style="color:var(--brass);font-weight:700;">${prospect.espnGrade}</strong></span>`
    : ''

  return `
    <div class="prospect-card${featured} ${isExpanded ? 'border-blue-600' : ''}"
         style="--team:${teamCol};" data-id="${prospect.id}">
      <div class="alm-stripe" aria-hidden="true"></div>

      <div class="card-header" data-id="${prospect.id}">
        <span class="alm-rank">${padRank(prospect.consensusRank)}</span>

        <div class="alm-side">
          ${headshotUrl ? `<img src="${headshotUrl}" class="alm-headshot" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <button class="star-btn" data-id="${prospect.id}" data-on="${isStarred ? '1' : '0'}" title="${isStarred ? 'Remove from watchlist' : 'Add to watchlist'}">★</button>
          <button class="share-btn" data-id="${prospect.id}" title="Copy link">⎘</button>
          <span class="card-chevron" data-id="${prospect.id}">${isExpanded ? '▲' : '▼'}</span>
        </div>

        <div class="alm-name">
          ${first ? `<span class="alm-first">${first}</span>` : ''}
          <span class="alm-last">${last || prospect.name}</span>
        </div>

        <div class="alm-meta">
          <span class="alm-pos">${prospect.position}</span>
          <span class="school-filter-btn" data-school="${prospect.school}" title="Show all ${prospect.school} prospects">${prospect.school}</span>
          ${prospect.classYear && prospect.classYear !== '-' ? `<span class="sep">·</span><span>${prospect.classYear}</span>` : ''}
          ${draftedBadge ? `<span style="margin-left:auto;">${draftedBadge}${postDraftPickBadge}</span>` : moverBadge ? `<span style="margin-left:auto;">${moverBadge}</span>` : ''}
        </div>

        ${renderStatTiles(tiles)}

        <div class="alm-row">
          ${trendBlock}
          <span style="display:flex;align-items:center;gap:8px;">
            <span>Sources</span>
            ${sourceDots(prospect)}
            ${espnTag}
          </span>
        </div>

        <div class="alm-row">
          ${pickInfoLine}
        </div>

        ${srcLine ? `<div class="alm-srcline">${srcLine}</div>` : ''}
        ${renderSpreadBar(prospect)}
      </div>

      <div class="card-detail ${isExpanded ? '' : 'hidden'}" data-id="${prospect.id}">
        <div class="flex border-b overflow-x-auto" style="border-color:var(--rule-soft);">
          <button class="detail-tab flex-1 px-3 py-2 border-b-2 border-blue-500" data-tab="ranking" data-card="${prospect.id}">Rankings</button>
          <button class="detail-tab flex-1 px-3 py-2 border-b-2 border-transparent" data-tab="stats" data-card="${prospect.id}">Stats</button>
          <button class="detail-tab flex-1 px-3 py-2 border-b-2 border-transparent" data-tab="combine" data-card="${prospect.id}">Combine</button>
          <button class="detail-tab flex-1 px-3 py-2 border-b-2 border-transparent" data-tab="news" data-card="${prospect.id}">From the Wire</button>
        </div>
        <div class="p-4">
          <div class="tab-content" data-tab="ranking" data-card="${prospect.id}">
            ${renderSourceRankings(prospect)}
            <div style="height:160px; position:relative; margin-top:14px;">
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

// ─── Event wiring (unchanged behavior) ───────────────────────

export function wireCardEvents(container) {
  container.addEventListener('click', e => {
    const schoolBtn = e.target.closest('.school-filter-btn')
    if (schoolBtn) {
      e.stopPropagation()
      const { filters } = getState()
      const school = schoolBtn.dataset.school
      setState({ filters: { ...filters, search: filters.search === school ? '' : school }, expandedCardId: null })
      return
    }

    const teamBtn = e.target.closest('.team-filter-btn')
    if (teamBtn) {
      e.stopPropagation()
      const { filters } = getState()
      const team = teamBtn.dataset.team
      setState({ filters: { ...filters, search: filters.search === team ? '' : team }, expandedCardId: null })
      return
    }

    const starBtn = e.target.closest('.star-btn')
    if (starBtn) {
      e.stopPropagation()
      const id = starBtn.dataset.id
      const { watchlist } = getState()
      const next = watchlist.includes(id) ? watchlist.filter(x => x !== id) : [...watchlist, id]
      setState({ watchlist: next })
      return
    }

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

  if (state.expandedCardId) {
    destroyChart(`chart-${state.expandedCardId}`)
  }

  if (wasExpanded) {
    setState({ expandedCardId: null })
    collapseCardDOM(id)
  } else {
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
  if (card) card.classList.add('border-blue-600')
  if (chevron) chevron.textContent = '▲'

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

  const prospect = findProspectById(id)
  if (prospect && prospect.rankHistory) {
    setTimeout(() => renderRankingChart(`chart-${id}`, prospect.rankHistory), 60)
  }

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
  if (card) card.classList.remove('border-blue-600')
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
