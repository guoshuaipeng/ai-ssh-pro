/** D3 / D4: fuzzy ranking for the Ctrl+R history picker and the Ctrl+P switcher; MRU helpers for Ctrl+Tab. */

export type Fuzzy = { score: number; indices: number[] }

/** Subsequence match (case-insensitive). Higher is better; contiguous runs, word starts and early hits score more. */
export function fuzzyMatch(text: string, query: string): Fuzzy | null {
  const q = query.trim().toLowerCase()
  if (!q) return { score: 0, indices: [] }
  const t = text.toLowerCase()
  const sub = t.indexOf(q)
  if (sub >= 0) {
    const indices = Array.from({ length: q.length }, (_, i) => sub + i)
    const wordStart = sub === 0 || /[\s/._:@-]/.test(t[sub - 1]!)
    return { score: 1000 - sub + (wordStart ? 200 : 0) + q.length * 10, indices }
  }
  const indices: number[] = []
  let score = 0
  let prev = -2
  let ti = 0
  for (const ch of q) {
    if (ch === ' ') continue
    const at = t.indexOf(ch, ti)
    if (at < 0) return null
    score += at === prev + 1 ? 15 : 1
    if (at === 0 || /[\s/._:@-]/.test(t[at - 1]!)) score += 8
    indices.push(at)
    prev = at
    ti = at + 1
  }
  return { score: score - indices[0]! * 0.5, indices }
}

export type PickItem = {
  id: string
  kind: 'history' | 'snippet' | 'tab' | 'host'
  label: string
  detail?: string
  badge?: 'host' | 'common' | 'snippet' | 'connected' | 'disconnected' | 'current'
  /** D22: last run failed with this code */
  failed?: number
  /** D31: directory of the latest run */
  cwd?: string
  value: string
  indices: number[]
}

