/** UX-57: first-week chip dismissal follows userData (localStorage in Electron). */

export const FIRST_WEEK_DISMISS_KEY = 'aiss.prefs.firstWeekTipsDismissed'

export function loadFirstWeekDismissed(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  try {
    return store.getItem(FIRST_WEEK_DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveFirstWeekDismissed(dismissed: boolean, store: Pick<Storage, 'setItem' | 'removeItem'> = globalThis.localStorage): void {
  if (dismissed) store.setItem(FIRST_WEEK_DISMISS_KEY, 'true')
  else store.removeItem(FIRST_WEEK_DISMISS_KEY)
}

/** 1024 uses a full-width bottom bar; wider windows use the bottom-right card. */
export function chipPlacement(width: number): 'corner' | 'bar' {
  return width <= 1024 ? 'bar' : 'corner'
}
