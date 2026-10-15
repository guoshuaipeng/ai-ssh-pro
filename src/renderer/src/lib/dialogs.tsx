import { useEffect, useRef, useState } from 'react'
import { assertConfirmAllowed, isBannedConfirmLabel, undoDurationMs, type ConfirmId } from '@shared/confirm-whitelist'
import Modal from '../components/Modal'
import { tg } from './i18n'
import { showToast, type ToastAction } from './toast'

/**
 * UX-06: the only dialogs the app uses (no native browser dialogs anywhere; scripts/check-ux.mjs enforces it).
 *   confirmDialog({ title, body, confirmText, danger }) → Promise<boolean>
 *   promptDialog({ title, label, defaultValue, validate }) → Promise<string | null>
 *   toast({ text, action, kind })
 * Modal 420px, primary button on the right; Esc cancels, Enter confirms; danger dialogs focus Cancel first.
 * Mount <DialogHost /> once (App does).
 */
export type ConfirmOptions = { title: string; body?: string; confirmText?: string; danger?: boolean; detail?: string }
export type PromptOptions = { title: string; label?: string; defaultValue?: string; validate?: (v: string) => string | null }

type Request =
  | ({ kind: 'text'; resolve: (v: string | null) => void } & PromptOptions)
  | ({ kind: 'confirm'; resolve: (v: boolean) => void } & ConfirmOptions)

const listeners = new Set<(r: Request) => void>()
let openCount = 0
const openListeners = new Set<(n: number) => void>()

/** UX-45: true while a Confirm/Prompt modal is visible. */
export function isDialogOpen(): boolean {
  return openCount > 0
}

export function subscribeDialogOpen(fn: (n: number) => void): () => void {
  openListeners.add(fn)
  return () => {
    openListeners.delete(fn)
  }
}

function setOpenCount(n: number): void {
  openCount = n
  for (const fn of openListeners) fn(n)
}

function emit(r: Request): boolean {
  if (listeners.size === 0) return false
  for (const fn of listeners) fn(r)
  return true
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!emit({ kind: 'confirm', ...opts, resolve })) {
      console.warn('[dialogs] no DialogHost mounted; treating as cancel:', opts.title)
      resolve(false)
    }
  })
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!emit({ kind: 'text', ...opts, resolve })) resolve(null)
  })
}

export function toast(opts: { text: string; action?: ToastAction; kind?: 'info' | 'error' }): void {
  showToast(opts.text, { action: opts.action, kind: opts.kind })
}

/** Back-compat helpers used across the app. */
export function askText(title: string, defaultValue = ''): Promise<string | null> {
  return promptDialog({ title, defaultValue })
}

export type AskConfirmInput = {
  id: ConfirmId
  title: string
  body?: string
  confirmText?: string
  danger?: boolean
}

function normalizeAskConfirm(
  titleOrOpts: string | AskConfirmInput,
  message?: string,
  opts?: { id?: ConfirmId; danger?: boolean; okLabel?: string }
): AskConfirmInput {
  if (typeof titleOrOpts === 'string') {
    return {
      id: opts?.id as ConfirmId,
      title: titleOrOpts,
      body: message,
      danger: opts?.danger,
      confirmText: opts?.okLabel
    }
  }
  return titleOrOpts
}

/** Only whitelist ids may confirm. The primary label must name the action. */
export function askConfirm(opts: AskConfirmInput): Promise<boolean>
export function askConfirm(title: string, message: string, opts: { id: ConfirmId; danger?: boolean; okLabel?: string }): Promise<boolean>
export function askConfirm(
  titleOrOpts: string | AskConfirmInput,
  message?: string,
  opts?: { id?: ConfirmId; danger?: boolean; okLabel?: string }
): Promise<boolean> {
  const input = normalizeAskConfirm(titleOrOpts, message, opts)
  assertConfirmAllowed(input.id)
  if (isBannedConfirmLabel(input.confirmText)) {
    throw new Error(`askConfirm label must name the action: ${input.id}`)
  }
  return confirmDialog({
    title: input.title,
    body: input.body,
    danger: input.danger ?? true,
    confirmText: input.confirmText
  })
}

export const UNDO_TOAST_MS = 8000

/** Run already happened. Offer ［撤销］ for at least 5s (default 8s). */
export function toastUndo(opts: { message: string; undo: () => void | Promise<void>; durationMs?: number }): void {
  const ms = undoDurationMs(opts.durationMs ?? UNDO_TOAST_MS)
  showToast(opts.message, {
    ms,
    action: {
      label: tg('undo.action'),
      run: () => {
        try {
          const result = opts.undo()
          const done = () => showToast(tg('undo.done'), { ms: 2500 })
          if (result && typeof (result as Promise<void>).then === 'function') {
            void (result as Promise<void>).then(done).catch(() => showToast(tg('undo.failed'), { kind: 'error' }))
          } else done()
        } catch {
          showToast(tg('undo.failed'), { kind: 'error' })
        }
      }
    }
  })
}

export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([])
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const current = queue[0]

  useEffect(() => {
    const fn = (r: Request) => setQueue((q) => [...q, r])
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  useEffect(() => {
    setOpenCount(queue.length)
  }, [queue.length])

  useEffect(() => {
    if (!current) return
    setInvalid(null)
    if (current.kind === 'text') {
      setValue(current.defaultValue ?? '')
      setTimeout(() => inputRef.current?.select(), 0)
    } else {
      setTimeout(() => (current.danger ? cancelRef.current : okRef.current)?.focus(), 0)
    }
  }, [current])

  if (!current) return null
  const finish = (ok: boolean) => {
    if (current.kind === 'text') {
      if (ok && current.validate) {
        const err = current.validate(value)
        if (err) {
          setInvalid(err)
          return
        }
      }
      current.resolve(ok ? value : null)
    } else current.resolve(ok)
    setQueue((q) => q.slice(1))
  }
  const danger = current.kind === 'confirm' && current.danger

  return (
    <Modal
      open
      title={current.title}
      onClose={() => finish(false)}
      width={420}
      footer={
        <>
          <button type="button" ref={cancelRef} data-testid="dialog-cancel" onClick={() => finish(false)}>
            {tg('dlg.cancel')}
          </button>
          <button
            type="button"
            ref={okRef}
            className={danger ? 'primary danger' : 'primary'}
            data-testid="dialog-ok"
            onClick={() => finish(true)}
          >
            {current.kind === 'confirm' && current.confirmText ? current.confirmText : tg('dlg.ok')}
          </button>
        </>
      }
    >
      <div className="app-dialog" data-testid="app-dialog" data-danger={danger ? 'true' : undefined}>
        {current.kind === 'text' ? (
          <>
            {current.label ? <label className="app-dialog-label">{current.label}</label> : null}
            <input
              ref={inputRef}
              className="dialog-text-input"
              style={{ width: '100%' }}
              value={value}
              aria-label={current.label || current.title}
              onChange={(e) => {
                setValue(e.target.value)
                setInvalid(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finish(true)
              }}
            />
            {invalid ? <p className="app-dialog-error">{invalid}</p> : null}
          </>
        ) : (
          <>
            {current.body ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{current.body}</p> : null}
            {current.detail ? <pre className="app-dialog-detail">{current.detail}</pre> : null}
          </>
        )}
      </div>
    </Modal>
  )
}
