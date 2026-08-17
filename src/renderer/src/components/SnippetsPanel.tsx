import { useCallback, useEffect, useState } from 'react'
import type { CommandSnippet } from '@shared/ipc'
import { dispatchInjectTerminal } from '../lib/terminal-inject'

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
    throw new Error('snippets API 尚未接线（Phase2：window.aiss.snippets）')
  }
  return api
}

function newId(): string {
  return crypto.randomUUID()
}

export default function SnippetsPanel({ onClose, activeSessionId }: Props) {
  const [items, setItems] = useState<CommandSnippet[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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
    const t = title.trim()
    const b = body
    if (!t || !b.trim()) {
      setError('请填写标题与命令内容')
      return
    }
    const next = editingId
      ? items.map((s) => (s.id === editingId ? { ...s, title: t, body: b } : s))
      : [...items, { id: newId(), title: t, body: b }]
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
      setError('请先打开一个终端会话再注入命令')
      return
    }
    setError(null)
    dispatchInjectTerminal(activeSessionId, s.body, execute)
  }

  return (
    <div className="workspace-panel workspace-panel--settings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">命令片段</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings workspace-panel-inner--snippets">
          {error ? (
            <p style={{ margin: '0 0 10px', color: 'var(--danger, #f85149)', fontSize: 12 }}>{error}</p>
          ) : null}

          <h3 className="modal-section-title">{editingId ? '编辑片段' : '新建片段'}</h3>
          <div className="field">
            <label htmlFor="snippet-title">标题</label>
            <input
              id="snippet-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：查看磁盘"
            />
          </div>
          <div className="field">
            <label htmlFor="snippet-body">命令</label>
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
              {editingId ? '保存修改' : '添加'}
            </button>
            {editingId ? (
              <button type="button" disabled={saving} onClick={resetForm}>
                取消编辑
              </button>
            ) : null}
          </div>

          <h3 className="modal-section-title">已保存（{items.length}）</h3>
          {loading ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>加载中…</p> : null}
          {!loading && items.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>暂无片段，添加后可一键注入当前终端。</p>
          ) : null}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((s) => (
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
                    title={activeSessionId ? '粘贴到当前终端' : '无活动终端'}
                    onClick={() => onInject(s, false)}
                  >
                    注入
                  </button>
                  <button
                    type="button"
                    disabled={!activeSessionId}
                    title={activeSessionId ? '注入并回车执行' : '无活动终端'}
                    onClick={() => onInject(s, true)}
                  >
                    注入并执行
                  </button>
                  <button type="button" onClick={() => onEdit(s)}>
                    编辑
                  </button>
                  <button type="button" disabled={saving} onClick={() => void onDelete(s.id)}>
                    删除
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
