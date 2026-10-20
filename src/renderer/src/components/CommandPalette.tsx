import { useEffect, useMemo, useRef, useState } from 'react'
import { useOverlayFocusRestore } from '../lib/focus-restore'
import { menuLabel } from '@shared/menus'
import { useI18n } from '../lib/i18n'
import { loadSmartPrefs } from '../lib/smart-history'
import { armFolderSync } from '../lib/sftp-activity'
import { MENUS, type TitlebarMenuAction } from './TitlebarMenus'
import { loadSyncProfiles } from './SftpPanel'
import { buildPaletteEntries, type PaletteEntry } from '../lib/palette'
import { layoutPalette } from '@shared/palette-rank'
import { paletteItemIndexes, paletteKeyStep, secondNavOrder } from '@shared/palette-nav'
import { loadPaletteUsage, recordPaletteUse } from '../lib/palette-usage'
import EmptyState from './EmptyState'
import Icon from './Icon'
import { EMPTY_ICON_SIZE_COMPACT, EMPTY_ICON_STROKE } from './emptyIcons'
import { BUILTIN_SNIPPETS, localizeBuiltin } from '@shared/builtin-pack'
import { dispatchInjectTerminal } from '../lib/terminal-inject'
import { showToast } from '../lib/toast'
import type { CommandSnippet } from '@shared/ipc'
import { parseQuickTarget, quickTargetLabel } from '@shared/quick-connect'

type Props = {
  open: boolean
  onClose: () => void
  onAction: (action: TitlebarMenuAction) => void
  /** UX-37: AI actions note "not set up" until a key exists */
  aiReady?: boolean
  /** Grey reason shown beside an action that cannot run yet. */
  notes?: Partial<Record<string, string>>
  /** Active terminal for Ctrl+K → insert snippet */
  activeSessionId?: string | null
  /** Saved / recent hosts for one-click open */
  hostEntries?: Array<{
    id: string
    label: string
    host: string
    username: string
    port: number
    recent?: boolean
  }>
  onOpenHost?: (profileId: string) => void
  /** D13b: user@host:port / pasted ssh command */
  onQuickTarget?: (text: string) => void
}

type Entry = PaletteEntry

/** Ctrl+K second nav. These four groups stay visually distinct; the rest of the palette still lists under them. */
const PRIMARY_NAV = new Set<string>(secondNavOrder(['connection', 'session', 'ops', 'file', 'ai', 'view', 'settings', 'help']))

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

