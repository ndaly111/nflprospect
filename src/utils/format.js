export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function timeAgo(iso) {
  if (!iso) return 'Unknown'
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function trendArrow(rankHistory, days = 30) {
  if (!rankHistory || rankHistory.length < 2) return { arrow: '—', cls: 'trend-stable', delta: 0 }
  const sorted = [...rankHistory].sort((a, b) => new Date(a.date) - new Date(b.date))
  const now = sorted[sorted.length - 1]
  const cutoff = new Date(now.date)
  cutoff.setDate(cutoff.getDate() - days)
  // Fall back to oldest available entry if no point is 30+ days old
  const old = sorted.filter(r => new Date(r.date) <= cutoff).pop() || sorted[0]
  const diffDays = Math.round((new Date(now.date) - new Date(old.date)) / 86400000)
  if (diffDays === 0) return { arrow: '—', cls: 'trend-stable', delta: 0 }
  const label = diffDays >= 28 ? '30d' : `${diffDays}d`
  const delta = old.rank - now.rank // positive = risen (rank number went down)
  if (delta > 0) return { arrow: `↑ +${delta} (${label})`, cls: 'trend-up', delta }
  if (delta < 0) return { arrow: `↓ ${delta} (${label})`, cls: 'trend-down', delta }
  return { arrow: `— (${label})`, cls: 'trend-stable', delta: 0 }
}

export function formatStat(val, decimals = 0) {
  if (val === null || val === undefined) return '—'
  return typeof val === 'number' ? val.toFixed(decimals) : val
}

export function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}
