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

type Props = {
  onClose: () => void
  activeSessionId: string | null
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

export default function SnippetsPanel({ onClose, activeSessionId }: Props) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [items, setItems] = useState<CommandSnippet[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
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
    const next = items.filter((s) => s.id !== id)
    try {
      await persist(next)
      if (editingId === id) resetForm()
    } catch {
      /* error already set */
    }
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
    dispatchInjectTerminal(activeSessionId, s.body, execute)
  }

  const confirmVars = () => {
    if (!pending || !activeSessionId) return
    if (pending.vars.some((v) => !varValues[v]?.trim())) {
      setError(t('snip.needVars'))
      return
    }
    dispatchInjectTerminal(activeSessionId, fillSnippetVars(pending.snippet.body, varValues), pending.execute)
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

  return (
    <div className="workspace-panel workspace-panel--settings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{t('snip.title')}</h2>
        <div className="workspace-panel-actions">
          <button type="button" disabled={items.length === 0} onClick={onExport}>
            {t('snip.export')}
          </button>
          <button type="button" disabled={saving} onClick={() => fileRef.current?.click()}>
            {t('snip.import')}
          </button>
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
          <button type="button" onClick={onClose}>
            {t('snip.close')}
          </button>
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings workspace-panel-inner--snippets">
          {error ? (
            <p style={{ margin: '0 0 10px', color: 'var(--danger, #f85149)', fontSize: 12 }}>{error}</p>
          ) : null}
          {notice ? <p style={{ margin: '0 0 10px', color: 'var(--accent, #3fb950)', fontSize: 12 }}>{notice}</p> : null}

          <h3 className="modal-section-title">{editingId ? t('snip.edit') : t('snip.new')}</h3>
          <div className="field">
            <label htmlFor="snippet-title">{t('snip.fieldTitle')}</label>
            <input
              id="snippet-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('snip.titlePh')}
            />
          </div>
          <div className="field">
            <label htmlFor="snippet-body">{t('snip.fieldBody')}</label>
            <textarea
              id="snippet-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="df -h"
              style={{ width: '100%', resize: 'vertical', minHeight: 72 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button type="button" className="primary" disabled={saving} onClick={() => void onSaveForm()}>
              {editingId ? t('snip.saveEdit') : t('snip.add')}
            </button>
            {editingId ? (
              <button type="button" disabled={saving} onClick={resetForm}>
                {t('snip.cancelEdit')}
              </button>
            ) : null}
          </div>

          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
            {t('snip.varHint')}
          </p>

          {pending ? (
            <div className="snippet-vars" style={{ border: '1px solid var(--accent, #388bfd)', borderRadius: 6, padding: 10, marginBottom: 16 }}>
              <h3 className="modal-section-title">{t('snip.fillVars', { title: pending.snippet.title })}</h3>
              {pending.vars.map((v, idx) => (
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
              ))}
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: 'var(--muted)', margin: '0 0 8px' }}>
                {fillSnippetVars(pending.snippet.body, Object.fromEntries(Object.entries(varValues).filter(([, x]) => x)))}
              </pre>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="primary" onClick={confirmVars}>
                  {pending.execute ? t('snip.injectRun') : t('snip.inject')}
                </button>
                <button type="button" onClick={() => setPending(null)}>
                  {t('snip.cancel')}
                </button>
              </div>
            </div>
          ) : null}

          <h3 className="modal-section-title">{t('snip.saved', { n: String(items.length) })}</h3>
          {items.length > 0 ? (
            <div className="field">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('snip.searchPh')}
                aria-label={t('snip.search')}
              />
            </div>
          ) : null}
          {items.length > 0 && visible.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('snip.noMatch')}</p>
          ) : null}
          {loading ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('snip.loading')}</p> : null}
          {!loading && items.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('snip.empty')}</p>
          ) : null}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((s) => (
              <li
                key={s.id}
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
    </div>
  )
}
