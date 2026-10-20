/**
 * M23: AI conversations are bound to the terminal tab. Two tabs on one host are two
 * conversations (#1, #2 …). Saved hosts group by profile id; unsaved hosts by hostname:port.
 * The first conversation keeps the bare group key so existing history carries over.
 */
import type { AiChatMessage } from './ipc'

export const GENERAL_CONVERSATION_KEY = '__general__'
export const ARCHIVE_PER_GROUP = 20
export const ARCHIVE_TOTAL = 200

export function conversationGroup(tab: { profileId?: string | null; host?: string | null; port?: number | null }): string {
  const pid = tab.profileId?.trim()
  if (pid) return pid
  const host = tab.host?.trim() || 'local'
  return `${host}:${tab.port && tab.port > 0 ? tab.port : 22}`
}

export function conversationKey(group: string, n: number): string {
  return n <= 1 ? group : `${group}#${n}`
}

export function conversationLabel(host: string, n: number): string {
  return n <= 1 ? host : `${host} #${n}`
}

/**
 * Stable per-tab ordinals within a host group. A tab keeps its number for life; a new
 * tab takes the lowest number not in use by another open tab of the same host.
 */
export function assignConversationOrdinals(
  prev: Readonly<Record<string, number>>,
  tabs: ReadonlyArray<{ tabId: string; group: string }>
): Record<string, number> {
  const next: Record<string, number> = {}
  const used = new Map<string, Set<number>>()
  const take = (group: string) => {
    let set = used.get(group)
    if (!set) {
      set = new Set()
      used.set(group, set)
    }
    return set
  }
  for (const t of tabs) {
    const n = prev[t.tabId]
    if (n && !take(t.group).has(n)) {
      next[t.tabId] = n
      take(t.group).add(n)
    }
  }
  for (const t of tabs) {
    if (next[t.tabId]) continue
    const set = take(t.group)
    let n = 1
    while (set.has(n)) n += 1
    next[t.tabId] = n
    set.add(n)
  }
  return next
}

export type AiArchivedConversation = {
  id: string
  group: string
  hostLabel: string
  key: string
  title: string
  savedAt: number
  messages: AiChatMessage[]
}

export type AiArchiveSummary = Omit<AiArchivedConversation, 'messages'> & { count: number }

/** D29: newest archived conversation of this host group, if recent enough to offer "continue". */
export const RESUME_WINDOW_MS = 7 * 24 * 3600 * 1000
export function resumeCandidate<T extends { group: string; savedAt: number; count?: number }>(
  archives: ReadonlyArray<T>,
  group: string | null | undefined,
  now: number,
  windowMs = RESUME_WINDOW_MS
): T | null {
  if (!group || group === GENERAL_CONVERSATION_KEY) return null
  let best: T | null = null
  for (const a of archives) {
    if (a.group !== group || now - a.savedAt > windowMs || a.count === 0) continue
    if (!best || a.savedAt > best.savedAt) best = a
  }
  return best
}

/** Title for an archived conversation: the first user ask, trimmed. */
export function archiveTitle(messages: ReadonlyArray<AiChatMessage>): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim())
  const text = (first?.content ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 48 ? `${text.slice(0, 47)}…` : text
}

/** Newest first, capped per host group and overall. */
export function pushArchive(
  list: ReadonlyArray<AiArchivedConversation>,
  entry: AiArchivedConversation
): AiArchivedConversation[] {
  const out = [entry, ...list.filter((e) => e.id !== entry.id)].sort((a, b) => b.savedAt - a.savedAt)
  const perGroup = new Map<string, number>()
  return out
    .filter((e) => {
      const n = (perGroup.get(e.group) ?? 0) + 1
      perGroup.set(e.group, n)
      return n <= ARCHIVE_PER_GROUP
    })
    .slice(0, ARCHIVE_TOTAL)
}

/** History list grouped by host; the current host's group first. */
export function groupArchives(
  list: ReadonlyArray<AiArchiveSummary>,
  currentGroup: string | null
): Array<{ group: string; hostLabel: string; items: AiArchiveSummary[] }> {
  const groups = new Map<string, { group: string; hostLabel: string; items: AiArchiveSummary[] }>()
  for (const e of list) {
    const g = groups.get(e.group) ?? { group: e.group, hostLabel: e.hostLabel || e.group, items: [] }
    g.items.push(e)
    groups.set(e.group, g)
  }
  const rows = [...groups.values()]
  rows.forEach((g) => g.items.sort((a, b) => b.savedAt - a.savedAt))
  rows.sort((a, b) => {
    if (a.group === currentGroup) return -1
    if (b.group === currentGroup) return 1
    return (b.items[0]?.savedAt ?? 0) - (a.items[0]?.savedAt ?? 0)
  })
  return rows
}
