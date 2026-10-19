import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import type { CommandSnippet } from '@shared/ipc'
import { dispatchInjectTerminal } from '../lib/terminal-inject'
import {
  BUILTIN_SNIPPETS,
  builtinSnippetById,
  localizeBuiltin,
  saveAsSnippet,
  stripBuiltinSnippets,
  type LibrarySeg
} from '@shared/builtin-pack'
import {
  buildSnippetsExport,
  extractSnippetVars,
  fillSnippetVars,
  filterSnippets,
  mergeSnippetsImport
} from '@shared/workspace-features'
import {
  eventToHotkeyString,
  normalizeSnippetHotkey,
  notifySnippetsChanged,
  snippetHotkeyConflictsKeymap,
  snippetHotkeyConflictsPeer,
  suggestSnippetHotkey
} from '@shared/snippet-hotkey'
import { tg } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { toastUndo } from '../lib/dialogs'
import EmptyState from './EmptyState'
import Modal from './Modal'
import PanelHeader from './ui/PanelHeader'
import Button from './ui/Button'

type Props = {
  activeSessionId: string | null
  variant?: 'center' | 'rail'
  launch?: { n: number; focusSearch?: boolean; openForm?: boolean; seed?: string; previewBuiltin?: boolean }
}

type SnippetsApi = {
  list: () => Promise<CommandSnippet[]>
  save: (list: CommandSnippet[]) => Promise<void>
}

function getSnippetsApi(): SnippetsApi {
  const api = (window.aiss as unknown as { snippets?: SnippetsApi }).snippets
  if (!api?.list || !api?.save) {
    throw new Error(tg('ui.274'))
  }
  return api
}

function newId(): string {
  return crypto.randomUUID()
}

