/** D88: last connect failure per `user@host:port` (memory only; cleared on success or restart). */
export const CONNECT_FAIL_EVENT = 'aiss-connect-fail-changed'

export type ConnectFail = { at: number; reason: string }

const store = new Map<string, ConnectFail>()

export function connectFailKey(username: string, host: string, port?: number): string {
  return `${username.trim()}@${host.trim()}:${port || 22}`.toLowerCase()
}

function changed(): void {
  try {
    window.dispatchEvent(new Event(CONNECT_FAIL_EVENT))
  } catch {
    /* non-DOM */
  }
}

export function noteConnectFail(key: string, reason: string, at = Date.now()): void {
  store.set(key, { at, reason: reason.slice(0, 300) })
  changed()
}

export function clearConnectFail(key: string): void {
  if (store.delete(key)) changed()
}

export function getConnectFail(key: string): ConnectFail | undefined {
  return store.get(key)
}
