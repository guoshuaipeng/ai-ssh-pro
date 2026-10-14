/** Keeps a connected ssh2 Client from crashing the main process and reports when it is lost. */
export type GuardableClient = { on(event: string, listener: (...args: any[]) => void): unknown }

/**
 * ssh2 emits 'error' after 'ready' on network drops / keepalive timeout. Without a persistent
 * listener the second such error is an unhandled EventEmitter error in the main process.
 * onLost fires at most once, with the error message or 'closed'.
 */
export function attachClientGuards(client: GuardableClient, label: string, onLost: (reason: string) => void): void {
  let lost = false
  const lose = (reason: string) => {
    if (lost) return
    lost = true
    try {
      onLost(reason)
    } catch (e) {
      console.error('[ssh] onLost handler failed:', e)
    }
  }
  client.on('error', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ssh] ${label} client error:`, msg)
    lose(msg.slice(0, 200) || 'error')
  })
  client.on('close', () => lose('closed'))
}
