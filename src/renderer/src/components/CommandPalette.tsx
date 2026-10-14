import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { MENUS, type TitlebarMenuAction } from './TitlebarMenus'
import { buildPaletteEntries, filterPaletteEntries, type PaletteEntry } from '../lib/palette'

type Props = {
  open: boolean
  onClose: () => void
  onAction: (action: TitlebarMenuAction) => void
}

type Entry = PaletteEntry

/** Ctrl+Shift+P / Ctrl+K: searchable list of every menu action (matches on the label, menu name and action id). */
export default function CommandPalette({ open, onClose, onAction }: Props) {
  const { t, locale } = useI18n()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<Entry[]>(() => buildPaletteEntries(MENUS, locale), [locale])
  const filtered = useMemo(() => filterPaletteEntries(entries, q), [entries, q])

  useEffect(() => {
    if (!open) return
    setQ('')
    setSel(0)
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])
  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.cmdp-item.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null
  const run = (e?: Entry) => {
    if (!e) return
    onClose()
    window.setTimeout(() => onAction(e.id), 0)
  }
  return (
    <div className="cmdp-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="cmdp" role="dialog" aria-label={t('cmdp.title')} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdp-input"
          placeholder={t('cmdp.placeholder')}
          aria-label={t('cmdp.title')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(filtered.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(filtered[sel])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }
          }}
        />
        <div className="cmdp-list" role="listbox" ref={listRef}>
          {filtered.length === 0 ? <div className="cmdp-empty">{t('cmdp.empty')}</div> : null}
          {filtered.map((e, i) => (
            <button
              key={e.id}
              type="button"
              role="option"
              aria-selected={i === sel}
              className={`cmdp-item${i === sel ? ' is-active' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(e)}
            >
              <span className="cmdp-label">{e.label}</span>
              <span className="cmdp-group">{e.group}</span>
              {e.shortcut ? <kbd className="cmdp-kbd">{e.shortcut}</kbd> : null}
            </button>
          ))}
        </div>
        <div className="cmdp-foot">{t('cmdp.hint')}</div>
      </div>
    </div>
  )
}
