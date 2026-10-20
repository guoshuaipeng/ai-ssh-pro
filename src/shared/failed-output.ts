/** D22b: in-session memory of the last failed output per (session, command). Never persisted. */

export const FAILED_OUTPUT_CAP = 50

export type FailedOutputStore = Map<string, string>

function k(sessionId: string, command: string): string {
  return `${sessionId}\n${command.trim()}`
}

export function rememberFailed(store: FailedOutputStore, sessionId: string, command: string, code: number, context: string): void {
  const key = k(sessionId, command)
  store.delete(key)
  if (code === 0 || !context) return // a later success makes the old output stale
  store.set(key, context)
  while (store.size > FAILED_OUTPUT_CAP) store.delete(store.keys().next().value as string)
}

export function failedContext(store: FailedOutputStore, sessionId: string, command: string, code: number): { text: string; hasOutput: boolean } {
  const ctx = store.get(k(sessionId, command))
  if (ctx) return { text: ctx, hasOutput: true }
  return { text: `$ ${command.trim()}\n(exit ${code})`, hasOutput: false }
}
