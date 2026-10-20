/** D24: command-bar draft per session (tab), memory only. */
export const DRAFT_CAP = 100

export function putDraft(store: Map<string, string>, sessionId: string, value: string): void {
  if (!sessionId) return
  store.delete(sessionId)
  if (!value) return
  store.set(sessionId, value)
  while (store.size > DRAFT_CAP) store.delete(store.keys().next().value as string)
}

/** D63: drafts saved with the workspace: short, single-line, not sensitive and with nothing to redact. */
export const SAVED_DRAFT_MAX = 500

export function persistableDraft(value: string | null | undefined, sensitive: (cmd: string) => boolean, redact: (s: string) => string): string {
  const v = (value ?? '').trim()
  if (!v || v.length > SAVED_DRAFT_MAX || /[\r\n]/.test(v) || sensitive(v) || redact(v) !== v) return ''
  return v
}

export function getDraft(store: Map<string, string>, sessionId: string): string {
  return store.get(sessionId) ?? ''
}
