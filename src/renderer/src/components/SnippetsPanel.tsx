import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import type { CommandSnippet } from '@shared/ipc'
import { dispatchInjectTerminal } from '../lib/terminal-inject'
import {
  buildSnippetsExport,
  extractSnippetVars,
  fillSnippetVars,
  filterSnippets,
  mergeSnippetsImport
} from '@shared/workspace-features'
import { tg } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { toastUndo } from '../lib/dialogs'
import EmptyState from './EmptyState'
import Icon from './Icon'
import Modal from './Modal'

type Props = {
  activeSessionId: string | null
  variant?: 'center' | 'rail'
  launch?: { n: number; focusSearch?: boolean; openForm?: boolean; seed?: string }
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
  const { t } = useI18n()
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
  const [more, setMore] = useState(false)
  const [pending, setPending] = useState<{ snippet: CommandSnippet; execute: boolean; vars: string[] } | null>(null)
  const [varValues, setVarValues] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getSnippetsApi().list()
      setItems(Array.isArray(list) ? list : [])
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
  }, [load])

  useEffect(() => {
    if (!launch?.n) return
    if (launch.openForm) {
      setFormOpen(true)
      setEditingId(null)
      setTitle('')
      if (launch.seed) setBody(launch.seed)
    }
    if (launch.focusSearch) {
      window.setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [launch])

  const persist = async (next: CommandSnippet[]) => {
    setSaving(true)
    setError(null)
    try {
      await getSnippetsApi().save(next)
      setItems(next)
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
    setEditingId(s.id)
    setTitle(s.title)
    setBody(s.body)
  }

  const onSaveForm = async () => {
    const tt = title.trim()
    const b = body
    if (!tt || !b.trim()) {
      setError(t('snip.needTitleBody'))
      return
    }
    const next = editingId
      ? items.map((s) => (s.id === editingId ? { ...s, title: tt, body: b } : s))
      : [...items, { id: newId(), title: tt, body: b }]
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
      {error ? <p className="l2-error">{error}</p> : null}
      <div className="workspace-panel-actions">
        <button type="button" disabled={saving} onClick={resetForm}>{t('snip.cancel')}</button>
        <button type="button" className="primary" disabled={saving} onClick={() => void onSaveForm()}>{t('snip.save')}</button>
      </div>
    </div>
  ) : null

  const rail = variant === 'rail'
  return (
    <div className={`workspace-panel workspace-panel--settings${rail ? ' snippets-rail' : ''}`} data-testid="snippets-panel" data-variant={variant}>
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{t('snip.titleN', { n: items.length })}</h2>
        <div className="workspace-panel-actions">
          {rail ? null : <button type="button" className="primary" data-testid="snip-new" onClick={openNew}>{t('snip.newBtn')}</button>}
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
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings workspace-panel-inner--snippets">
          {notice ? <p className="l7-meta">{notice}</p> : null}
          <input ref={searchRef} data-testid="snip-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('snip.searchPh')} aria-label={t('snip.search')} />
          {!editingId && formOpen ? form : null}

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
                  <button type="button" className="primary" onClick={confirmVars}>
                    {pending.execute ? t('snip.injectRun') : t('snip.inject')}
                  </button>
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

          {items.length > 0 && visible.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('snip.noMatch')}</p>
          ) : null}
          {loading ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('snip.loading')}</p> : null}
          {!loading && items.length === 0 ? (
            <EmptyState
              compact
              testId="snippets-empty"
              icon={<Icon name="clipboard-list" size={32} strokeWidth={1.5} />}
              title={t('pf4.snipTitle')}
              desc={t('pf4.snipDesc')}
              primary={{ label: t('ux08.snipNew'), onClick: openNew, testId: 'snip-new' }}
            />
          ) : null}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((s) => (
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
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{s.title}</div>
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
                  <button
                    type="button"
                    className="primary"
                    disabled={!activeSessionId}
                    title={activeSessionId ? t('snip.injectTip') : t('snip.noTerminal')}
                    onClick={() => onInject(s, false)}
                  >
                    {t('snip.inject')}
                  </button>
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
            ))}
          </ul>
        </div>
      </div>
      {rail && items.length > 0 ? (
        <div className="snippets-rail-foot">
          <button type="button" className="secondary" data-testid="snip-new" onClick={openNew}>{t('ux08.snipNew')}</button>
        </div>
      ) : null}
    </div>
  )
}