/** Ctrl+R: this host's history first, then other hosts, then single-line snippets. Empty query → most recent. */
/** D38: remembered Ctrl+R scope */
export const HISTORY_HOST_ONLY_KEY = 'aiss.qp.hostOnly'
export function loadHostOnly(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  try {
    return store.getItem(HISTORY_HOST_ONLY_KEY) === '1'
  } catch {
    return false
  }
}
export function saveHostOnly(on: boolean, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  try {
    store.setItem(HISTORY_HOST_ONLY_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function rankHistoryPick(input: {
  query: string
  hostKey: string
  entries: { command: string; hostKey: string; count: number; lastUsed: number; lastExit?: number; lastCwd?: string }[]
  snippets?: { id: string; title: string; body: string }[]
  limit?: number
  /** D38: only this host's history (no other hosts, no snippets). Ignored without a hostKey. */
  hostOnly?: boolean
  /** D50: this host's commands last run in this folder rank first within the host tier */
  cwd?: string | null
}): PickItem[] {
  const limit = input.limit ?? 50
  const hostOnly = Boolean(input.hostOnly && input.hostKey)
  const seen = new Map<string, { item: PickItem; score: number; tier: number; recency: number; here?: boolean }>()
  for (const e of input.entries) {
    const cmd = String(e.command ?? '').trim()
    if (!cmd) continue
    const m = fuzzyMatch(cmd, input.query)
    if (!m) continue
    const hostHit = Boolean(input.hostKey) && e.hostKey === input.hostKey
    if (hostOnly && !hostHit) continue
    const tier = hostHit ? 0 : 1
    const prev = seen.get(cmd)
    if (prev && prev.tier <= tier) {
      prev.recency = Math.max(prev.recency, e.lastUsed || 0)
      continue
    }
    seen.set(cmd, {
      item: { id: `h:${cmd}`, kind: 'history', label: cmd, badge: hostHit ? 'host' : 'common', value: cmd, indices: m.indices, ...(typeof e.lastExit === 'number' && e.lastExit !== 0 ? { failed: e.lastExit } : {}), ...(e.lastCwd ? { cwd: e.lastCwd } : {}) },
      // D22: a command that last failed ranks a little lower among equals
      score: m.score + Math.min(50, (e.count || 1) * 2) - (typeof e.lastExit === 'number' && e.lastExit !== 0 ? 30 : 0),
      tier,
      recency: e.lastUsed || 0,
      here: hostHit && Boolean(input.cwd) && e.lastCwd === input.cwd
    })
  }
  for (const s of hostOnly ? [] : input.snippets ?? []) {
    const body = String(s.body ?? '').trim()
    if (!body || body.includes('\n') || seen.has(body)) continue
    const m = fuzzyMatch(body, input.query) ?? (fuzzyMatch(s.title || '', input.query) ? { score: 1, indices: [] } : null)
    if (!m) continue
    seen.set(body, {
      item: { id: `s:${s.id}`, kind: 'snippet', label: body, detail: s.title, badge: 'snippet', value: body, indices: m.indices },
      score: m.score,
      tier: 2,
      recency: 0
    })
  }
  const empty = !input.query.trim()
  return [...seen.values()]
    .sort((a, b) => a.tier - b.tier || (empty ? Number(Boolean(b.here)) - Number(Boolean(a.here)) || b.recency - a.recency : b.score + (b.here ? 20 : 0) - a.score - (a.here ? 20 : 0) || b.recency - a.recency))
    .slice(0, limit)
    .map((x) => x.item)
}

/** Ctrl+P: open tabs (MRU order, current last) then saved hosts. */
export function rankSwitchPick(input: {
  query: string
  tabs: { tabId: string; title: string; detail?: string; connected: boolean }[]
  mru: string[]
  currentTabId: string | null
  hosts: { id: string; label: string; detail?: string }[]
  limit?: number
}): PickItem[] {
  const order = mruOrder(input.mru, input.tabs.map((t) => t.tabId))
  const rank = (id: string) => (id === input.currentTabId ? 1e6 : order.indexOf(id))
  const empty = !input.query.trim()
  const tabs = input.tabs
    .map((t) => ({ t, m: fuzzyMatch(`${t.title} ${t.detail ?? ''}`, input.query) }))
    .filter((x) => x.m)
    .sort((a, b) => (empty ? rank(a.t.tabId) - rank(b.t.tabId) : b.m!.score - a.m!.score || rank(a.t.tabId) - rank(b.t.tabId)))
    .map(({ t, m }) => ({
      id: `t:${t.tabId}`,
      kind: 'tab' as const,
      label: t.title,
      detail: t.detail,
      badge: (t.tabId === input.currentTabId ? 'current' : t.connected ? 'connected' : 'disconnected') as PickItem['badge'],
      value: t.tabId,
      indices: m!.indices.filter((i) => i < t.title.length)
    }))
  const hosts = input.hosts
    .map((h) => ({ h, m: fuzzyMatch(`${h.label} ${h.detail ?? ''}`, input.query) }))
    .filter((x) => x.m)
    .sort((a, b) => (empty ? 0 : b.m!.score - a.m!.score))
    .map(({ h, m }) => ({
      id: `p:${h.id}`,
      kind: 'host' as const,
      label: h.label,
      detail: h.detail,
      value: h.id,
      indices: m!.indices.filter((i) => i < h.label.length)
    }))
  return [...tabs, ...hosts].slice(0, input.limit ?? 40)
}

/** Move `id` to the front of the MRU list. */
export function mruTouch(mru: string[], id: string, cap = 50): string[] {
  return [id, ...mru.filter((x) => x !== id)].slice(0, cap)
}

/** Existing ids in MRU order; tabs never activated keep their tab order at the end. */
export function mruOrder(mru: string[], ids: string[]): string[] {
  const set = new Set(ids)
  const head = mru.filter((x) => set.has(x))
  return [...head, ...ids.filter((x) => !head.includes(x))]
}

/** Split a label into plain / matched runs for highlighting. */
export function highlightRuns(label: string, indices: number[]): { text: string; hit: boolean }[] {
  const hit = new Set(indices)
  const out: { text: string; hit: boolean }[] = []
  for (let i = 0; i < label.length; i++) {
    const h = hit.has(i)
    const last = out[out.length - 1]
    if (last && last.hit === h) last.text += label[i]
    else out.push({ text: label[i]!, hit: h })
  }
  return out
}
