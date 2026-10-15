/** Show a BrowserWindow even when Electron never emits ready-to-show (electron/electron#42409). */

export type ShowableWindow = {
  show: () => void
  isDestroyed: () => boolean
  once: (event: 'ready-to-show' | 'closed', listener: () => void) => void
  webContents: {
    once: (event: 'did-finish-load', listener: () => void) => void
  }
}

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
  const finish = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    if (target.isDestroyed()) return
    target.show()
    opts?.onShow?.()
  }
  const timer = setTimeout(finish, timeoutMs)
  target.once('ready-to-show', finish)
  target.webContents.once('did-finish-load', finish)
  target.once('closed', () => {
    clearTimeout(timer)
    done = true
  })
}

/** Retry a single-instance lock while a previous process is still quitting. */
export function retryLock(
  tryOnce: () => boolean,
  wait: (ms: number) => void,
  attempts = 10,
  delayMs = 300
): boolean {
  const n = Math.max(1, attempts)
  for (let i = 0; i < n; i++) {
    if (tryOnce()) return true
    if (i < n - 1) wait(delayMs)
  }
  return false
}
