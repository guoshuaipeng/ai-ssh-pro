/** W6: dry-run reminders. Notify and badge only. Never dry-runs or runs a playbook. */

export const REMINDER_LS_KEY = 'aiss.playbook.reminders.v1'

export const REMINDER_CADENCES = ['off', 'weekly', 'biweekly', 'monthly'] as const
export type ReminderCadence = (typeof REMINDER_CADENCES)[number]

const PERIOD_MS: Record<Exclude<ReminderCadence, 'off'>, number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  biweekly: 14 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
}

export type PlaybookReminder = {
  playbookId: string
  cadence: ReminderCadence
  nextDueAt: number | null
  lastDryRunAt?: number
  /** Local calendar day of the last desktop notice. One notice per playbook per day. */
  lastNotifiedDay?: string
}

export type ReminderNotice = {
  playbookIds: string[]
  names: string[]
  /** No command, no dry-run. Clicking focuses the dry-run button. */
  focus: 'dry-run'
  executes: false
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function periodMs(cadence: ReminderCadence): number {
  if (cadence === 'off') return 0
  return PERIOD_MS[cadence]
}

export function loadReminders(store: Pick<Storage, 'getItem'> = globalThis.localStorage): PlaybookReminder[] {
  try {
    const raw = store.getItem(REMINDER_LS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as PlaybookReminder[]
    return Array.isArray(list) ? list.map(normalize).filter((r): r is PlaybookReminder => Boolean(r)) : []
  } catch {
    return []
  }
}

function save(list: PlaybookReminder[], store: Store): void {
  store.setItem(REMINDER_LS_KEY, JSON.stringify(list))
}

function normalize(raw: unknown): PlaybookReminder | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<PlaybookReminder>
  if (typeof o.playbookId !== 'string' || !o.playbookId) return null
  const cadence: ReminderCadence = REMINDER_CADENCES.includes(o.cadence as ReminderCadence) ? (o.cadence as ReminderCadence) : 'off'
  return {
    playbookId: o.playbookId,
    cadence,
    nextDueAt: cadence === 'off' ? null : typeof o.nextDueAt === 'number' ? o.nextDueAt : null,
    lastDryRunAt: typeof o.lastDryRunAt === 'number' ? o.lastDryRunAt : undefined,
    lastNotifiedDay: typeof o.lastNotifiedDay === 'string' ? o.lastNotifiedDay : undefined
  }
}

function dayKey(now: number): string {
  const d = new Date(now)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function reminderFor(list: PlaybookReminder[], playbookId: string): PlaybookReminder {
  return list.find((r) => r.playbookId === playbookId) ?? { playbookId, cadence: 'off', nextDueAt: null }
}

export function isDue(reminder: PlaybookReminder, now = Date.now()): boolean {
  return reminder.cadence !== 'off' && reminder.nextDueAt != null && now >= reminder.nextDueAt
}

export function setCadence(
  list: PlaybookReminder[],
  playbookId: string,
  cadence: ReminderCadence,
  now = Date.now(),
  lastDryRunAt?: number
): PlaybookReminder[] {
  const prev = reminderFor(list, playbookId)
  const base = lastDryRunAt ?? prev.lastDryRunAt ?? now
  const next: PlaybookReminder = {
    playbookId,
    cadence,
    nextDueAt: cadence === 'off' ? null : base + periodMs(cadence),
    lastDryRunAt: lastDryRunAt ?? prev.lastDryRunAt,
    lastNotifiedDay: cadence === 'off' ? undefined : prev.lastNotifiedDay
  }
  return upsert(list, next)
}

export function snoozeReminder(list: PlaybookReminder[], playbookId: string, now = Date.now()): PlaybookReminder[] {
  const prev = reminderFor(list, playbookId)
  if (prev.cadence === 'off' || prev.nextDueAt == null) return list
  const next: PlaybookReminder = { ...prev, nextDueAt: prev.nextDueAt + periodMs(prev.cadence) }
  void now
  return upsert(list, next)
}

/** A finished dry-run clears the badge and rolls one cycle. It does not start another run. */
export function noteDryRun(list: PlaybookReminder[], playbookId: string, now = Date.now()): PlaybookReminder[] {
  const prev = reminderFor(list, playbookId)
  if (prev.cadence === 'off') return upsert(list, { ...prev, lastDryRunAt: now, nextDueAt: null })
  return upsert(list, {
    ...prev,
    lastDryRunAt: now,
    nextDueAt: now + periodMs(prev.cadence),
    lastNotifiedDay: undefined
  })
}

export function dueReminders(list: PlaybookReminder[], now = Date.now()): PlaybookReminder[] {
  return list.filter((r) => isDue(r, now))
}

/**
 * Desktop notices for playbooks that became due.
 * One combined notice. Each playbook is notified at most once per local day.
 * The result never includes a command.
 */
export function planReminderNotices(
  list: PlaybookReminder[],
  names: Record<string, string>,
  now = Date.now()
): { notices: ReminderNotice[]; next: PlaybookReminder[] } {
  const day = dayKey(now)
  const due = dueReminders(list, now).filter((r) => r.lastNotifiedDay !== day)
  if (!due.length) return { notices: [], next: list }
  const playbookIds = due.map((r) => r.playbookId)
  const notice: ReminderNotice = {
    playbookIds,
    names: playbookIds.map((id) => names[id] || id),
    focus: 'dry-run',
    executes: false
  }
  const marked = new Set(playbookIds)
  const next = list.map((r) => (marked.has(r.playbookId) ? { ...r, lastNotifiedDay: day } : r))
  return { notices: [notice], next }
}

export function saveReminders(list: PlaybookReminder[], store: Store = globalThis.localStorage): void {
  save(list, store)
}

function upsert(list: PlaybookReminder[], row: PlaybookReminder): PlaybookReminder[] {
  const i = list.findIndex((r) => r.playbookId === row.playbookId)
  if (i < 0) return [...list, row]
  const next = list.slice()
  next[i] = row
  return next
}

export function dropReminder(list: PlaybookReminder[], playbookId: string): PlaybookReminder[] {
  return list.filter((r) => r.playbookId !== playbookId)
}
