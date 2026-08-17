import { useCallback, useEffect, useState } from 'react'
import type {
  HostInventoryIndexEntry,
  HostInventoryRecord,
  HostInventoryUpsertInput,
  HostService,
  HostServiceKind
} from '@shared/inventory'
import NotesMarkdownPreview from './NotesMarkdownPreview'
export type HostInventoryLink = {
  profileId?: string
  host?: string
  port?: number
  username?: string
  label?: string
  hostInventoryId?: string
}

type Props = {
  onClose: () => void
  link?: HostInventoryLink
  /** Called after successful upsert (e.g. sync profile.hostInventoryId) */
  onUpserted?: (rec: HostInventoryRecord) => void
}

type InventoryApi = {
  list: () => Promise<HostInventoryIndexEntry[]>
  get: (id: string) => Promise<HostInventoryRecord | null>
  search: (query: string) => Promise<HostInventoryIndexEntry[]>
  upsert: (input: HostInventoryUpsertInput) => Promise<HostInventoryRecord>
  remove: (id: string) => Promise<boolean>
  getRoot: () => Promise<string>
}

const SERVICE_KINDS: HostServiceKind[] = ['systemd', 'docker', 'k8s', 'binary', 'unknown']

function getInventoryApi(): InventoryApi {
  const api = (window.aiss as unknown as { inventory?: InventoryApi }).inventory
  if (!api?.list || !api?.get || !api?.search || !api?.upsert || !api?.remove || !api?.getRoot) {
    throw new Error('inventory API 尚未接线（window.aiss.inventory）')
  }
  return api
}

function emptyForm(link?: HostInventoryLink): {
  id: string | null
  title: string
  host: string
  port: string
  username: string
  profileId: string
  privateKeyPath: string
  tags: string
  env: string
  notesMarkdown: string
  services: HostService[]
} {
  return {
    id: link?.hostInventoryId?.trim() || null,
    title: link?.label?.trim() || '',
    host: link?.host?.trim() || '',
    port: String(link?.port ?? 22),
    username: link?.username?.trim() || '',
    profileId: link?.profileId?.trim() || '',
    privateKeyPath: '',
    tags: '',
    env: '',
    notesMarkdown: '',
    services: []
  }
}

