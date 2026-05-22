import Store from 'electron-store'

/** 可持久化的会话记忆（OpenClaw 会话存储的轻量对标） */
export type PersistedCoreSession = {
  notes: string[]
  recentCommands: string[]
  observations: string[]
  taskSummaries: string[]
  updatedAt: number
}

type CoreMemorySchema = {
  sessions: Record<string, PersistedCoreSession>
}

const memoryStore = new Store<CoreMemorySchema>({
  name: 'core-a-sessions',
  defaults: { sessions: {} }
})

const MAX_SESSIONS = 80

export function loadPersistedCoreSession(sessionKey: string): PersistedCoreSession | null {
  const key = sessionKey.trim() || 'global'
  const row = memoryStore.get('sessions')[key]
  if (!row || typeof row !== 'object') return null
  return {
    notes: Array.isArray(row.notes) ? row.notes.filter((n) => typeof n === 'string').slice(-8) : [],
    recentCommands: Array.isArray(row.recentCommands) ?
      row.recentCommands.filter((c) => typeof c === 'string').slice(-6)
    : [],
    observations: Array.isArray(row.observations) ?
      row.observations.filter((o) => typeof o === 'string').slice(-10)
    : [],
    taskSummaries: Array.isArray(row.taskSummaries) ?
      row.taskSummaries.filter((t) => typeof t === 'string').slice(-6)
    : [],
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0
  }
}

export function savePersistedCoreSession(
  sessionKey: string,
  data: {
    notes: string[]
    recentCommands: string[]
    observations: string[]
    taskGraph: Array<{ title: string; status: string }>
  }
): void {
  const key = sessionKey.trim() || 'global'
  const sessions = { ...memoryStore.get('sessions') }
  sessions[key] = {
    notes: data.notes.slice(-8),
    recentCommands: data.recentCommands.slice(-6),
    observations: data.observations.slice(-10),
    taskSummaries: data.taskGraph.slice(-6).map((t) => `[${t.status}] ${t.title}`),
    updatedAt: Date.now()
  }

  const keys = Object.keys(sessions)
  if (keys.length > MAX_SESSIONS) {
    const sorted = keys.sort((a, b) => (sessions[a]?.updatedAt ?? 0) - (sessions[b]?.updatedAt ?? 0))
    for (const k of sorted.slice(0, keys.length - MAX_SESSIONS)) {
      delete sessions[k]
    }
  }

  memoryStore.set('sessions', sessions)
}
