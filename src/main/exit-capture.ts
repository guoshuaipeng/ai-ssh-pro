import { ExitMarkerParser, newExitNonce, wrapWithExitMarker } from '../shared/exit-marker'

/** B1: per-session exit-code capture state (AI commands only). No Electron / ssh2 imports so it is unit-testable. */
type ExitState = {
  parser: ExitMarkerParser
  exits: Map<string, { code: number; at: number }>
  waiters: Map<string, (code: number | null) => void>
  /** last marked nonce per original command text */
  lastByCommand: Map<string, string>
  /** markers seen; after 2 timeouts with none seen the shell is treated as unsupported (e.g. fish) */
  seen: number
  timeouts: number
}

export class ExitCaptureRegistry {
  private states = new Map<string, ExitState>()

  private state(sessionId: string): ExitState {
    let st = this.states.get(sessionId)
    if (!st) {
      st = { parser: new ExitMarkerParser(), exits: new Map(), waiters: new Map(), lastByCommand: new Map(), seen: 0, timeouts: 0 }
      this.states.set(sessionId, st)
    }
    return st
  }

  has(sessionId: string): boolean {
    return this.states.has(sessionId)
  }

  /** Strip markers from shell output (before ring / recording) and resolve waiters. */
  consume(sessionId: string, text: string): string {
    const st = this.states.get(sessionId)
    if (!st) return text
    const { clean, exits } = st.parser.feed(text)
    for (const hit of exits) {
      st.seen += 1
      st.exits.set(hit.nonce, { code: hit.code, at: Date.now() })
      if (st.exits.size > 100) st.exits.delete(st.exits.keys().next().value as string)
      const w = st.waiters.get(hit.nonce)
      if (w) {
        st.waiters.delete(hit.nonce)
        w(hit.code)
      }
    }
    return clean
  }

  /** Wire form for an AI command; nonce null when not marked. */
  prepare(sessionId: string, command: string): { wire: string; nonce: string | null; unsupported?: boolean } {
    const prev = this.states.get(sessionId)
    if (prev && prev.seen === 0 && prev.timeouts >= 2) return { wire: command, nonce: null, unsupported: true }
    const nonce = newExitNonce()
    const { wire, marked } = wrapWithExitMarker(command, nonce)
    if (!marked) return { wire: command, nonce: null }
    const st = this.state(sessionId)
    st.lastByCommand.set(command.trim(), nonce)
    if (st.lastByCommand.size > 60) st.lastByCommand.delete(st.lastByCommand.keys().next().value as string)
    return { wire, nonce }
  }

  /** Resolves with the exit code, or null on timeout / abort / session end. */
  wait(sessionId: string, nonce: string, timeoutMs: number, signal?: AbortSignal): Promise<number | null> {
    const st = this.states.get(sessionId)
    if (!st) return Promise.resolve(null)
    const done = st.exits.get(nonce)
    if (done) return Promise.resolve(done.code)
    return new Promise((resolve) => {
      let settled = false
      const finish = (v: number | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        st.waiters.delete(nonce)
        signal?.removeEventListener('abort', onAbort)
        resolve(v)
      }
      const onAbort = () => finish(null)
      const timer = setTimeout(() => {
        st.timeouts += 1
        finish(null)
      }, Math.max(0, timeoutMs))
      st.waiters.set(nonce, finish)
      signal?.addEventListener('abort', onAbort)
    })
  }

  outcome(sessionId: string, command: string): { exitCode: number } | null {
    const st = this.states.get(sessionId)
    const nonce = st?.lastByCommand.get(command.trim())
    const hit = nonce ? st?.exits.get(nonce) : undefined
    return hit ? { exitCode: hit.code } : null
  }

  drop(sessionId: string): void {
    const st = this.states.get(sessionId)
    if (!st) return
    for (const w of st.waiters.values()) w(null)
    this.states.delete(sessionId)
  }
}