export default function HostInventoryModal({ onClose, link, onUpserted }: Props) {
  /** 从会话右键打开：只编辑该主机，不显示档案列表 */
  const focused = Boolean(
    link && (link.hostInventoryId?.trim() || link.profileId?.trim() || link.host?.trim())
  )
  const [entries, setEntries] = useState<HostInventoryIndexEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState(() => emptyForm(link))
  const [searchQuery, setSearchQuery] = useState('')
  const [rootHint, setRootHint] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [svcDraft, setSvcDraft] = useState<{ name: string; kind: HostServiceKind; notes: string }>({
    name: '',
    kind: 'unknown',
    notes: ''
  })
  const [editingSvcIdx, setEditingSvcIdx] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState<'preview' | 'edit' | 'split'>('split')

  const notesChars = form.notesMarkdown.length
  const notesLines = form.notesMarkdown ? form.notesMarkdown.split(/\n/).length : 0

  const loadList = useCallback(async (query?: string) => {
    const api = getInventoryApi()
    const q = (query ?? searchQuery).trim()
    const list = q ? await api.search(q) : await api.list()
    setEntries(Array.isArray(list) ? list : [])
  }, [searchQuery])

  const applyRecord = useCallback((rec: HostInventoryRecord) => {
    setSelectedId(rec.meta.id)
    setForm({
      id: rec.meta.id,
      title: rec.meta.title || '',
      host: rec.meta.host || '',
      port: String(rec.meta.port ?? 22),
      username: rec.meta.username || '',
      profileId: rec.meta.profileId || '',
      privateKeyPath: rec.meta.privateKeyPath || '',
      tags: (rec.meta.tags || []).join(', '),
      env: rec.meta.env || '',
      notesMarkdown: rec.notesMarkdown || '',
      services: [...(rec.services || [])]
    })
    setEditingSvcIdx(null)
    setSvcDraft({ name: '', kind: 'unknown', notes: '' })
    const len = (rec.notesMarkdown || '').length
    setNotesMode(len > 800 ? 'preview' : len > 0 ? 'split' : 'edit')
  }, [])

  const loadRecord = useCallback(
    async (id: string) => {
      const api = getInventoryApi()
      const rec = await api.get(id)
      if (!rec) {
        setError(`未找到档案：${id}`)
        return
      }
      applyRecord(rec)
    },
    [applyRecord]
  )

  useEffect(() => {
    setError(null)
    setSearchQuery('')
    setEditingSvcIdx(null)
    setSvcDraft({ name: '', kind: 'unknown', notes: '' })
    setLoading(true)
    void (async () => {
      try {
        const api = getInventoryApi()
        const root = await api.getRoot()
        setRootHint(root || '')

        const preferId = link?.hostInventoryId?.trim()
        if (preferId) {
          const rec = await api.get(preferId)
          if (rec) {
            if (!focused) {
              const list = await api.list()
              setEntries(Array.isArray(list) ? list : [])
            } else {
              setEntries([])
            }
            applyRecord(rec)
            return
          }
        }

        if (focused) {
          setEntries([])
          const list = await api.list()
          const pid = link?.profileId?.trim()
          const host = link?.host?.trim().toLowerCase()
          const port = link?.port ?? 22
          const hit =
            (pid ? list.find((e) => e.profileId === pid) : undefined) ||
            (host
              ? list.find(
                  (e) => (e.host || '').toLowerCase() === host && (e.port ?? 22) === port
                )
              : undefined)
          if (hit) {
            const rec = await api.get(hit.id)
            if (rec) {
              applyRecord(rec)
              return
            }
          }
          setSelectedId(null)
          setForm(emptyForm(link))
          return
        }

        const list = await api.list()
        setEntries(Array.isArray(list) ? list : [])
        setSelectedId(null)
        setForm(emptyForm(link))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setEntries([])
        setForm(emptyForm(link))
      } finally {
        setLoading(false)
      }
    })()
  }, [link, applyRecord, focused])

  const onNew = () => {
    setSelectedId(null)
    setForm(emptyForm(link))
    setEditingSvcIdx(null)
    setSvcDraft({ name: '', kind: 'unknown', notes: '' })
    setError(null)
  }

  const onSelect = (id: string) => {
    setError(null)
    void loadRecord(id)
  }

  const onSearch = async () => {
    setError(null)
    setLoading(true)
    try {
      await loadList(searchQuery)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const buildInput = (): HostInventoryUpsertInput => {
    const tags = form.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
    return {
      id: form.id || undefined,
      title: form.title.trim() || form.host.trim() || '未命名主机',
      host: form.host.trim() || undefined,
      port: Number(form.port) || 22,
      username: form.username.trim() || undefined,
      profileId: form.profileId.trim() || undefined,
      privateKeyPath: form.privateKeyPath.trim() || undefined,
      tags: tags.length ? tags : undefined,
      env: form.env.trim() || undefined,
      services: form.services,
      notesMarkdown: form.notesMarkdown
    }
  }

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const rec = await getInventoryApi().upsert(buildInput())
      applyRecord(rec)
      if (!focused) await loadList()
      onUpserted?.(rec)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    const id = form.id || selectedId
    if (!id) {
      setError('请先选择要删除的档案')
      return
    }
    if (!window.confirm(`确定删除主机档案「${form.title || id}」？`)) return
    setSaving(true)
    setError(null)
    try {
      await getInventoryApi().remove(id)
      setSelectedId(null)
      setForm(emptyForm(link))
      if (!focused) await loadList()
      else onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const onLinkCurrent = async () => {
    if (!link) {
      setError('当前无会话可关联')
      return
    }
    setForm((prev) => ({
      ...prev,
      title: prev.title.trim() || link.label?.trim() || link.host?.trim() || prev.title,
      host: link.host?.trim() || prev.host,
      port: String(link.port ?? (Number(prev.port) || 22)),
      username: link.username?.trim() || prev.username,
      profileId: link.profileId?.trim() || prev.profileId
    }))
    // save after state flush
    setSaving(true)
    setError(null)
    try {
      const tags = form.tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean)
      const input: HostInventoryUpsertInput = {
        id: form.id || link.hostInventoryId || undefined,
        title:
          form.title.trim() ||
          link.label?.trim() ||
          link.host?.trim() ||
          '未命名主机',
        host: link.host?.trim() || form.host.trim() || undefined,
        port: link.port ?? (Number(form.port) || 22),
        username: link.username?.trim() || form.username.trim() || undefined,
        profileId: link.profileId?.trim() || form.profileId.trim() || undefined,
        tags: tags.length ? tags : undefined,
        env: form.env.trim() || undefined,
        services: form.services,
        notesMarkdown: form.notesMarkdown
      }
      const rec = await getInventoryApi().upsert(input)
      applyRecord(rec)
      await loadList()
      onUpserted?.(rec)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const commitService = () => {
    const name = svcDraft.name.trim()
    if (!name) {
      setError('服务名称不能为空')
      return
    }
    setError(null)
    const row: HostService = {
      name,
      kind: svcDraft.kind,
      notes: svcDraft.notes.trim() || undefined
    }
    setForm((prev) => {
      const next = [...prev.services]
      if (editingSvcIdx != null && editingSvcIdx >= 0) next[editingSvcIdx] = { ...next[editingSvcIdx], ...row }
      else {
        const i = next.findIndex((s) => s.name.toLowerCase() === name.toLowerCase())
        if (i >= 0) next[i] = { ...next[i], ...row }
        else next.push(row)
      }
      return { ...prev, services: next }
    })
    setEditingSvcIdx(null)
    setSvcDraft({ name: '', kind: 'unknown', notes: '' })
  }

  const editService = (idx: number) => {
    const s = form.services[idx]
    if (!s) return
    setEditingSvcIdx(idx)
    setSvcDraft({ name: s.name, kind: s.kind, notes: s.notes || '' })
  }

  const removeService = (idx: number) => {
    setForm((prev) => ({ ...prev, services: prev.services.filter((_, i) => i !== idx) }))
    if (editingSvcIdx === idx) {
      setEditingSvcIdx(null)
      setSvcDraft({ name: '', kind: 'unknown', notes: '' })
    }
  }

  const canLink = Boolean(link && (link.host || link.profileId || link.username))
  const panelTitle =
    focused && (form.title.trim() || form.host.trim() || link?.label || link?.host)
      ? `主机档案 · ${form.title.trim() || form.host.trim() || link?.label || link?.host}`
      : '主机档案'

  const metaFields = (
    <>
      <div className="field">
        <label>标题</label>
        <input
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="展示名"
        />
      </div>
      <div className="inventory-grid-2">
        <div className="field">
          <label>主机</label>
          <input
            value={form.host}
            onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
            placeholder="hostname / IP"
          />
        </div>
        <div className="field">
          <label>端口</label>
          <input
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))}
          />
        </div>
      </div>
      <div className="inventory-grid-2">
        <div className="field">
          <label>用户</label>
          <input
            value={form.username}
            onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>环境</label>
          <input
            value={form.env}
            onChange={(e) => setForm((p) => ({ ...p, env: e.target.value }))}
            placeholder="prod / staging…"
          />
        </div>
      </div>
      <div className="field">
        <label>标签（逗号分隔）</label>
        <input
          value={form.tags}
          onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
          placeholder="web, mysql"
        />
      </div>
      {!focused ? (
        <div className="field">
          <label>关联会话 profileId</label>
          <input
            value={form.profileId}
            onChange={(e) => setForm((p) => ({ ...p, profileId: e.target.value }))}
            placeholder="可选"
          />
        </div>
      ) : null}
      <div className="field">
        <label>本机私钥路径</label>
        <input
          value={form.privateKeyPath}
          onChange={(e) => setForm((p) => ({ ...p, privateKeyPath: e.target.value }))}
          placeholder="C:/Users/.../.ai-ssh-pro/keys/aiss_ed25519"
        />
      </div>

      <h3 className="modal-section-title">服务清单</h3>
      <ul className="inventory-svc-list">
        {form.services.length === 0 ? (
          <li style={{ fontSize: 12, color: 'var(--muted)' }}>暂无服务</li>
        ) : (
          form.services.map((s, idx) => (
            <li key={`${s.name}-${idx}`} className="inventory-svc-row">
              <span>
                <strong>{s.name}</strong> [{s.kind}]
                {s.notes ? ` — ${s.notes}` : ''}
              </span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => editService(idx)}>
                  编辑
                </button>
                <button type="button" onClick={() => removeService(idx)}>
                  删
                </button>
              </span>
            </li>
          ))
        )}
      </ul>
      <div className="inventory-svc-editor">
        <input
          value={svcDraft.name}
          onChange={(e) => setSvcDraft((p) => ({ ...p, name: e.target.value }))}
          placeholder="服务名"
        />
        <select
          value={svcDraft.kind}
          onChange={(e) => setSvcDraft((p) => ({ ...p, kind: e.target.value as HostServiceKind }))}
        >
          {SERVICE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          value={svcDraft.notes}
          onChange={(e) => setSvcDraft((p) => ({ ...p, notes: e.target.value }))}
          placeholder="备注"
        />
        <button type="button" onClick={commitService}>
          {editingSvcIdx != null ? '更新服务' : '添加服务'}
        </button>
      </div>
    </>
  )

  const notesPane = (
    <section className="inventory-notes-pane">
      <div className="notes-toolbar">
        <div className="notes-toolbar-left">
          <strong>运维备注</strong>
          <span className="notes-meta">
            {notesLines} 行 · {notesChars} 字
          </span>
        </div>
        <div className="notes-mode-seg" role="group" aria-label="备注显示模式">
          {(
            [
              ['preview', '预览'],
              ['edit', '编辑'],
              ['split', '分栏']
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={notesMode === mode ? 'active' : ''}
              onClick={() => setNotesMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={`notes-stage notes-stage--${notesMode}`}>
        {notesMode !== 'preview' ? (
          <textarea
            className="notes-editor"
            value={form.notesMarkdown}
            onChange={(e) => setForm((p) => ({ ...p, notesMarkdown: e.target.value }))}
            placeholder={'支持 Markdown，例如：\n# 角色\n- 用途\n\n## 排障\n```bash\nsystemctl status xxx\n```'}
            spellCheck={false}
          />
        ) : null}
        {notesMode !== 'edit' ? <NotesMarkdownPreview markdown={form.notesMarkdown} /> : null}
      </div>
    </section>
  )

  return (
    <div className="workspace-panel workspace-panel--inventory">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{panelTitle}</h2>
        <div className="workspace-panel-actions">
          {rootHint ? (
            <span className="workspace-panel-hint" title={rootHint}>
              目录：{rootHint}
            </span>
          ) : null}
          <button
            type="button"
            disabled={saving || !(form.id || selectedId)}
            onClick={() => void onDelete()}
          >
            删除
          </button>
          <button type="button" className="primary" disabled={saving || loading} onClick={() => void onSave()}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" onClick={onClose} disabled={saving}>
            关闭
          </button>
        </div>
      </div>

      <div
        className={`workspace-panel-body workspace-panel-body--inventory${focused ? ' workspace-panel-body--focused' : ''}`}
      >
        {error ? (
          <p style={{ margin: '0 0 10px', color: 'var(--danger, #f85149)', fontSize: 12 }}>{error}</p>
        ) : null}
        {loading ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>加载中…</p> : null}

        {focused ? (
          <div className="inventory-focus-split">
            <aside className="inventory-meta-col">{metaFields}</aside>
            {notesPane}
          </div>
        ) : (
          <div className="inventory-layout">
            <aside className="inventory-list-pane">
              <div className="inventory-search-row">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onSearch()
                  }}
                  placeholder="搜索标题/主机/备注…"
                  aria-label="搜索主机档案"
                />
                <button type="button" onClick={() => void onSearch()} disabled={loading}>
                  搜索
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button type="button" className="primary" onClick={onNew} disabled={saving}>
                  New
                </button>
              </div>
              {!loading && entries.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>暂无档案</p>
              ) : null}
              <ul className="inventory-host-list">
                {entries.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`inventory-host-item ${selectedId === e.id ? 'active' : ''}`}
                      onClick={() => onSelect(e.id)}
                    >
                      <div className="inventory-host-title">{e.title}</div>
                      <div className="inventory-host-meta">
                        {e.username ? `${e.username}@` : ''}
                        {e.host || '—'}
                        {e.port != null ? `:${e.port}` : ''}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="inventory-detail-pane inventory-detail-pane--browse">
              <div className="inventory-browse-meta">{metaFields}</div>
              {notesPane}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {!focused && canLink ? (
                  <button type="button" disabled={saving} onClick={() => void onLinkCurrent()}>
                    关联当前会话
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