export default function SnippetsPanel({ activeSessionId, variant = 'rail', launch }: Props) {
  const { t, locale } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [items, setItems] = useState<CommandSnippet[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [seg, setSeg] = useState<LibrarySeg>('all')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [pending, setPending] = useState<{ snippet: CommandSnippet; execute: boolean; vars: string[] } | null>(null)
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [hotkey, setHotkey] = useState('')
  const [hotkeyConflict, setHotkeyConflict] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getSnippetsApi().list()
      setItems(stripBuiltinSnippets(Array.isArray(list) ? list : []))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    setEditingId(null)
    setTitle('')
    setBody('')
    setHotkey('')
    setHotkeyConflict(null)
  }, [load])

  useEffect(() => {
    if (!launch?.n) return
    if (launch.openForm) {
      setFormOpen(true)
      setEditingId(null)
      setTitle('')
      setHotkey('')
      setHotkeyConflict(null)
      if (launch.seed) setBody(launch.seed)
    }
    if (launch.previewBuiltin) {
      setSeg('builtin')
      setPreviewId(BUILTIN_SNIPPETS[0]?.id ?? null)
      setFormOpen(false)
      setEditingId(null)
    }
    if (launch.focusSearch) {
      window.setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [launch])

  const persist = async (next: CommandSnippet[]) => {
    const safe = stripBuiltinSnippets(next)
    setSaving(true)
    setError(null)
    try {
      await getSnippetsApi().save(safe)
      setItems(safe)
      notifySnippetsChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setBody('')
    setHotkey('')
    setHotkeyConflict(null)
    setFormOpen(false)
  }

  const openNew = () => {
    if (editingId || (formOpen && (title || body))) {
      setError(t('snip.oneEditor'))
      return
    }
    resetForm()
    setFormOpen(true)
  }

  const onEdit = (s: CommandSnippet) => {
    if (builtinSnippetById(s.id)) {
      setPreviewId(s.id)
      setFormOpen(false)
      setEditingId(null)
      return
    }
    setPreviewId(null)
    setEditingId(s.id)
    setTitle(s.title)
    setBody(s.body)
    setHotkey(s.hotkey || '')
    setHotkeyConflict(null)
  }

  const onSaveAsBuiltin = async (id: string) => {
    const source = builtinSnippetById(id)
    if (!source) return
    const copy = saveAsSnippet(source, newId, undefined, locale)
    try {
      await persist([...items, copy])
      showToast(t('w9.savedAs', { name: copy.title }))
    } catch {
      /* error already set */
    }
  }

  const applyHotkeyDraft = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      setHotkey('')
      setHotkeyConflict(null)
      return
    }
    const n = normalizeSnippetHotkey(trimmed)
    if (!n) {
      setHotkey(trimmed)
      setHotkeyConflict(t('snip.hotkeyInvalid'))
      return
    }
    setHotkey(n)
    const km = snippetHotkeyConflictsKeymap(n)
    if (km) {
      setHotkeyConflict(t('snip.hotkeyTakenApp', { action: km }))
      return
    }
    const peer = snippetHotkeyConflictsPeer(n, items, editingId)
    if (peer) {
      setHotkeyConflict(t('snip.hotkeyTakenPeer', { title: peer.title }))
      return
    }
    setHotkeyConflict(null)
  }

  const onSaveForm = async () => {
    const tt = title.trim()
    const b = body
    if (!tt || !b.trim()) {
      setError(t('snip.needTitleBody'))
      return
    }
    let hk: string | undefined
    if (hotkey.trim()) {
      const n = normalizeSnippetHotkey(hotkey)
      if (!n) {
        setError(t('snip.hotkeyInvalid'))
        return
      }
      if (snippetHotkeyConflictsKeymap(n)) {
        setError(t('snip.hotkeyTakenApp', { action: snippetHotkeyConflictsKeymap(n)! }))
        return
      }
      const peer = snippetHotkeyConflictsPeer(n, items, editingId)
      if (peer) {
        setError(t('snip.hotkeyTakenPeer', { title: peer.title }))
        return
      }
      hk = n
    }
    const next = editingId
      ? items.map((s) => {
          if (s.id !== editingId) return s
          const row: CommandSnippet = { ...s, title: tt, body: b }
          if (hk) row.hotkey = hk
          else delete row.hotkey
          return row
        })
      : [...items, { id: newId(), title: tt, body: b, ...(hk ? { hotkey: hk } : {}) }]
    try {
      await persist(next)
      resetForm()
    } catch {
      /* error already set */
    }
  }

  const onDelete = async (id: string) => {
    const idx = items.findIndex((s) => s.id === id)
    const removed = items[idx]
    if (!removed) return
    const next = items.filter((s) => s.id !== id)
    try {
      await persist(next)
      if (editingId === id) resetForm()
      toastUndo({
        message: t('snip.deleted', { name: removed.title }),
        undo: async () => {
          const list = await getSnippetsApi().list()
          const restored = Array.isArray(list) ? [...list] : []
          restored.splice(Math.min(idx, restored.length), 0, removed)
          await getSnippetsApi().save(restored)
          await load()
        }
      })
    } catch {
      /* error already set */
    }
  }

  const finishInject = (sessionId: string, text: string, execute: boolean) => {
    dispatchInjectTerminal(sessionId, text, execute)
    showToast(t('snip.inserted'))
    window.dispatchEvent(new CustomEvent('aiss-focus-terminal', { detail: { sessionId } }))
  }

  const onInject = (s: CommandSnippet, execute: boolean) => {
    if (!activeSessionId) {
      setError(t('snip.needSession'))
      return
    }
    setError(null)
    const vars = extractSnippetVars(s.body)
    if (vars.length) {
      setPending({ snippet: s, execute, vars })
      setVarValues(Object.fromEntries(vars.map((v) => [v, ''])))
      return
    }
    finishInject(activeSessionId, s.body, execute)
  }

  const confirmVars = () => {
    if (!pending || !activeSessionId) return
    if (pending.vars.some((v) => !varValues[v]?.trim())) {
      setError(t('snip.needVars'))
      return
    }
    finishInject(activeSessionId, fillSnippetVars(pending.snippet.body, varValues), pending.execute)
    setPending(null)
    setError(null)
  }

  const visible = filterSnippets(items, query)
  const localizedBuiltins = BUILTIN_SNIPPETS.map((row) => localizeBuiltin(row, locale))
  const builtinVisible = localizedBuiltins.filter((row) => filterSnippets([{ title: row.title, body: `${row.summary}\n${row.body}` }], query).length > 0)
  const showBuiltin = seg !== 'mine'
  const showMine = seg !== 'builtin'
  const preview = previewId ? localizedBuiltins.find((row) => row.id === previewId) : undefined

  const onExport = () => {
    const blob = new Blob([buildSnippetsExport(items)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ai-ssh-pro-snippets.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    setNotice(null)
    setError(null)
    const merged = mergeSnippetsImport(items, await file.text(), newId)
    if (!merged) {
      setError(t('snip.importBad'))
      return
    }
    try {
      if (merged.added) await persist(merged.list)
      setNotice(t('snip.imported', { added: String(merged.added), skipped: String(merged.skipped) }))
    } catch {
      /* error already set */
    }
  }

  const form = formOpen || editingId ? (
    <div className="snip-form" data-testid="snip-form">
      <div className="field">
        <label htmlFor="snippet-title">{t('snip.fieldTitle')}</label>
        <input id="snippet-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('snip.titlePh')} />
      </div>
      <div className="field snip-body">
        <label htmlFor="snippet-body">{t('snip.fieldBody')}</label>
        <textarea id="snippet-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="df -h" />
        <span title={t('snip.varHint')}>ⓘ</span>
      </div>
      <div className="field" data-testid="snip-hotkey-field">
        <label htmlFor="snippet-hotkey">{t('snip.fieldHotkey')}</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            id="snippet-hotkey"
            data-testid="snip-hotkey"
            value={hotkey}
            placeholder={t('snip.hotkeyPh')}
            readOnly
            onKeyDown={(e) => {
              if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape') {
                e.preventDefault()
                applyHotkeyDraft('')
                return
              }
              if (e.key === 'Tab') return
              e.preventDefault()
              e.stopPropagation()
              const chord = eventToHotkeyString(e)
              if (chord) applyHotkeyDraft(chord)
            }}
          />
          <button
            type="button"
            data-testid="snip-hotkey-suggest"
            disabled={saving}
            onClick={() => {
              const s = suggestSnippetHotkey(items, editingId)
              if (!s) {
                setHotkeyConflict(t('snip.hotkeyNoFree'))
                return
              }
              applyHotkeyDraft(s)
            }}
          >
            {t('snip.hotkeySuggest')}
          </button>
          <button type="button" disabled={!hotkey || saving} onClick={() => applyHotkeyDraft('')}>
            {t('snip.hotkeyClear')}
          </button>
        </div>
        <p className="l7-meta" style={{ margin: '4px 0 0' }}>{t('snip.hotkeyHint')}</p>
        {hotkeyConflict ? <p className="l2-error" data-testid="snip-hotkey-conflict">{hotkeyConflict}</p> : null}
      </div>
      {error ? <p className="l2-error">{error}</p> : null}
      <div className="workspace-panel-actions">
        <button type="button" disabled={saving} onClick={resetForm}>{t('snip.cancel')}</button>
        <Button variant="primary" disabled={saving} onClick={() => void onSaveForm()}>{t('snip.save')}</Button>
      </div>
    </div>
  ) : null

  const rail = variant === 'rail'
  return (
    <div className={`workspace-panel workspace-panel--settings${rail ? ' snippets-rail' : ''}`} data-testid="snippets-panel" data-variant={variant}>
      <PanelHeader
        title={
          <>
            {t('snip.titleN', { n: items.length })}
          </>
        }
        actions={
          <>
            {rail ? null : <Button variant="primary" data-testid="snip-new" onClick={openNew}>{t('snip.newBtn')}</Button>}
            <button type="button" aria-label={t('w2.more')} onClick={() => setMore((v) => !v)}>⋯</button>
            {more ? (
              <span className="snip-more">
                <button type="button" onClick={() => fileRef.current?.click()}>{t('snip.import')}</button>
                <button type="button" disabled={items.length === 0} title={items.length === 0 ? t('snip.exportEmpty') : undefined} onClick={onExport}>{t('snip.export')}</button>
              </span>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                void onImportFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </>
        }
      />
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings workspace-panel-inner--snippets">
          {notice ? <p className="l7-meta">{notice}</p> : null}
          <input ref={searchRef} data-testid="snip-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('snip.searchPh')} aria-label={t('snip.search')} />
          <div className="w9-seg" data-testid="w9-snip-seg" role="tablist">
            {(['all', 'builtin', 'mine'] as const).map((id) => (
              <button key={id} type="button" aria-pressed={seg === id} onClick={() => setSeg(id)}>
                {t(id === 'all' ? 'w9.all' : id === 'builtin' ? 'w9.sectionBuiltin' : 'w9.sectionMine')}
              </button>
            ))}
          </div>
          {!editingId && formOpen ? form : null}
          {preview ? (
            <div className="w9-preview" data-testid="w9-snip-preview" data-builtin="true">
              <div className="w9-preview-head">
                <strong>{preview.title}</strong>
                <span className="w9-badge" data-testid="w9-builtin-badge">{t('w9.builtin')}</span>
                <span className="w9-note">{t('w9.noAuto')}</span>
              </div>
              <p className="l7-meta">{preview.summary}</p>
              <pre>{preview.body}</pre>
              <div className="w9-row-actions">
                <button type="button" data-testid="w9-snip-save-as" disabled={saving} onClick={() => void onSaveAsBuiltin(preview.id)}>{t('w9.saveAs')}</button>
                <button type="button" onClick={() => setPreviewId(null)}>{t('snip.cancel')}</button>
              </div>
            </div>
          ) : null}

          <Modal
            open={Boolean(pending)}
            title={pending ? t('snip.fillVars', { title: pending.snippet.title }) : ''}
            onClose={() => setPending(null)}
            width={420}
            testId="snip-vars"
            footer={
              pending ? (
                <>
                  <button type="button" onClick={() => setPending(null)}>{t('snip.cancel')}</button>
                  <Button variant="primary" onClick={confirmVars}>
                    {pending.execute ? t('snip.injectRun') : t('snip.inject')}
                  </Button>
                </>
              ) : null
            }
          >
            {pending
              ? pending.vars.map((v, idx) => (
                  <div className="field" key={v}>
                    <label htmlFor={`snippet-var-${v}`}>{v}</label>
                    <input
                      id={`snippet-var-${v}`}
                      autoFocus={idx === 0}
                      value={varValues[v] ?? ''}
                      onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmVars()
                      }}
                    />
                  </div>
                ))
              : null}
          </Modal>

          {items.length > 0 && visible.length === 0 && builtinVisible.length === 0 ? (
            <EmptyState compact icon="snippet" title={t('snip.noMatch')} testId="snippets-nomatch" />
          ) : null}
          {loading ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('snip.loading')}</p> : null}
          {!loading && items.length === 0 && seg !== 'builtin' ? (
            <EmptyState
              compact
              testId="snippets-empty"
              icon="snippet"
              title={t('pf4.snipTitle')}
              desc={t('snip.cmdkHint')}
              primary={{ label: t('ux08.snipNew'), onClick: openNew, testId: 'snip-new' }}
              secondary={[{
                label: t('w9.try'),
                testId: 'w9-try-snippet',
                onClick: () => {
                  setSeg('builtin')
                  setPreviewId(BUILTIN_SNIPPETS[0]?.id ?? null)
                }
              }]}
            />
          ) : null}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {showBuiltin ? builtinVisible.map((s) => (
              <li
                key={s.id}
                data-testid="w9-builtin-snippet"
                data-builtin="true"
                onDoubleClick={() => setPreviewId(s.id)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: 10,
                  background: 'var(--bg)',
                  minWidth: 0
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <span className="w9-badge">{t('w9.builtin')}</span>
                </div>
                <div className="l7-meta" style={{ marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.summary}</div>
                <div className="w9-row-actions">
                  <button type="button" data-testid="w9-snip-open" onClick={() => setPreviewId(s.id)}>{t('w9.preview')}</button>
                  <button type="button" disabled={saving} onClick={() => void onSaveAsBuiltin(s.id)}>{t('w9.saveAs')}</button>
                  <button
                    type="button"
                    disabled={!activeSessionId}
                    title={activeSessionId ? t('snip.injectTip') : t('snip.noTerminal')}
                    onClick={() => onInject(s, false)}
                  >
                    {t('snip.inject')}
                  </button>
                </div>
              </li>
            )) : null}
            {showMine ? visible.map((s) => (
              editingId === s.id ? <li key={s.id}>{form}</li> :
              <li
                key={s.id}
                onDoubleClick={() => onInject(s, false)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: 10,
                  background: 'var(--bg)'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  {s.hotkey ? <kbd className="cmdp-kbd" data-testid="snip-hotkey-badge">{s.hotkey}</kbd> : null}
                </div>
                <pre
                  style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--muted)',
                    maxHeight: 72,
                    overflow: 'auto'
                  }}
                >
                  {s.body}
                </pre>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button variant="primary"
                    disabled={!activeSessionId}
                    title={activeSessionId ? t('snip.injectTip') : t('snip.noTerminal')}
                    onClick={() => onInject(s, false)}
                  >
                    {t('snip.inject')}
                  </Button>
                  <button
                    type="button"
                    disabled={!activeSessionId}
                    title={activeSessionId ? t('snip.injectRunTip') : t('snip.noTerminal')}
                    onClick={() => onInject(s, true)}
                  >
                    {t('snip.injectRun')}
                  </button>
                  <button type="button" onClick={() => onEdit(s)}>
                    {t('snip.editBtn')}
                  </button>
                  <button type="button" disabled={saving} onClick={() => void onDelete(s.id)}>
                    {t('snip.delete')}
                  </button>
                </div>
              </li>
            )) : null}
          </ul>
        </div>
      </div>
      {rail && items.length > 0 ? (
        <div className="snippets-rail-foot">
          <Button variant="secondary" data-testid="snip-new" onClick={openNew}>{t('ux08.snipNew')}</Button>
        </div>
      ) : null}
    </div>
  )
}
