/** L2d: silence alert notifications for a host or tag window. Never runs a command. */

export const MAINT_LS_KEY = 'aiss.alert.maintenance.v1'
export const MAINT_PRESETS_H = [1, 2, 4, 8, 24] as const
export const MAINT_DEFAULT_H = 2
export const MAINT_MIN_H = 0.25
export const MAINT_MAX_H = 168
export const MAINT_SOON_MS = 5 * 60 * 1000

export type MaintenanceScope = 'hosts' | 'tags'
export type MaintenanceStatus = 'active' | 'ended' | 'expired'

export type MaintenanceWindow = {
  id: string
  scope: MaintenanceScope
  hostKeys: string[]
  tagIds: string[]
  durationMs: number
  startedAt: number
  endsAt: number
  status: MaintenanceStatus
  endedBy?: 'user' | 'auto'
  note?: string
}

export type MaintSubject = { keys: string[]; tags?: string[] }

type Store = Pick<Storage, 'getItem' | 'setItem'>

export type MaintEventKind = 'alert.maintenance.start' | 'alert.maintenance.end' | 'alert.maintenance.expire'

export type MaintRecord = {
  kind: MaintEventKind
  windowId: string
  detail: string
  /** Always null. Maintenance never carries a command. */
  command: null
  executes: false
}

function empty(): MaintenanceWindow[] {
  return []
}

export function loadMaintenance(store: Pick<Storage, 'getItem'> = globalThis.localStorage): MaintenanceWindow[] {
  try {
    const raw = store.getItem(MAINT_LS_KEY)
    if (!raw) return empty()
    const list = JSON.parse(raw) as MaintenanceWindow[]
    return Array.isArray(list) ? list.map(normalizeWindow).filter((w): w is MaintenanceWindow => Boolean(w)) : empty()
  } catch {
    return empty()
  }
}

function save(list: MaintenanceWindow[], store: Store): void {
  store.setItem(MAINT_LS_KEY, JSON.stringify(list))
}

function normalizeWindow(raw: unknown): MaintenanceWindow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<MaintenanceWindow>
  if (o.scope !== 'hosts' && o.scope !== 'tags') return null
  if (typeof o.id !== 'string' || !o.id) return null
  if (typeof o.startedAt !== 'number' || typeof o.endsAt !== 'number') return null
  const status: MaintenanceStatus = o.status === 'ended' || o.status === 'expired' ? o.status : 'active'
  return {
    id: o.id,
    scope: o.scope,
    hostKeys: Array.isArray(o.hostKeys) ? o.hostKeys.filter((k): k is string => typeof k === 'string' && k.length > 0) : [],
    tagIds: Array.isArray(o.tagIds) ? o.tagIds.filter((k): k is string => typeof k === 'string' && k.length > 0) : [],
    durationMs: typeof o.durationMs === 'number' ? o.durationMs : Math.max(0, o.endsAt - o.startedAt),
    startedAt: o.startedAt,
    endsAt: o.endsAt,
    status,
    endedBy: o.endedBy === 'user' || o.endedBy === 'auto' ? o.endedBy : undefined,
    note: typeof o.note === 'string' ? o.note.slice(0, 120) : undefined
  }
}

export function clampDurationHours(hours: number): number | null {
  if (!Number.isFinite(hours)) return null
  if (hours < MAINT_MIN_H || hours > MAINT_MAX_H) return null
  return hours
}

export function durationMsFromHours(hours: number): number | null {
  const h = clampDurationHours(hours)
  if (h == null) return null
  return Math.round(h * 60 * 60 * 1000)
}

export type StartInput = {
  scope: MaintenanceScope
  hostKeys?: string[]
  tagIds?: string[]
  hours: number
  note?: string
  now?: number
}

export function canStart(input: { scope: MaintenanceScope; hostKeys?: string[]; tagIds?: string[]; hours: number }): boolean {
  const hoursOk = durationMsFromHours(input.hours) != null
  if (!hoursOk) return false
  if (input.scope === 'hosts') return (input.hostKeys ?? []).some((k) => k.trim().length > 0)
  return (input.tagIds ?? []).some((k) => k.trim().length > 0)
}

