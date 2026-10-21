import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { tg } from '../lib/i18n'
import type { SplitMode } from '@shared/split-toggle'

const MODES: SplitMode[] = ['off', 'horizontal', 'vertical']
const LABEL: Record<SplitMode, 's41.modeOff' | 's41.modeH' | 's41.modeV'> = { off: 's41.modeOff', horizontal: 's41.modeH', vertical: 's41.modeV' }

export function SplitModeIcon({ mode }: { mode: SplitMode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
      {mode === 'horizontal' ? <path d="M8 2.5v11" stroke="currentColor" strokeWidth="1.35" /> : null}
      {mode === 'vertical' ? <path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.35" /> : null}
    </svg>
  )
}

/** S41b: tab-bar split entry. One button, one themed popover: off / side by side / top and bottom. */
/** D105: variant 'status' = the status-bar "分屏中" chip; same menu, opens upward from the bottom bar. */
export default function SplitModeMenu({ mode, onPick, variant = 'tab' }: { mode: SplitMode; onPick: (mode: SplitMode) => void; variant?: 'tab' | 'status' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right?: number; left?: number } | null>(null)
  const isStatus = variant === 'status'
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // the button lives inside wrapRef, so its own click never counts as "outside" (no open+close in one click)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current && !wrapRef.current.contains(t) && !listRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    queueMicrotask(() => listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      wrapRef.current?.querySelector<HTMLElement>('button')?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  const current = tg(LABEL[mode])
  return (
    <div className={isStatus ? 'statusbar-split-wrap' : 'tab-split-wrap'} ref={wrapRef} onKeyDown={onKey}>
      <button
        type="button"
        className={isStatus ? 'statusbar-slot statusbar-slot--split' : `tab-split-btn${mode !== 'off' ? ' is-on' : ''}`}
        data-testid={isStatus ? 'statusbar-split' : 'tab-split'}
        data-split-mode={mode}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tg('s41.modeMenu')}
        title={isStatus ? tg('sb.splitTip', { mode: current }) : tg('s41.modeTip', { mode: current })}
        onClick={(e) => {
          // portal + fixed position: the tab bar scrolls / clips, so an in-flow popover was cut off
          const r = e.currentTarget.getBoundingClientRect()
          setPos(isStatus
            ? { bottom: window.innerHeight - r.top + 6, left: Math.max(8, r.left) }
            : { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
          setOpen((v) => !v)
        }}
      >
        {isStatus ? <span className="statusbar-label">{tg('sb.splitOn')}</span> : <SplitModeIcon mode={mode} />}
      </button>
      {open && pos ? createPortal(
        <div
          className="titlebar-popover split-mode-menu"
          role="menu"
          aria-label={tg('s41.modeMenu')}
          ref={listRef}
          data-testid="split-mode-menu"
          style={{ position: 'fixed', top: pos.top ?? 'auto', bottom: pos.bottom ?? 'auto', right: pos.right ?? 'auto', left: pos.left ?? 'auto' }}
          onKeyDown={onKey}
        >
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={m === mode}
              className={`split-mode-item${m === mode ? ' is-on' : ''}`}
              data-testid={`split-mode-${m}`}
              onClick={() => {
                setOpen(false)
                onPick(m)
              }}
            >
              <span className="split-mode-check" aria-hidden>{m === mode ? '✓' : ''}</span>
              <SplitModeIcon mode={m} />
              <span>{tg(LABEL[m])}</span>
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  )
}
