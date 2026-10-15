/** Show a BrowserWindow even when Electron never emits ready-to-show (electron/electron#42409). */

export type ShowableWindow = {
  show: () => void
  isDestroyed: () => boolean
  once: (event: 'ready-to-show' | 'close' | 'closed', listener: () => void) => void
  webContents: {
    once: (event: 'did-finish-load', listener: () => void) => void
  }
}

/** Ignore a second-instance create this soon after the last window closed. */
export const SECOND_INSTANCE_CREATE_DEBOUNCE_MS = 1500

type ShowTarget = {
  show: () => void
  isDestroyed: () => boolean
  once: (...args: never[]) => unknown
  webContents: { once: (...args: never[]) => unknown }
}

export function attachShowFallback(
  win: ShowTarget,
  opts?: { timeoutMs?: number; onShow?: () => void }
): void {
  const target = win as ShowableWindow
  const timeoutMs = opts?.timeoutMs ?? 3000
  let done = false
  let aborted = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const abort = () => {
    aborted = true
    done = true
    clearTimeout(timer)
  }
  const finish = () => {
    if (done || aborted) return
    done = true
    clearTimeout(timer)
    if (target.isDestroyed()) return
    target.show()
    opts?.onShow?.()
  }
  timer = setTimeout(finish, timeoutMs)
  target.once('ready-to-show', finish)
  target.webContents.once('did-finish-load', finish)
  // 'close' fires before destroy; abort so a close/show race cannot paint the window again.
  target.once('close', abort)
  target.once('closed', abort)
}

/**
 * A second launch with no window shortly after close is lock-spam or an overlapping
 * start, not a deliberate reopen. After the debounce, keep-alive still creates.
 */
export function shouldCreateOnSecondInstance(
  lastWindowClosedAt: number | null,
  now: number,
  debounceMs = SECOND_INSTANCE_CREATE_DEBOUNCE_MS
): boolean {
  if (lastWindowClosedAt == null) return true
  return now - lastWindowClosedAt >= debounceMs
}