export function startMaintenance(input: StartInput, store: Store = globalThis.localStorage): { ok: true; window: MaintenanceWindow; record: MaintRecord } | { ok: false; reason: 'empty' | 'range' } {
  if (!canStart(input)) {
    return { ok: false, reason: durationMsFromHours(input.hours) == null ? 'range' : 'empty' }
  }
  const ms = durationMsFromHours(input.hours)!
  const now = input.now ?? Date.now()
  const window: MaintenanceWindow = {
    id: `mw-${now}-${Math.random().toString(36).slice(2, 6)}`,
    scope: input.scope,
    hostKeys: input.scope === 'hosts' ? [...new Set((input.hostKeys ?? []).map((k) => k.trim()).filter(Boolean))] : [],
    tagIds: input.scope === 'tags' ? [...new Set((input.tagIds ?? []).map((k) => k.trim()).filter(Boolean))] : [],
    durationMs: ms,
    startedAt: now,
    endsAt: now + ms,
    status: 'active',
    note: (input.note ?? '').trim().slice(0, 120) || undefined
  }
  const list = loadMaintenance(store)
  list.push(window)
  save(list, store)
  return { ok: true, window, record: recordFor('alert.maintenance.start', window) }
}

export function endMaintenance(
  id: string,
  by: 'user' | 'auto',
  store: Store = globalThis.localStorage,
  now = Date.now()
): { window: MaintenanceWindow; record: MaintRecord } | null {
  const list = loadMaintenance(store)
  const hit = list.find((w) => w.id === id && w.status === 'active')
  if (!hit) return null
  hit.status = by === 'auto' ? 'expired' : 'ended'
  hit.endedBy = by
  hit.endsAt = Math.min(hit.endsAt, now)
  save(list, store)
  const kind: MaintEventKind = by === 'auto' ? 'alert.maintenance.expire' : 'alert.maintenance.end'
  return { window: hit, record: recordFor(kind, hit) }
}

export function expireDue(store: Store = globalThis.localStorage, now = Date.now()): MaintRecord[] {
  const list = loadMaintenance(store)
  const records: MaintRecord[] = []
  let dirty = false
  for (const w of list) {
    if (w.status === 'active' && w.endsAt <= now) {
      w.status = 'expired'
      w.endedBy = 'auto'
      records.push(recordFor('alert.maintenance.expire', w))
      dirty = true
    }
  }
  if (dirty) save(list, store)
  return records
}

export function activeWindows(list: MaintenanceWindow[], now = Date.now()): MaintenanceWindow[] {
  return list.filter((w) => w.status === 'active' && w.endsAt > now)
}

export function windowCovers(window: MaintenanceWindow, subject: MaintSubject, now = Date.now()): boolean {
  if (window.status !== 'active' || window.endsAt <= now) return false
  if (window.scope === 'hosts') {
    const want = new Set(window.hostKeys)
    return subject.keys.some((k) => want.has(k))
  }
  const tags = new Set(subject.tags ?? [])
  return window.tagIds.some((t) => tags.has(t))
}

/** Latest endsAt among overlapping windows. History rows stay. */
export function silenceUntil(list: MaintenanceWindow[], subject: MaintSubject, now = Date.now()): number | null {
  const hits = activeWindows(list, now).filter((w) => windowCovers(w, subject, now))
  if (!hits.length) return null
  return Math.max(...hits.map((w) => w.endsAt))
}

export function shouldNotify(list: MaintenanceWindow[], subject: MaintSubject, now = Date.now()): boolean {
  return silenceUntil(list, subject, now) == null
}

export function bellShouldFlash(subjects: MaintSubject[], list: MaintenanceWindow[], now = Date.now()): boolean {
  if (!subjects.length) return false
  return subjects.some((s) => shouldNotify(list, s, now))
}

export function matchCount(window: MaintenanceWindow, catalog: MaintSubject[]): number {
  return catalog.filter((s) => {
    if (window.scope === 'hosts') return s.keys.some((k) => window.hostKeys.includes(k))
    return window.tagIds.some((t) => (s.tags ?? []).includes(t))
  }).length
}

export function endingSoon(list: MaintenanceWindow[], now = Date.now(), within = MAINT_SOON_MS): MaintenanceWindow[] {
  return activeWindows(list, now).filter((w) => w.endsAt - now <= within && w.endsAt > now)
}

export function recordFor(kind: MaintEventKind, window: MaintenanceWindow): MaintRecord {
  const scope = window.scope === 'hosts' ? window.hostKeys.join(', ') : window.tagIds.join(', ')
  return {
    kind,
    windowId: window.id,
    detail: `${kind} ${scope}`.slice(0, 240),
    command: null,
    executes: false
  }
}

export function formatRemaining(ms: number): string {
  const left = Math.max(0, ms)
  const h = Math.floor(left / 3_600_000)
  const m = Math.max(0, Math.round((left % 3_600_000) / 60_000))
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}
