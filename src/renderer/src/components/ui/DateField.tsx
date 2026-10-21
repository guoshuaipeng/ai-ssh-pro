import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { addDays, addMonths, fmtYmd, monthGrid, parseYmd, withinYmd, type Ymd } from '../../../../shared/date-grid'
import { useI18n } from '../../lib/i18n'
import Icon from '../Icon'

type Props = {
  /** YYYY-MM-DD or '' */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  ariaLabel?: string
  placeholder?: string
  testId?: string
}

function today(): Ymd {
  const n = new Date()
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }
}

/** DF1: themed date picker replacing <input type="date"> (button + month grid popover). */
export default function DateField({ value, onChange, min, max, ariaLabel, placeholder, testId }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState<Ymd>(() => parseYmd(value) ?? today())
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const h = 300
    const up = window.innerHeight - r.bottom < h && r.top > h
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 256)), top: up ? r.top - h - 4 : r.bottom + 4 })
  }, [])

  const close = useCallback((focus = true) => {
    setOpen(false)
    if (focus) btnRef.current?.focus()
  }, [])

  const openPop = () => {
    setCursor(parseYmd(value) ?? today())
    place()
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (open) popRef.current?.querySelector<HTMLButtonElement>('[data-df-cursor="1"]')?.focus()
  }, [open, cursor])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (popRef.current?.contains(n) || btnRef.current?.contains(n)) return
      close(false)
    }
    const onClose = () => close(false)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('aiss:close-menus', onClose)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('aiss:close-menus', onClose)
      window.removeEventListener('resize', place)
    }
  }, [open, close, place])

  const pick = (v: Ymd) => {
    const s = fmtYmd(v)
    if (!withinYmd(s, min, max)) return
    onChange(s)
    close()
  }

  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, -1),
      PageDown: () => addMonths(cursor, 1)
    }
    if (step[e.key]) {
      e.preventDefault()
      setCursor(step[e.key]())
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(cursor)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  const grid = monthGrid(cursor.y, cursor.m)
  const sel = value
  const now = fmtYmd(today())
  const weekdays = t('df.weekdays').split(',')

  return (
    <span className="df-field" data-testid={testId}>
      <button
        ref={btnRef}
        type="button"
        className={`df-btn${value ? '' : ' is-empty'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openPop())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            openPop()
          }
        }}
      >
        <Icon name="history" size={14} />
        <span>{value || placeholder || t('df.pick')}</span>
      </button>
      {value ? (
        <button type="button" className="df-clear" aria-label={t('df.clear')} title={t('df.clear')} data-testid={testId ? `${testId}-clear` : undefined} onClick={() => onChange('')}>
          <Icon name="x" size={12} />
        </button>
      ) : null}
      {open && pos
        ? createPortal(
            <div ref={popRef} className="df-pop" role="dialog" aria-label={ariaLabel} style={{ left: pos.left, top: pos.top }} onKeyDown={onKey} data-testid={testId ? `${testId}-pop` : undefined}>
              <div className="df-head">
                <button type="button" className="df-nav" aria-label={t('df.prev')} onClick={() => setCursor(addMonths(cursor, -1))}>‹</button>
                <span className="df-title">{t('df.month', { y: cursor.y, m: cursor.m + 1 })}</span>
                <button type="button" className="df-nav" aria-label={t('df.next')} onClick={() => setCursor(addMonths(cursor, 1))}>›</button>
              </div>
              <div className="df-grid" role="grid">
                {weekdays.map((w) => (
                  <span key={w} className="df-wd" role="columnheader">{w}</span>
                ))}
                {grid.map((c) => {
                  const s = fmtYmd(c)
                  const isCur = c.y === cursor.y && c.m === cursor.m && c.d === cursor.d
                  const ok = withinYmd(s, min, max)
                  return (
                    <button
                      key={s}
                      type="button"
                      role="gridcell"
                      tabIndex={isCur ? 0 : -1}
                      data-df-cursor={isCur ? '1' : undefined}
                      data-date={s}
                      disabled={!ok}
                      aria-selected={s === sel}
                      className={`df-day${c.inMonth ? '' : ' is-out'}${s === sel ? ' is-sel' : ''}${s === now ? ' is-today' : ''}`}
                      onClick={() => pick(c)}
                    >
                      {c.d}
                    </button>
                  )
                })}
              </div>
              <div className="df-foot">
                <button type="button" className="df-link" onClick={() => pick(today())}>{t('df.today')}</button>
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  )
}
