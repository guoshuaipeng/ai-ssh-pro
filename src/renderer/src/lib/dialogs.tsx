import { useEffect, useRef, useState } from 'react'
import Modal from '../components/Modal'
import { tg } from './i18n'

/**
 * In-app replacements for window.prompt / window.confirm.
 * Electron does not implement window.prompt (it returns null), which silently broke
 * "new folder" / "rename" flows. Mount <DialogHost /> once (App does).
 */
type Request =
  | { kind: 'text'; title: string; defaultValue: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; danger: boolean; okLabel?: string; resolve: (v: boolean) => void }

const listeners = new Set<(r: Request) => void>()

function emit(r: Request): boolean {
  if (listeners.size === 0) return false
  for (const fn of listeners) fn(r)
  return true
}

export function askText(title: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    if (!emit({ kind: 'text', title, defaultValue, resolve })) resolve(null)
  })
}

export function askConfirm(title: string, message: string, opts?: { danger?: boolean; okLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!emit({ kind: 'confirm', title, message, danger: Boolean(opts?.danger), okLabel: opts?.okLabel, resolve })) {
      resolve(window.confirm(`${title}\n\n${message}`))
    }
  })
}

export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([])
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const current = queue[0]

  useEffect(() => {
    const fn = (r: Request) => setQueue((q) => [...q, r])
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  useEffect(() => {
    if (current?.kind === 'text') {
      setValue(current.defaultValue)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [current])

  if (!current) return null
  const finish = (ok: boolean) => {
    if (current.kind === 'text') current.resolve(ok ? value : null)
    else current.resolve(ok)
    setQueue((q) => q.slice(1))
  }

  return (
    <Modal
      open
      title={current.title}
      onClose={() => finish(false)}
      width={440}
      footer={
        <>
          <button type="button" onClick={() => finish(false)}>
            {tg('dlg.cancel')}
          </button>
          <button
            type="button"
            className={current.kind === 'confirm' && current.danger ? 'primary danger' : 'primary'}
            data-testid="dialog-ok"
            onClick={() => finish(true)}
          >
            {current.kind === 'confirm' && current.okLabel ? current.okLabel : tg('dlg.ok')}
          </button>
        </>
      }
    >
      {current.kind === 'text' ? (
        <input
          ref={inputRef}
          className="dialog-text-input"
          style={{ width: '100%' }}
          value={value}
          aria-label={current.title}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(true)
          }}
        />
      ) : (
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{current.message}</p>
      )}
    </Modal>
  )
}
