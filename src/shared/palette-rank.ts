/** UX-11b: palette categories, pinned frequent rows, and a stable order for “sync”. */

export const PALETTE_CATS = ['connection', 'session', 'ops', 'file', 'ai', 'view', 'settings', 'help'] as const

export type PaletteCat = (typeof PALETTE_CATS)[number]

const CAT: Record<string, PaletteCat> = {
  connection: 'connection',
  localShell: 'connection',
  newFolder: 'connection',
  importSessions: 'connection',
  exportOpenssh: 'connection',
  exportJson: 'connection',
  demoHost: 'connection',
  setJumpHosts: 'connection',
  checkCerts: 'connection',
  testJump: 'connection',
  reconnect: 'session',
  duplicateSession: 'session',
  toggleBroadcast: 'session',
  broadcastTargets: 'session',
  toggleRecording: 'session',
  sessionRecordings: 'session',
  toggleBlocks: 'session',
  toggleBlockStrip: 'session',
  portForward: 'session',
  opsHome: 'ops',
  refreshHomeHealth: 'ops',
  enableRuleTemplates: 'ops',
  retryFailedProbes: 'ops',
  exportPlaybookPack: 'ops',
  importPlaybookPack: 'ops',
  gateTimeline: 'ops',
  maintOpen: 'ops',
  maintEnd: 'ops',
  setDryRunReminder: 'ops',
  aiPostmortem: 'ai',
  explainDiff: 'file',
  diffFixPlaybook: 'ai',
  alertWorkbench: 'ops',
  alertRules: 'ops',
  alertHistory: 'ops',
  auditLog: 'ops',
  playbooks: 'ops',
  runPlaybook: 'ops',
  fixPlaybook: 'ai',
  dryRunPlaybook: 'ops',
  exportPostmortem: 'ops',
  resourceMonitor: 'ops',
  dashboard: 'ops',
  serverTools: 'ops',
  refreshDocker: 'ops',
  openDocker: 'ops',
  batchExec: 'ops',
  inventory: 'ops',
  openProdGuard: 'ops',
  snippets: 'session',
  sftp: 'file',
  folderSync: 'file',
  cloudSync: 'file',
  syncNow: 'file',
  syncConflicts: 'file',
  syncPreview: 'file',
  fileSnapshots: 'file',
  openAi: 'ai',
  aiExplainError: 'ai',
  aiCommand: 'ai',
  aiInspect: 'ai',
  ai: 'ai',
  mcpGuide: 'ai',
  debug: 'ai',
  toggleSidebar: 'view',
  toggleMain: 'view',
  toggleAi: 'view',
  toggleSplit: 'view',
  toggleHostStatus: 'view',
  uiTheme: 'view',
  terminalPrefs: 'view',
  commandPalette: 'view',
  switchTab: 'view',
  toggleLanguage: 'view',
  sftpComfort: 'view',
  smartComplete: 'view',
  settings: 'settings',
  startupSettings: 'settings',
  updateChannel: 'settings',
  clearHostHistory: 'settings',
  backup: 'settings',
  shortcuts: 'help',
  tour: 'help',
  quickStart: 'help',
  taskCards: 'help',
  whatsNew: 'help',
  checkUpdate: 'help',
  github: 'help',
  about: 'help',
  quit: 'help'
}

export function paletteCategory(id: string): PaletteCat {
  return CAT[id] ?? 'help'
}

/** Stable rank when the query is the word “sync”. */
export const SYNC_RANK: Record<string, number> = {
  cloudSync: 0,
  syncNow: 1,
  syncConflicts: 2,
  folderSync: 3,
  syncPreview: 4
}

export type Usage = Record<string, { count: number; last: number }>

export function bumpUsage(usage: Usage, id: string, now = Date.now()): Usage {
  const prev = usage[id]
  return { ...usage, [id]: { count: (prev?.count ?? 0) + 1, last: now } }
}

/** PNG-3: after 3 recorded uses, only commands used at least 3 times stay pinned. Earlier history still pins. */
export const PALETTE_PIN_MIN = 3

export function historyUses(usage: Usage): number {
  return Object.values(usage).reduce((n, v) => n + (v && v.count > 0 ? v.count : 0), 0)
}

export function pinnedIds(usage: Usage, limit = 5): string[] {
  const rows = Object.entries(usage).filter(([, v]) => v && v.count > 0)
  const matured = historyUses(usage) >= PALETTE_PIN_MIN
  const pool = matured ? rows.filter(([, v]) => v.count >= PALETTE_PIN_MIN) : rows
  return pool
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id)
}

export type RankRow<T> = { kind: 'header'; id: string } | { kind: 'item'; item: T }

export function layoutPalette<T extends { id: string; label: string; hay: string; order: number; category?: PaletteCat }>(
  entries: T[],
  query: string,
  usage: Usage = {}
): { rows: RankRow<T>[]; items: T[] } {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const withCat = entries.map((e) => ({ ...e, category: e.category ?? paletteCategory(e.id) }))
  if (!words.length) {
    const pin = new Set(pinnedIds(usage))
    const pinned = withCat.filter((e) => pin.has(e.id))
    const rows: RankRow<T>[] = []
    const items: T[] = []
    if (pinned.length) {
      rows.push({ kind: 'header', id: 'pinned' })
      for (const item of pinned) {
        rows.push({ kind: 'item', item })
        items.push(item)
      }
    }
    for (const cat of PALETTE_CATS) {
      const group = withCat.filter((e) => e.category === cat).sort((a, b) => a.order - b.order)
      if (!group.length) continue
      rows.push({ kind: 'header', id: cat })
      for (const item of group) {
        rows.push({ kind: 'item', item })
        items.push(item)
      }
    }
    return { rows, items }
  }
  const syncQuery = words.length === 1 && words[0] === 'sync'
  const hits = withCat.filter((e) => words.every((w) => e.hay.includes(w)))
  const pins = new Set(pinnedIds(usage))
  hits.sort((a, b) => {
    if (syncQuery) {
      const ar = SYNC_RANK[a.id] ?? 50
      const br = SYNC_RANK[b.id] ?? 50
      if (ar !== br) return ar - br
    }
    const as = a.label.toLowerCase().startsWith(words[0]!) ? 0 : 1
    const bs = b.label.toLowerCase().startsWith(words[0]!) ? 0 : 1
    if (as !== bs) return as - bs
    const ap = pins.has(a.id) ? 0 : 1
    const bp = pins.has(b.id) ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.order - b.order
  })
  return { rows: hits.map((item) => ({ kind: 'item', item })), items: hits }
}
