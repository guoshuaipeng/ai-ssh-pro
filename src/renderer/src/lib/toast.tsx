import { useEffect, useState } from 'react'
import {
  TOAST_VISIBLE_CAP,
  admitToast,
  inferToastTheme,
  type ToastTheme
} from '@shared/toast-queue'

/** Non-blocking notifications (ux-spec §3: toast instead of alert). Mount <ToastHost /> once. */
export type ToastAction = { label: string; run: () => void }
type Toast = {
  id: number
  message: string
  actions: ToastAction[]
  kind: 'info' | 'error'
  ms: number
  theme: ToastTheme
}

const listeners = new Set<(t: Toast) => void>()
const clearListeners = new Set<() => void>()
let seq = 0

export function clearToasts(): void {
  for (const fn of clearListeners) fn()
}

export function showToast(
  message: string,
  opts?: {
    action?: ToastAction
    actions?: ToastAction[]
    kind?: 'info' | 'error'
    ms?: number
    theme?: ToastTheme
  }
): void {
  const kind = opts?.kind ?? 'info'
  const theme = opts?.theme ?? inferToastTheme(message, kind)
  const actions = opts?.actions ?? (opts?.action ? [opts.action] : [])
  const t: Toast = {
    id: ++seq,
    message,
    actions,
    kind,
    theme,
    ms: opts?.ms ?? (actions.length ? 8000 : 4000)
  }
  for (const fn of listeners) fn(t)
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const fn = (t: Toast) => {
      setItems((prev) => admitToast(prev, t, TOAST_VISIBLE_CAP) as Toast[])
      window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.ms)
    }
    const clear = () => setItems([])
    listeners.add(fn)
    clearListeners.add(clear)
    return () => {
      listeners.delete(fn)
      clearListeners.delete(clear)
    }
  }, [])
  if (!items.length) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite" data-toast-cap={TOAST_VISIBLE_CAP}>
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} data-testid="toast" data-toast-theme={t.theme}>
          <span>{t.message}</span>
          {t.actions.length ? (
            <span className="toast-actions">
              {t.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setItems((prev) => prev.filter((x) => x.id !== t.id))
                    action.run()
                  }}
                >
                  {action.label}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
