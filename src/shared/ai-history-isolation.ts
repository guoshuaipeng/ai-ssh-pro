/** H06: new-chat vs archive restore — live history isolation helpers (pure). */

export type IsoChatMessage = { role: string; content: string }

export type IsoArchive = {
  id: string
  key: string
  title: string
  messages: IsoChatMessage[]
  savedAt: number
}

export type HistoryIsoState = {
  /** Live transcripts keyed by historyKey / conversation key. */
  live: Record<string, IsoChatMessage[]>
  archives: IsoArchive[]
}

export function emptyHistoryIso(): HistoryIsoState {
  return { live: {}, archives: [] }
}

export function seedLive(state: HistoryIsoState, key: string, messages: IsoChatMessage[]): HistoryIsoState {
  const k = String(key ?? '').trim()
  if (!k) return state
  return { ...state, live: { ...state.live, [k]: messages.map((m) => ({ ...m })) } }
}

/** Title = first user ask (mirrors archiveTitle). */
export function isoArchiveTitle(messages: ReadonlyArray<IsoChatMessage>): string {
  const first = messages.find((m) => m.role === 'user' && String(m.content ?? '').trim())
  const text = String(first?.content ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 48 ? `${text.slice(0, 47)}…` : text
}

/**
 * New chat on `key`: archive current live (if any), clear live for that key.
 * Does not touch other keys — cross-key isolation.
 */
export function applyNewChat(
  state: HistoryIsoState,
  key: string,
  opts?: { id?: string; now?: number }
): HistoryIsoState {
  const k = String(key ?? '').trim()
  if (!k) return state
  const msgs = state.live[k] ?? []
  let archives = state.archives
  if (msgs.length) {
    const entry: IsoArchive = {
      id: opts?.id ?? `a-${(opts?.now ?? Date.now()).toString(36)}`,
      key: k,
      title: isoArchiveTitle(msgs) || 'untitled',
      messages: msgs.map((m) => ({ ...m })),
      savedAt: opts?.now ?? Date.now()
    }
    archives = [entry, ...archives.filter((a) => a.id !== entry.id)]
  }
  const live = { ...state.live }
  live[k] = []
  return { live, archives }
}

/** Restore archive into live `key` (optionally archiving current first). */
export function applyRestore(
  state: HistoryIsoState,
  key: string,
  archiveId: string,
  opts?: { archiveCurrent?: boolean; now?: number }
): HistoryIsoState {
  const k = String(key ?? '').trim()
  if (!k) return state
  let next = state
  if (opts?.archiveCurrent !== false) {
    next = applyNewChat(next, k, { now: opts?.now })
  }
  const hit = next.archives.find((a) => a.id === archiveId)
  if (!hit) return next
  const live = { ...next.live, [k]: hit.messages.map((m) => ({ ...m })) }
  const archives = next.archives.filter((a) => a.id !== archiveId)
  return { live, archives }
}

/** Messages that would be sent on the next ask (live + new user turn). */
export function buildRequestMessages(
  live: ReadonlyArray<IsoChatMessage>,
  newUserText: string
): IsoChatMessage[] {
  const text = String(newUserText ?? '').trim()
  const base = live
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
    .map((m) => ({ role: m.role, content: String(m.content ?? '') }))
  if (!text) return base
  return [...base, { role: 'user', content: text }]
}

/** Prompt-facing memory that must not answer old-session facts after new chat. */
export type PromptMemory = {
  observations: string[]
  recentCommands: string[]
  notes: string[]
}

export function emptyPromptMemory(): PromptMemory {
  return { observations: [], recentCommands: [], notes: [] }
}

/**
 * Mirror of archiveAndClearRecord for prompt isolation: drop observations /
 * recentCommands (facts); notes optional.
 */
export function clearPromptFacts(mem: PromptMemory, opts?: { keepNotes?: boolean }): PromptMemory {
  return {
    observations: [],
    recentCommands: [],
    notes: opts?.keepNotes === false ? [] : [...mem.notes]
  }
}

export function requestContains(msgs: ReadonlyArray<IsoChatMessage>, needle: string): boolean {
  const n = String(needle ?? '')
  if (!n) return false
  return msgs.some((m) => String(m.content ?? '').includes(n))
}

export function memoryContains(mem: PromptMemory, needle: string): boolean {
  const n = String(needle ?? '')
  if (!n) return false
  return (
    mem.observations.some((x) => x.includes(n)) ||
    mem.recentCommands.some((x) => x.includes(n)) ||
    mem.notes.some((x) => x.includes(n))
  )
}
