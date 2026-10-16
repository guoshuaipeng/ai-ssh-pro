/** W7: five-step closed loop for one alert. Navigation only. */

export const LOOP_PREFS_KEY = 'aiss.prefs.alert.loop'
export const LOOP_STATE_KEY = 'aiss.alert.loop.v1'

export const LOOP_STEPS = ['alert', 'locate', 'ai', 'playbook', 'diff'] as const
export type LoopStep = (typeof LOOP_STEPS)[number]

export type LoopProgress = {
  locate: boolean
  ai: boolean
  playbook: boolean
  diff: boolean
}

export type LoopClick =
  | { action: 'focus-alert' }
  | { action: 'locate' }
  | { action: 'ai' }
  | { action: 'need-ai' }
  | { action: 'playbook-toast' }
  | { action: 'playbook-focus' }
  | { action: 'playbook-generate' }
  | { action: 'diff-toast' }
  | { action: 'diff-open' }

type Store = Pick<Storage, 'getItem' | 'setItem'>

const EMPTY: LoopProgress = { locate: false, ai: false, playbook: false, diff: false }

export function loadLoopPrefs(store: Pick<Storage, 'getItem'> = globalThis.localStorage): { show: boolean } {
  try {
    const raw = store.getItem(LOOP_PREFS_KEY)
    if (!raw) return { show: true }
    const parsed = JSON.parse(raw) as { show?: boolean }
    return { show: parsed.show !== false }
  } catch {
    return { show: true }
  }
}

export function saveLoopPrefs(show: boolean, store: Store = globalThis.localStorage): void {
  store.setItem(LOOP_PREFS_KEY, JSON.stringify({ show }))
}

function loadBag(store: Pick<Storage, 'getItem'>): Record<string, LoopProgress> {
  try {
    const raw = store.getItem(LOOP_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, LoopProgress>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function loadLoop(alertId: string, store: Pick<Storage, 'getItem'> = globalThis.localStorage): LoopProgress {
  const row = loadBag(store)[alertId]
  if (!row) return { ...EMPTY }
  return {
    locate: Boolean(row.locate),
    ai: Boolean(row.ai),
    playbook: Boolean(row.playbook),
    diff: Boolean(row.diff)
  }
}

export function saveLoop(alertId: string, progress: LoopProgress, store: Store = globalThis.localStorage): void {
  const bag = loadBag(store)
  bag[alertId] = progress
  store.setItem(LOOP_STATE_KEY, JSON.stringify(bag))
}

export function deriveProgress(events: Array<{ kind: string }>, stored?: Partial<LoopProgress> | null): LoopProgress {
  return {
    locate: Boolean(stored?.locate) || events.some((e) => e.kind === 'alert.locate'),
    ai: Boolean(stored?.ai) || events.some((e) => e.kind === 'ai.explain'),
    playbook: Boolean(stored?.playbook) || events.some((e) => e.kind === 'playbook.draft' || e.kind === 'playbook.run' || e.kind === 'playbook.dryrun'),
    diff: Boolean(stored?.diff) || events.some((e) => e.kind === 'file.save' || e.kind === 'file.sync' || e.kind === 'file.rollback')
  }
}

export function markLoop(alertId: string, step: Exclude<LoopStep, 'alert'>, store: Store = globalThis.localStorage): LoopProgress {
  const cur = loadLoop(alertId, store)
  const next = { ...cur, [step]: true }
  saveLoop(alertId, next, store)
  return next
}

export type LoopVisual = { step: LoopStep; done: boolean; current: boolean }

/** Alert is done on entry. Current step is the first incomplete one. */
export function loopVisual(progress: LoopProgress): LoopVisual[] {
  const done: Record<LoopStep, boolean> = {
    alert: true,
    locate: progress.locate,
    ai: progress.ai,
    playbook: progress.playbook,
    diff: progress.diff
  }
  const current = LOOP_STEPS.find((s) => !done[s]) ?? 'diff'
  return LOOP_STEPS.map((step) => ({ step, done: done[step], current: step === current }))
}

export function clickLoop(
  step: LoopStep,
  progress: LoopProgress,
  opts: { aiConfigured: boolean; hasDraft: boolean }
): LoopClick {
  if (step === 'alert') return { action: 'focus-alert' }
  if (step === 'locate') return { action: 'locate' }
  if (step === 'ai') return opts.aiConfigured ? { action: 'ai' } : { action: 'need-ai' }
  if (step === 'playbook') {
    if (progress.playbook || opts.hasDraft) return { action: 'playbook-focus' }
    if (!progress.ai) return { action: 'playbook-toast' }
    return { action: 'playbook-generate' }
  }
  if (!progress.diff) return { action: 'diff-toast' }
  return { action: 'diff-open' }
}
