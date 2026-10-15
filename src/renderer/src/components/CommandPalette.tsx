import { useEffect, useMemo, useRef, useState } from 'react'
import { menuLabel } from '@shared/menus'
import { useI18n } from '../lib/i18n'
import { loadSmartPrefs } from '../lib/smart-history'
import { armFolderSync } from '../lib/sftp-activity'
import { MENUS, type TitlebarMenuAction } from './TitlebarMenus'
import { loadSyncProfiles } from './SftpPanel'
import { buildPaletteEntries, type PaletteEntry } from '../lib/palette'
import { layoutPalette } from '@shared/palette-rank'
import { loadPaletteUsage, recordPaletteUse } from '../lib/palette-usage'

type Props = {
  open: boolean
  onClose: () => void
  onAction: (action: TitlebarMenuAction) => void
  /** UX-37: AI actions note "not set up" until a key exists */
  aiReady?: boolean
  /** Grey reason shown beside an action that cannot run yet. */
  notes?: Partial<Record<string, string>>
}

type Entry = PaletteEntry

/** Ctrl+Shift+P / Ctrl+K: searchable list of every menu action (matches on the label, menu name and action id). */
const CAT_KEY: Record<string, 'palette.pinned' | 'palette.cat.connection' | 'palette.cat.session' | 'palette.cat.ops' | 'palette.cat.file' | 'palette.cat.ai' | 'palette.cat.view' | 'palette.cat.settings' | 'palette.cat.help'> = {
  pinned: 'palette.pinned',
  connection: 'palette.cat.connection',
  session: 'palette.cat.session',
  ops: 'palette.cat.ops',
  file: 'palette.cat.file',
  ai: 'palette.cat.ai',
  view: 'palette.cat.view',
  settings: 'palette.cat.settings',
  help: 'palette.cat.help'
}

export default function CommandPalette({ open, onClose, onAction, aiReady = true, notes }: Props) {
  const { t, locale } = useI18n()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<Entry[]>(() => {
    const prefs = loadSmartPrefs()
    const file = MENUS.find((m) => m.id === 'file')
    const fileGroup = file ? menuLabel(file.label, locale) : ''
    const settingsItem = MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'settings')
    const settingsGroup = settingsItem && settingsItem.type === 'item' ? menuLabel(settingsItem.label, locale).replace(/…$/, '') : ''
    const base = buildPaletteEntries(MENUS, locale).map((e) => {
      if (e.id === 'smartComplete') {
        const label = t(prefs.enabled ? 'x1.toggleOn' : 'x1.toggleOff')
        return { ...e, label, group: settingsGroup, hay: `${e.hay} ${label} ${settingsGroup}`.toLowerCase() }
      }
      if (e.id === 'clearHostHistory') return { ...e, group: settingsGroup, hay: `${e.hay} ${settingsGroup}`.toLowerCase() }
      if (e.id === 'folderSync') return { ...e, group: fileGroup, hay: `${e.hay} ${fileGroup}`.toLowerCase() }
      if (!aiReady && (e.id === 'aiExplainError' || e.id === 'aiCommand' || e.id === 'aiInspect')) {
        const note = t('ux37.notConfigured')
        return { ...e, note, hay: `${e.hay} ${note}`.toLowerCase() }
      }
      return e
    })
    const group = fileGroup
    const profiles = loadSyncProfiles().map((p) => {
      const label = t('d2.runProfile', { name: p.name })
      return {
        id: 'folderSync' as const,
        syncId: p.id,
        label,
        group,
        category: 'file' as const,
        order: 10_000,
        hay: `${label} ${group} ${p.name} folder sync`.toLowerCase()
      }
    })
    return [...base, ...profiles].map((e) => {
      const note = notes?.[e.id]
      return note ? { ...e, note, disabled: true } : e
    })
  }, [aiReady, locale, notes, open, t])
  const usage = useMemo(() => (open ? loadPaletteUsage() : {}), [open])
  const laid = useMemo(() => layoutPalette(entries, q, usage), [entries, q, usage])
  const filtered = laid.items

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
    if (!e || e.disabled) return
    onClose()
    recordPaletteUse(e.id)
    window.setTimeout(() => {
      if (e.syncId) armFolderSync(e.syncId)
      onAction(e.id)
    }, 0)
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
          {filtered.length === 0 ? (
            <div className="cmdp-empty">
              {t('cmdp.empty', { q })}
              <div className="l7-muted">{t('cmdp.pinyinHint')}</div>
            </div>
          ) : null}
          {laid.rows.map((row) => {
            if (row.kind === 'header') {
              const key = CAT_KEY[row.id]
              return (
                <div key={`h-${row.id}`} className="cmdp-head">
                  {key ? t(key) : row.id}
                </div>
              )
            }
            const e = row.item
            const i = filtered.indexOf(e)
            return (
              <button
                key={e.syncId || `${e.id}-${e.order}`}
                type="button"
                role="option"
                aria-selected={i === sel}
                aria-disabled={e.disabled || undefined}
                className={`cmdp-item${i === sel ? ' is-active' : ''}${e.disabled ? ' is-disabled' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => run(e)}
              >
                <span className="cmdp-label">{e.label}</span>
                <span className="cmdp-group">{e.note ? e.note : t(CAT_KEY[e.category] ?? 'palette.cat.help')}</span>
                {e.shortcut ? <kbd className="cmdp-kbd">{e.shortcut}</kbd> : null}
              </button>
            )
          })}
        </div>
        <div className="cmdp-foot">{t('cmdp.hint')}</div>
      </div>
    </div>
  )
}
