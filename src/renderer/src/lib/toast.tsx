import { useEffect, useState } from 'react'

/** Non-blocking notifications (ux-spec §3: toast instead of alert). Mount <ToastHost /> once. */
export type ToastAction = { label: string; run: () => void }
type Toast = { id: number; message: string; action?: ToastAction; kind: 'info' | 'error'; duration: number }

const listeners = new Set<(t: Toast) => void>()
let seq = 0

export function showToast(message: string, opts?: { action?: ToastAction; kind?: 'info' | 'error'; duration?: number }): void {
  const t: Toast = {
    id: ++seq,
    message,
    action: opts?.action,
    kind: opts?.kind ?? 'info',
    duration: opts?.duration ?? (opts?.action ? 8000 : 4000)
  }
  for (const fn of listeners) fn(t)
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const fn = (t: Toast) => {
      setItems((prev) => [...prev.slice(-2), t])
      window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.duration)
    }
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  if (!items.length) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} data-testid="toast">
          <span>{t.message}</span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                setItems((prev) => prev.filter((x) => x.id !== t.id))
                t.action!.run()
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
