import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { nextEnabled, typeAheadIndex } from '../../../../shared/select-nav'

export type SelectOption = {
  value: string
  label: string
  /** Shown muted on the right (host, unit, count). */
  hint?: string
  /** Kept visible; the title explains why it cannot be picked. */
  disabled?: boolean
  title?: string
}

type Props = {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  /** Why the whole control is disabled. Shown as tooltip. */
  disabledReason?: string
  placeholder?: string
  ariaLabel?: string
  testId?: string
  className?: string
  style?: CSSProperties
}

/** C2: themed replacement for the native select element. Button + listbox popover, keyboard and type-ahead. */
export default function Select({ value, options, onChange, disabled, disabledReason, placeholder, ariaLabel, testId, className, style }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const listId = useId()
  const current = options.find((o) => o.value === value)

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < 220 && r.top > below
    setPos({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, up })
  }, [])

  const openList = useCallback(() => {
    if (disabled) return
    place()
    const i = options.findIndex((o) => o.value === value && !o.disabled)
    setActive(i >= 0 ? i : options.findIndex((o) => !o.disabled))
    setOpen(true)
  }, [disabled, options, place, value])

  const close = useCallback((focus = true) => {
    setOpen(false)
    if (focus) btnRef.current?.focus()
  }, [])

  const pick = useCallback(
    (i: number) => {
      const o = options[i]
      if (!o || o.disabled) return
      if (o.value !== value) onChange(o.value)
      close()
    },
    [close, onChange, options, value]
  )

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return
      close(false)
    }
    const onMove = () => place()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, close, place])

  useLayoutEffect(() => {
    if (!open || active < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const step = (from: number, dir: 1 | -1): number => nextEnabled(options, from, dir)

  const typeAhead = (ch: string) => {
    const now = Date.now()
    typed.current = { text: now - typed.current.at > 700 ? ch : typed.current.text + ch, at: now }
    return typeAheadIndex(options, typed.current.text, active)
  }

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      } else if (e.key.length === 1 && /\S/.test(e.key)) {
        const i = typeAhead(e.key)
        if (i >= 0) onChange(options[i]!.value)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => step(a, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => step(a, -1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(step(-1, 1))
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(step(options.length, -1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      close(false)
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const i = typeAhead(e.key)
      if (i >= 0) setActive(i)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        title={disabled ? disabledReason : current?.title}
        data-testid={testId}
        data-value={value}
        className={`ui-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
        style={style}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
      >
        <span className={`ui-select-value${current ? '' : ' is-placeholder'}`}>{current?.label ?? placeholder ?? ''}</span>
        <svg className="ui-select-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="ui-select-list"
              data-testid={testId ? `${testId}-list` : undefined}
              style={{
                left: pos.left,
                minWidth: pos.width,
                ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top })
              }}
            >
              {options.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  title={o.title}
                  className={`ui-select-opt${i === active ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}${o.disabled ? ' is-disabled' : ''}`}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(i)}
                >
                  <span className="ui-select-check" aria-hidden="true">
                    {o.value === value ? '✓' : ''}
                  </span>
                  <span className="ui-select-label">{o.label}</span>
                  {o.hint ? <span className="ui-select-hint">{o.hint}</span> : null}
                </li>
              ))}
            </ul>,
            document.body
          )
        : null}
    </>
  )
}
