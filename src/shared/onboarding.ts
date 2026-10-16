/** UX-60: a new profile gets a 3-step start. Upgrades do not. */

export const QUICK_DONE_KEY = 'aiss.prefs.onboarding.quickDone'
export const FRESH_PROFILE_KEY = 'aiss.prefs.onboarding.fresh'
export const QUICK_STEPS = 3

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadQuickDone(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  try {
    return store.getItem(QUICK_DONE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveQuickDone(done: boolean, store: Store = globalThis.localStorage): void {
  store.setItem(QUICK_DONE_KEY, done ? '1' : '0')
}

export function loadFreshProfile(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  try {
    return store.getItem(FRESH_PROFILE_KEY) === '1'
  } catch {
    return false
  }
}

/** Call once at launch, before lastSeenVersion is overwritten. */
export function noteInstall(hadPreviousVersion: boolean, store: Store = globalThis.localStorage): void {
  if (hadPreviousVersion || loadQuickDone(store)) return
  if (store.getItem(FRESH_PROFILE_KEY) == null) store.setItem(FRESH_PROFILE_KEY, '1')
}

export function decideQuickStart(input: {
  fresh: boolean
  quickDone: boolean
  hostCount: number
  whatsNewOpen: boolean
}): { show: boolean; resume: boolean; steps: number } {
  if (!input.fresh || input.quickDone || input.whatsNewOpen) return { show: false, resume: false, steps: QUICK_STEPS }
  return { show: true, resume: input.hostCount > 0, steps: QUICK_STEPS }
}
