/** PF-1: first-run welcome is a center-pane card, not a second onboarding wizard. */

export const WELCOME_DISMISSED_KEY = 'aiss.prefs.welcomeDismissed'
export const WELCOME_COMPLETED_KEY = 'aiss.prefs.welcomeCompleted'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export type WelcomePrefs = {
  dismissed: boolean
  completed: boolean
}

function flag(store: Pick<Storage, 'getItem'>, key: string): boolean {
  try {
    return store.getItem(key) === '1'
  } catch {
    return false
  }
}

export function loadWelcomePrefs(store: Pick<Storage, 'getItem'> = globalThis.localStorage): WelcomePrefs {
  return {
    dismissed: flag(store, WELCOME_DISMISSED_KEY),
    completed: flag(store, WELCOME_COMPLETED_KEY)
  }
}

export function saveWelcomeDismissed(dismissed: boolean, store: Store = globalThis.localStorage): void {
  try {
    store.setItem(WELCOME_DISMISSED_KEY, dismissed ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

export function saveWelcomeCompleted(completed: boolean, store: Store = globalThis.localStorage): void {
  try {
    store.setItem(WELCOME_COMPLETED_KEY, completed ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

export function shouldShowWelcome(input: {
  hostCount: number
  dismissed: boolean
  completed: boolean
  /** V3 what's-new is on screen right now. */
  releaseNotesOpen: boolean
  /** What's-new already took this launch; welcome waits for the next cold start. */
  notesHeld: boolean
  /** Help → 重新欢迎. Does not delete hosts. */
  replay: boolean
  tourOpen?: boolean
  quickOpen?: boolean
}): boolean {
  if (input.releaseNotesOpen || input.tourOpen || input.quickOpen) return false
  if (input.replay) return true
  if (input.notesHeld || input.completed || input.dismissed || input.hostCount > 0) return false
  return true
}
