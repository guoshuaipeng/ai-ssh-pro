export const HISTORY_CHANGED_EVENT = 'aiss-history-changed'
export const RECENT_CHANGED_EVENT = 'aiss-recent-changed'

export function notifyHistoryChanged(): void {
  window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
}

export function notifyRecentChanged(): void {
  window.dispatchEvent(new Event(RECENT_CHANGED_EVENT))
}