export default function CommandPalette({ open, onClose, onAction, aiReady = true, notes, activeSessionId = null, hostEntries = [], onOpenHost, onQuickTarget }: Props) {
  const { t, locale } = useI18n()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [snipList, setSnipList] = useState<CommandSnippet[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useOverlayFocusRestore(open)

  useEffect(() => {
    if (!open) return
    void window.aiss.snippets
      .list()
      .then((list) => setSnipList(Array.isArray(list) ? list : []))
      .catch(() => setSnipList([]))
  }, [open])

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
      if (!aiReady && (e.id === 'aiExplainError' || e.id === 'aiCommand' || e.id === 'aiInspect' || e.id === 'explainSelection')) {
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
    const snipGroup = t('snip.titleN', { n: snipList.length })
    const mine = snipList.map((s, i) => {
      const label = t('cmdp.insertSnip', { title: s.title })
      return {
        id: 'snippets' as const,
        snippetId: s.id,
        snippetBody: s.body,
        label,
        group: snipGroup,
        category: 'session' as const,
        order: 20_000 + i,
        shortcut: s.hotkey,
        hay: `${label} ${s.title} ${s.body} ${s.hotkey || ''} snippet pianduan insert`.toLowerCase()
      }
    })
    const builtins = BUILTIN_SNIPPETS.map((s, i) => {
      const loc = localizeBuiltin(s, locale)
      const label = t('cmdp.insertBuiltin', { title: loc.title })
      return {
        id: 'snippets' as const,
        snippetId: s.id,
        snippetBody: loc.body,
        label,
        group: snipGroup,
        category: 'session' as const,
        order: 21_000 + i,
        hay: `${label} ${loc.title} ${loc.body} ${loc.summary} builtin snippet`.toLowerCase()
      }
    })
    const hostGroup = t('cmdp.hosts')
    const hosts = hostEntries.map((h, i) => {
      const name = h.label || `${h.username}@${h.host}`
      const label = h.recent ? t('cmdp.openRecent', { name }) : t('cmdp.openHost', { name })
      return {
        id: 'connection' as const,
        sessionProfileId: h.id,
        label,
        group: hostGroup,
        category: 'connection' as const,
        order: (h.recent ? 50 : 400) + i,
        hay: `${label} ${name} ${h.host} ${h.username} ${h.port} host session ssh recent`.toLowerCase()
      }
    })
    return [...hosts, ...base, ...profiles, ...mine, ...builtins].map((e) => {
      if ('snippetId' in e && e.snippetId) return e
      const note = notes?.[e.id]
      return note ? { ...e, note, disabled: true } : e
    })
  }, [aiReady, hostEntries, locale, notes, open, snipList, t])
  const usage = useMemo(() => (open ? loadPaletteUsage() : {}), [open])
  const laid = useMemo(() => {
    const qt = onQuickTarget ? parseQuickTarget(q) : null
    if (!qt) return layoutPalette(entries, q, usage)
    const label = t('d13.connect', { target: quickTargetLabel(qt) })
    const qc: Entry = { id: 'connection', quickText: q, label, group: t('cmdp.hosts'), category: 'connection', order: 0, hay: `${q} ${label}`.toLowerCase() } as Entry
    return layoutPalette([qc, ...entries], q, usage)
  }, [entries, q, usage, onQuickTarget, t])
  const filtered = laid.items
  const indexes = paletteItemIndexes(laid.rows)

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
    if (!e.quickText) recordPaletteUse(e.sessionProfileId ? `host:${e.sessionProfileId}` : e.snippetId ? `snip:${e.snippetId}` : e.id)
    window.setTimeout(() => {
      if (e.snippetId && e.snippetBody != null) {
        if (!activeSessionId) {
          showToast(t('snip.needSession'))
          return
        }
        dispatchInjectTerminal(activeSessionId, e.snippetBody, false)
        showToast(t('snip.inserted'))
        return
      }
      if (e.quickText) {
        onQuickTarget?.(e.quickText)
        return
      }
      if (e.sessionProfileId) {
        onOpenHost?.(e.sessionProfileId)
        return
      }
      if (e.syncId) armFolderSync(e.syncId)
      onAction(e.id)
    }, 0)
  }
  return (
    <div className="cmdp-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="cmdp" role="dialog" aria-label={t('cmdp.title')} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          spellCheck={false}
          className="cmdp-input"
          placeholder={t('cmdp.placeholder')}
          aria-label={t('cmdp.title')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // P39: IME candidate Enter must not run / pick
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            const step = paletteKeyStep(e.key, sel, filtered.length)
            if (step.type === 'noop') return
            e.preventDefault()
            if (step.type === 'move') setSel(step.index)
            else if (step.type === 'run') run(filtered[sel])
            else if (step.type === 'clear') setQ('')
            else if (step.type === 'close') {
              e.stopPropagation()
              onClose()
            }
          }}
        />
        <div className="cmdp-list" role="listbox" ref={listRef}>
          {filtered.length === 0 ? (
            <EmptyState
              compact
              testId="palette-empty"
              icon={<Icon name="search" size={EMPTY_ICON_SIZE_COMPACT} strokeWidth={EMPTY_ICON_STROKE} />}
              title={t('pf4.paletteTitle', { q: q.trim().slice(0, 12) })}
              desc={t('pf4.paletteDesc')}
              primary={{ label: t('pf4.paletteClear'), onClick: () => setQ('') }}
            />
          ) : null}
          {(() => {
            // Rows under a group header don't repeat the group name; notes (e.g. host) still show.
            const grouped = laid.rows.some((r) => r.kind === 'header')
            return laid.rows.map((row, rowAt) => {
            if (row.kind === 'header') {
              const key = CAT_KEY[row.id]
              return (
                <div key={`h-${row.id}`} className={`cmdp-head${PRIMARY_NAV.has(row.id) ? ' cmdp-head--nav' : ''}`} data-palette-group={row.id}>
                  {key ? t(key) : row.id}
                </div>
              )
            }
            const e = row.item
            const i = indexes[rowAt] ?? 0
            return (
              <button
                key={`${e.syncId ?? e.id}-${e.order}-${i}`}
                type="button"
                role="option"
                aria-selected={i === sel}
                aria-disabled={e.disabled || undefined}
                className={`cmdp-item${i === sel ? ' is-active' : ''}${e.disabled ? ' is-disabled' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => run(e)}
              >
                <span className="cmdp-label">{e.label}</span>
                {e.note || !grouped ? (
                  <span className="cmdp-group">{e.note ? e.note : t(CAT_KEY[e.category] ?? 'palette.cat.help')}</span>
                ) : null}
                {e.shortcut ? <kbd className="cmdp-kbd">{e.shortcut}</kbd> : null}
              </button>
            )
            })
          })()}
        </div>
        <div className="cmdp-foot">{t('cmdp.hint')} · {t('cmdp.snipHint')}</div>
      </div>
    </div>
  )
}
