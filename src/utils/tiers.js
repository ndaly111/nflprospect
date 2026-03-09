export const TIERS     = ['Elite', 'Starter', 'Backup', 'Bust']
export const TIER_ORDER = { Elite: 0, Starter: 1, Backup: 2, Bust: 3 }
export const TIER_POINTS = { Elite: 3, Starter: 2, Backup: 1, Bust: 0 }

export const TIER_COLORS = {
  Elite:   { bg: 'bg-yellow-500/20', text: 'text-yellow-300', dot: 'bg-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
  Starter: { bg: 'bg-green-500/20',  text: 'text-green-300',  dot: 'bg-green-400',  badge: 'bg-green-500/20 text-green-300 border border-green-500/30'   },
  Backup:  { bg: 'bg-blue-500/20',   text: 'text-blue-300',   dot: 'bg-blue-400',   badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'      },
  Bust:    { bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400',    badge: 'bg-red-500/15 text-red-400 border border-red-500/30'         },
}

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'DL', 'LB', 'DB']

export const POS_COLORS = {
  QB: 'text-red-400 bg-red-900/30', RB: 'text-green-400 bg-green-900/30',
  WR: 'text-blue-400 bg-blue-900/30', TE: 'text-purple-400 bg-purple-900/30',
  OL: 'text-yellow-400 bg-yellow-900/30', DL: 'text-orange-400 bg-orange-900/30',
  EDGE: 'text-orange-400 bg-orange-900/30', LB: 'text-teal-400 bg-teal-900/30',
  DB: 'text-pink-400 bg-pink-900/30',
}

export const OFFENSE_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL']
export const DEFENSE_GROUPS = ['EDGE', 'DL', 'LB', 'DB']
