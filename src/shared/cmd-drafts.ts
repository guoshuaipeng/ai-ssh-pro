/** D24: command-bar draft per session (tab), memory only. */
export const DRAFT_CAP = 100

export function putDraft(store: Map<string, string>, sessionId: string, value: string): void {
  if (!sessionId) return
  store.delete(sessionId)
  if (!value) return
  store.set(sessionId, value)
  while (store.size > DRAFT_CAP) store.delete(store.keys().next().value as string)
}

export function getDraft(store: Map<string, string>, sessionId: string): string {
  return store.get(sessionId) ?? ''
}
