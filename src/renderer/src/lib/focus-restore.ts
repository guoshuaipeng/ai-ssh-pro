import { useEffect } from 'react'

/**
 * IX-3: put keyboard focus back when the outermost dialog or overlay closes.
 *
 * The first open remembers `document.activeElement`. Later opens (a nested
 * confirm, or a dialog on top of the host picker) keep that original target.
 * Only the outermost close restores, once.
 *
 * A terminal is restored through the session API (`aiss-focus-terminal` →
 * `term.focus()`). The xterm helper textarea is not focused: it goes stale
 * while a modal is up, and a click would otherwise be required before the
 * next keystroke reaches the shell.
 *
 * Any other surface is restored with `element.focus()` when that node is
 * still connected. If it has gone away, focus is left alone (safe land:
 * no throw, no stale node).
 *
 * While a confirm is open, UX-45 still blocks ops shortcuts. After the
 * queue drains, focus is back on the shell, so the next key reaches it.
 */

export type FocusLand =
  | { kind: 'terminal'; sessionId?: string }
  | { kind: 'element'; el: HTMLElement }

type TerminalFocus = (sessionId?: string) => void

let depth = 0
let pendingCloses = 0
let saved: FocusLand | null = null
let flushScheduled = false
let epoch = 0
let terminalFocusHandler: TerminalFocus | null = null

/** Danger confirms open on Cancel so Enter does not confirm the destructive action. */
export function confirmInitialFocus(danger: boolean): 'cancel' | 'ok' {
  return danger ? 'cancel' : 'ok'
}

/** First dialog in a queue captures focus. A nested enqueue does not. */
export function shouldCaptureOnEnqueue(prevLength: number): boolean {
  return prevLength === 0
}

/** Restore only when the dialog queue is empty (outermost close). */
export function shouldRestoreOnQueueLength(nextLength: number): boolean {
  return nextLength === 0
}

/** Test seam. Production uses the `aiss-focus-terminal` session event. */
export function setTerminalFocusHandler(fn: TerminalFocus | null): void {
  terminalFocusHandler = fn
}

export function resetOverlayFocusForTest(): void {
  epoch += 1
  depth = 0
  pendingCloses = 0
  saved = null
  flushScheduled = false
  terminalFocusHandler = null
}

function activeNode(): HTMLElement | null {
  const doc = globalThis.document
  if (!doc) return null
  const el = doc.activeElement
  if (!el || el === doc.body || el === doc.documentElement) return null
  return el as HTMLElement
}

function isTerminalNode(el: HTMLElement): boolean {
  return Boolean(el.closest?.('.xterm, .terminal-pane-xterm, [data-terminal]'))
}

function readSessionId(el: HTMLElement): string | undefined {
  const host = el.closest?.('[data-session-id]')
  const id = host?.getAttribute?.('data-session-id')?.trim()
  return id || undefined
}

/** Remember the surface that should receive keys after the outermost overlay closes. */
export function noteOverlayOpen(): void {
  // StrictMode replays effect setup → cleanup → setup synchronously.
  // A close that has not flushed yet is that replay, not a real dismiss.
  if (pendingCloses > 0) {
    pendingCloses -= 1
    return
  }
  if (depth === 0) saved = captureLand()
  depth += 1
}

/** Schedule a restore. Nested closes wait until every overlay has closed. */
export function noteOverlayClose(): void {
  pendingCloses += 1
  if (flushScheduled) return
  flushScheduled = true
  const scheduledEpoch = epoch
  queueMicrotask(() => {
    flushScheduled = false
    if (scheduledEpoch !== epoch) return
    const n = pendingCloses
    pendingCloses = 0
    for (let i = 0; i < n; i++) {
      if (depth <= 0) break
      depth -= 1
      if (depth === 0) {
        const land = saved
        saved = null
        restoreLand(land)
      }
    }
  })
}

function captureLand(): FocusLand | null {
  const el = activeNode()
  if (!el) return null
  if (isTerminalNode(el)) return { kind: 'terminal', sessionId: readSessionId(el) }
  if (typeof el.focus !== 'function') return null
  return { kind: 'element', el }
}

function restoreLand(land: FocusLand | null): void {
  if (!land) return
  if (land.kind === 'terminal') {
    focusTerminalSession(land.sessionId)
    return
  }
  const el = land.el
  if (el.isConnected === false) return
  if (isTerminalNode(el)) {
    focusTerminalSession(readSessionId(el))
    return
  }
  try {
    el.focus()
  } catch {
    /* node gone — safe land */
  }
}

/** Session API. Does not call focus() on the xterm helper textarea. */
export function focusTerminalSession(sessionId?: string): void {
  if (terminalFocusHandler) {
    terminalFocusHandler(sessionId)
    return
  }
  const w = globalThis.window
  if (!w?.dispatchEvent) return
  w.dispatchEvent(new CustomEvent('aiss-focus-terminal', { detail: sessionId ? { sessionId } : {} }))
}

export type EditorFocusTicket = {
  land: FocusLand | null
}

/**
 * IX-7: remember the surface under a long in-tab editor.
 * This stack is separate from modal depth, so opening the editor in the
 * same turn a palette closes does not swallow the palette restore.
 * Esc / close uses the IX-3 land rules: a terminal goes through the session
 * API (`term.focus()`), not the stale xterm textarea. Any other surface is
 * `element.focus()`. A missing or disconnected node is a safe land.
 */
export function captureEditorFocus(): EditorFocusTicket {
  return { land: captureLand() }
}

/** IX-7: Esc or the editor close control. Does not move focus when there is nothing to restore. */
export function restoreEditorFocus(ticket: EditorFocusTicket | null): void {
  if (!ticket) return
  restoreLand(ticket.land)
}

/**
 * PNG-1: one focus ticket for the whole product overlay layer.
 *
 * The ticket is separate from dialog / palette depth, so closing a menu or
 * a confirm restores the product overlay underneath it, not the shell.
 * The shell is restored only when the product layer itself goes away.
 *
 * StrictMode and a queued next overlay (welcome → tour) both close and
 * reopen before the deferred restore runs. That reopen cancels the restore
 * and keeps the original ticket, so focus is not thrown at a stand-in control.
 */
export function bindProductFocus(opts?: {
  schedule?: (fn: () => void) => number
  cancel?: (id: number) => void
  now?: () => EditorFocusTicket
  restore?: (ticket: EditorFocusTicket | null) => void
}): { activate(): () => void } {
  let ticket: EditorFocusTicket | null = null
  let pending: number | null = null
  const schedule = opts?.schedule ?? ((fn: () => void) => window.setTimeout(fn, 0) as unknown as number)
  const cancel = opts?.cancel ?? ((id: number) => window.clearTimeout(id))
  const now = opts?.now ?? captureEditorFocus
  const restore = opts?.restore ?? restoreEditorFocus
  return {
    activate() {
      if (pending != null) {
        cancel(pending)
        pending = null
      } else {
        ticket = now()
      }
      return () => {
        const held = ticket
        pending = schedule(() => {
          pending = null
          ticket = null
          restore(held)
        })
      }
    }
  }
}

/**
 * Host picker and the command palette: one boolean `open`.
 * Capture runs in the open effect, before the overlay's own focus timeout.
 * Restore runs from the cleanup, after the overlay has unmounted.
 */
export function useOverlayFocusRestore(open: boolean): void {
  useEffect(() => {
    if (!open) return
    noteOverlayOpen()
    return () => {
      noteOverlayClose()
    }
  }, [open])
}
