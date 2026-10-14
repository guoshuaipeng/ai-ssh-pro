import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { HostInventoryRecord, HostInventoryUpsertInput, HostService, HostServiceKind } from '@shared/inventory'
import { tg } from '../lib/i18n'
import { confirmDialog } from '../lib/dialogs'
import { showToast } from '../lib/toast'
import NotesMarkdownPreview from './NotesMarkdownPreview'

export type HostProfileLink = {
  profileId?: string
  host?: string
  port?: number
  username?: string
  label?: string
  hostInventoryId?: string
}

type Props = {
  record: HostInventoryRecord | null
  link?: HostProfileLink
  loading: boolean
  error: string | null
  rootHint: string
  active?: boolean
  onUpsert: (input: HostInventoryUpsertInput) => Promise<HostInventoryRecord>
  onDelete: () => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  onConnect?: () => void
  onOpenSftp?: () => void
  onOpenMonitor?: () => void
  onOpenToolbox?: () => void
  onViewLogs?: (svc: HostService) => void
  onSearchTag?: (tag: string) => void
  resolveSession?: () => Promise<string | null>
}

type Draft = {
  title: string
  host: string
  port: string
  username: string
  privateKeyPath: string
  env: string
  tags: string[]
}

const KINDS: HostServiceKind[] = ['docker', 'systemd', 'k8s', 'binary', 'unknown']
const PRESETS = ['prod', 'test', 'dev'] as const

function draftFrom(rec: HostInventoryRecord | null, link?: HostProfileLink): Draft {
  const tags = rec?.meta.tags?.length ? [...rec.meta.tags] : []
  return {
    title: rec?.meta.title || link?.label?.trim() || '',
    host: rec?.meta.host || link?.host?.trim() || '',
    port: String(rec?.meta.port ?? link?.port ?? 22),
    username: rec?.meta.username || link?.username?.trim() || '',
    privateKeyPath: rec?.meta.privateKeyPath || '',
    env: rec?.meta.env || '',
    tags
  }
}

function shortKey(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  if (parts.length >= 2) return `…/${parts.slice(-2).join('/')}`
  return path
}

function envKind(env: string): 'prod' | 'test' | 'dev' | 'other' {
  const e = env.trim().toLowerCase()
  if (e === 'prod' || e === 'production') return 'prod'
  if (e === 'test' || e === 'staging') return 'test'
  if (e === 'dev' || e === 'development') return 'dev'
  return 'other'
}

function kindBucket(kind: HostServiceKind): 'docker' | 'systemd' | 'k8s' | 'other' {
  if (kind === 'docker' || kind === 'systemd' || kind === 'k8s') return kind
  return 'other'
}

function prefixOf(name: string): string | null {
  const i = Math.max(name.lastIndexOf('.'), name.lastIndexOf('-'))
  if (i < 3) return null
  return name.slice(0, i + 1)
}

type Row =
  | { type: 'group'; key: string; label: string; items: HostService[] }
  | { type: 'item'; svc: HostService; index: number }

function buildRows(services: HostService[]): Row[] {
  const buckets = new Map<string, HostService[]>()
  const loose: HostService[] = []
  for (const s of services) {
    const k = prefixOf(s.name)
    if (!k) {
      loose.push(s)
      continue
    }
    const arr = buckets.get(k) ?? []
    arr.push(s)
    buckets.set(k, arr)
  }
  const grouped = new Set<HostService>()
  const groups: Row[] = []
  for (const [k, items] of buckets) {
    if (items.length > 5) {
      items.forEach((s) => grouped.add(s))
      groups.push({ type: 'group', key: k, label: `${k}*`, items })
    }
  }
  const rows: Row[] = [...groups]
  services.forEach((svc, index) => {
    if (!grouped.has(svc)) rows.push({ type: 'item', svc, index })
  })
  return rows
}

function formatUpdated(ts: number): string {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ts)
  } catch {
    return ''
  }
}

export default function HostProfileFocus({
  record,
  link,
  loading,
  error,
  rootHint,
  active = true,
  onUpsert,
  onDelete,
  onDirtyChange,
  onConnect,
  onOpenSftp,
  onOpenMonitor,
  onOpenToolbox,
  onViewLogs,
  onSearchTag,
  resolveSession
}: Props) {
  const initial = draftFrom(record, link)
  const [metaId, setMetaId] = useState(record?.meta.id || '')
  const [profileId] = useState(record?.meta.profileId || link?.profileId || '')
  const [saved, setSaved] = useState<Draft>(initial)
  const [draft, setDraft] = useState<Draft>(initial)
  const [editing, setEditing] = useState(false)
  const [services, setServices] = useState<HostService[]>(() => [...(record?.services || [])])
  const [notes, setNotes] = useState(record?.notesMarkdown || '')
  const [savedNotes, setSavedNotes] = useState(record?.notesMarkdown || '')
  const [updatedAt, setUpdatedAt] = useState(record?.meta.updatedAt || 0)
  const [basicOpen, setBasicOpen] = useState(() => localStorage.getItem('aiss.hp.basicOpen') !== '0')
  const [svcOpen, setSvcOpen] = useState(() => localStorage.getItem('aiss.hp.svcOpen') !== '0')
  const [sideW, setSideW] = useState(() => {
    const n = Number(localStorage.getItem('aiss.hp.leftW') || 360)
    return Number.isFinite(n) ? Math.min(480, Math.max(300, n)) : 360
  })
  const [narrow, setNarrow] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'docker' | 'systemd' | 'k8s' | 'other'>('all')
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState(0)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [svcForm, setSvcForm] = useState({ name: '', kind: 'docker' as HostServiceKind, port: '', unit: '', image: '', notes: '' })
  const [adding, setAdding] = useState(false)
  const [rowMenu, setRowMenu] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState<'preview' | 'edit' | 'split'>('preview')
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hostErr, setHostErr] = useState<string | null>(null)
  const [portErr, setPortErr] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [envPreset, setEnvPreset] = useState(() => {
    const e = initial.env.trim().toLowerCase()
    if (!e) return ''
    return (PRESETS as readonly string[]).includes(e) ? e : 'custom'
  })
  const [tocOpen, setTocOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const loadedId = useRef(record?.meta.id || '')
  useEffect(() => {
    if (!record?.meta.id || loadedId.current === record.meta.id) return
    loadedId.current = record.meta.id
    const d = draftFrom(record, link)
    setSaved(d)
    setDraft(d)
    setServices([...(record.services || [])])
    setNotes(record.notesMarkdown || '')
    setSavedNotes(record.notesMarkdown || '')
    setUpdatedAt(record.meta.updatedAt || 0)
    setMetaId(record.meta.id)
    const e = d.env.trim().toLowerCase()
    setEnvPreset(!e ? '' : (PRESETS as readonly string[]).includes(e) ? e : 'custom')
    setEditing(false)
  }, [record, link])
  const notesRef = useRef(notes)
  const savedNotesRef = useRef(savedNotes)
  notesRef.current = notes
  savedNotesRef.current = savedNotes
  const snap = useRef({ saved, services, notes, metaId, profileId })
  snap.current = { saved, services, notes, metaId, profileId }

  const basicDirty = editing && JSON.stringify(draft) !== JSON.stringify(saved)
  const notesDirty = notes !== savedNotes
  const dirty = basicDirty || notesDirty || noteStatus === 'saving'
  const onDirtyRef = useRef(onDirtyChange)
  onDirtyRef.current = onDirtyChange

  useEffect(() => {
    onDirtyRef.current?.(dirty)
  }, [dirty])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 1100))
    ro.observe(el)
    setNarrow(el.clientWidth < 1100)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!menuOpen && rowMenu == null) return
    const close = () => {
      setMenuOpen(false)
      setRowMenu(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen, rowMenu])

  const upsertRef = useRef(onUpsert)
  upsertRef.current = onUpsert

  const buildInput = useCallback((over?: Partial<{ draft: Draft; services: HostService[]; notes: string }>): HostInventoryUpsertInput => {
    const s = snap.current
    const d = over?.draft ?? s.saved
    const port = Number(d.port)
    return {
      id: s.metaId || undefined,
      title: d.title.trim() || d.host.trim() || tg('ui.156'),
      host: d.host.trim() || undefined,
      port: Number.isFinite(port) && port > 0 ? port : 22,
      username: d.username.trim() || undefined,
      profileId: s.profileId || undefined,
      privateKeyPath: d.privateKeyPath.trim() || undefined,
      tags: d.tags.length ? d.tags : undefined,
      env: d.env.trim() || undefined,
      services: over?.services ?? s.services,
      notesMarkdown: over?.notes ?? s.notes
    }
  }, [])

  const persist = useCallback(
    async (over?: Partial<{ draft: Draft; services: HostService[]; notes: string }>) => {
      const rec = await upsertRef.current(buildInput(over))
      setMetaId(rec.meta.id)
      setUpdatedAt(rec.meta.updatedAt)
      return rec
    },
    [buildInput]
  )

  const saveNotes = useCallback(
    async (text: string) => {
      setNoteStatus('saving')
      try {
        await persist({ notes: text })
        setSavedNotes(text)
        savedNotesRef.current = text
        setNoteStatus('saved')
      } catch {
        setNoteStatus('error')
      }
    },
    [persist]
  )

  useEffect(() => {
    if (notes === savedNotesRef.current) return
    setNoteStatus('saving')
    const id = window.setTimeout(() => void saveNotes(notesRef.current), 1000)
    return () => window.clearTimeout(id)
  }, [notes, saveNotes])

  const saveBasic = useCallback(async () => {
    const host = draft.host.trim()
    const port = Number(draft.port)
    let bad = false
    if (!host) {
      setHostErr(tg('hp.hostRequired'))
      bad = true
    } else setHostErr(null)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setPortErr(tg('hp.portInvalid'))
      bad = true
    } else setPortErr(null)
    if (bad) return
    const next = { ...draft, host, port: String(port), title: draft.title.trim(), username: draft.username.trim(), env: draft.env.trim() }
    await persist({ draft: next })
    setSaved(next)
    setDraft(next)
    setEditing(false)
  }, [draft, persist])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (editing) void saveBasic()
        else void saveNotes(notesRef.current)
      } else if (e.key === 'Escape' && editing) {
        e.preventDefault()
        e.stopPropagation()
        setDraft(saved)
        setEditing(false)
        setHostErr(null)
        setPortErr(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, editing, saveBasic, saveNotes, saved])

  const display = editing ? draft : saved
  const title = display.title.trim() || display.host.trim() || link?.label || link?.host || tg('ui.156')
  const addr = `${display.username || '—'}@${display.host || '—'}:${display.port || '22'}`
  const keyLabel = display.privateKeyPath ? tg('hp.keyAuth', { name: display.privateKeyPath.split(/[/\\]/).pop() || display.privateKeyPath }) : tg('hp.passwordAuth')

  const counts = useMemo(() => {
    const c = { all: services.length, docker: 0, systemd: 0, k8s: 0, other: 0 }
    for (const s of services) c[kindBucket(s.kind)] += 1
    return c
  }, [services])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return services.filter((s) => {
      if (kindFilter !== 'all' && kindBucket(s.kind) !== kindFilter) return false
      if (!q) return true
      const portHit = (s.ports || []).some((p) => String(p).includes(q))
      return s.name.toLowerCase().includes(q) || (s.image || '').toLowerCase().includes(q) || portHit || (s.unit || '').toLowerCase().includes(q)
    })
  }, [services, filter, kindFilter])

  const rows = useMemo(() => buildRows(filtered), [filtered])
  const flatItems = useMemo(() => {
    const out: HostService[] = []
    for (const r of rows) {
      if (r.type === 'item') out.push(r.svc)
      else if (openGroups.has(r.key)) out.push(...r.items)
    }
    return out
  }, [rows, openGroups])

  const h2s = useMemo(() => [...notes.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim()), [notes])
  const noteLines = notes ? notes.split('\n').length : 0

  const startEdit = () => {
    setDraft(saved)
    const e = saved.env.trim().toLowerCase()
    setEnvPreset(!e ? '' : (PRESETS as readonly string[]).includes(e) ? e : 'custom')
    setEditing(true)
    setHostErr(null)
    setPortErr(null)
  }

  const commitTags = (raw: string) => {
    const parts = raw.split(/[,，\s]/).map((x) => x.trim().replace(/^#/, '')).filter(Boolean)
    if (!parts.length) return
    setDraft((p) => ({ ...p, tags: [...p.tags, ...parts.filter((t) => !p.tags.includes(t))] }))
    setTagInput('')
  }

  const saveServices = async (next: HostService[]) => {
    setServices(next)
    await persist({ services: next })
  }

  const removeService = (svc: HostService) => {
    const idx = services.findIndex((s) => s === svc || (s.name === svc.name && s.kind === svc.kind))
    if (idx < 0) return
    const next = services.filter((_, i) => i !== idx)
    const prev = services
    void saveServices(next)
    showToast(tg('hp.deleted', { name: svc.name }), {
      duration: 5000,
      action: {
        label: tg('hp.undo'),
        run: () => void saveServices(prev)
      }
    })
  }

  const openSvcEditor = (svc: HostService | null) => {
    if (!svc) {
      setAdding(true)
      setEditingIdx(-1)
      setSvcForm({ name: '', kind: 'docker', port: '', unit: '', image: '', notes: '' })
      return
    }
    const idx = services.indexOf(svc)
    setAdding(false)
    setEditingIdx(idx)
    setSvcForm({
      name: svc.name,
      kind: svc.kind,
      port: svc.ports?.[0] ? String(svc.ports[0]) : '',
      unit: svc.unit || '',
      image: svc.image || '',
      notes: svc.notes || ''
    })
  }

  const commitSvc = async () => {
    const name = svcForm.name.trim()
    if (!name) return
    const port = Number(svcForm.port)
    const row: HostService = {
      name,
      kind: svcForm.kind,
      ports: Number.isInteger(port) && port > 0 ? [port] : undefined,
      unit: svcForm.unit.trim() || undefined,
      image: svcForm.image.trim() || undefined,
      notes: svcForm.notes.trim() || undefined
    }
    const next = [...services]
    if (editingIdx != null && editingIdx >= 0 && !adding) next[editingIdx] = { ...next[editingIdx], ...row }
    else next.push(row)
    setEditingIdx(null)
    setAdding(false)
    await saveServices(next)
  }

  const scan = async () => {
    if (!resolveSession) {
      showToast(tg('hp.needSession'))
      return
    }
    setScanning(true)
    try {
      const sid = await resolveSession()
      if (!sid) {
        showToast(tg('hp.needSession'))
        return
      }
      const found: HostService[] = []
      try {
        const tree = await window.aiss.docker.listTree(sid)
        const containers = [...(tree.containers || []), ...(tree.composeProjects || []).flatMap((p) => p.containers || [])]
        const seen = new Set<string>()
        for (const c of containers) {
          if (seen.has(c.name)) continue
          seen.add(c.name)
          const ports = String(c.ports || '')
            .split(/[,\s]+/)
            .map((s) => {
              const m = /(\d+)/.exec(s)
              return m ? Number(m[1]) : NaN
            })
            .filter((n) => Number.isInteger(n) && n > 0 && n <= 65535)
          found.push({ name: c.name, kind: 'docker', image: c.image, ports: ports.length ? [...new Set(ports)] : undefined, notes: c.status })
        }
      } catch {
        /* docker optional */
      }
      try {
        const units = await window.aiss.tools.services(sid)
        for (const u of units) {
          if (u.sub !== 'running' && u.active !== 'active') continue
          found.push({ name: u.unit.replace(/\.service$/, ''), kind: 'systemd', unit: u.unit, notes: u.description || undefined })
        }
      } catch {
        /* systemd optional */
      }
      if (!found.length) {
        showToast(tg('hp.scanEmpty'))
        return
      }
      const merged = [...services]
      for (const s of found) {
        const i = merged.findIndex((x) => x.name === s.name && x.kind === s.kind)
        if (i >= 0) merged[i] = { ...merged[i], ...s }
        else merged.push(s)
      }
      await saveServices(merged)
      showToast(tg('hp.scanDone', { n: found.length }))
    } finally {
      setScanning(false)
    }
  }

  const onSvcKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => Math.min(flatItems.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && flatItems[selected]) {
      e.preventDefault()
      openSvcEditor(flatItems[selected])
    } else if (e.key === 'Delete' && flatItems[selected]) {
      e.preventDefault()
      removeService(flatItems[selected])
    }
  }

  const copyAddr = () => {
    const text = `${display.username}@${display.host}`
    void navigator.clipboard.writeText(text).then(() => showToast(tg('ctx.copied')))
  }

  const exportMd = () => {
    const d = saved
    const body = [
      `# ${d.title || d.host}`,
      '',
      `- ${d.username}@${d.host}:${d.port}`,
      d.env ? `- ${d.env}` : '',
      d.tags.length ? `- ${d.tags.map((t) => '#' + t).join(' ')}` : '',
      d.privateKeyPath ? `- ${d.privateKeyPath}` : '',
      '',
      ...services.map((s) => `- ${s.name} (${s.kind})${s.ports?.length ? ' ' + s.ports.join(',') : ''}`),
      '',
      notes
    ]
      .filter((l) => l !== '')
      .join('\n')
    const blob = new Blob([body], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(d.title || d.host || 'host').replace(/[^\w.-]+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const dash = tg('hp.dash')

  return (
    <div className={`hp-root${narrow ? ' is-stack' : ''}`} ref={rootRef} data-testid="host-profile">
      <header className="hp-head">
        <div className="hp-head-row">
          <h2 className="hp-title">{title}</h2>
          {display.env ? <span className={`hp-env hp-env--${envKind(display.env)}`}>{display.env.toLowerCase()}</span> : null}
          <span className="hp-tags">
            {display.tags.map((tag) => (
              <button key={tag} type="button" className="hp-tag" onClick={() => onSearchTag?.(tag)}>
                #{tag}
              </button>
            ))}
          </span>
          {basicDirty ? <span className="hp-unsaved">● {tg('hp.unsaved')}</span> : null}
          <div className="hp-head-actions">
            <button type="button" className="primary" onClick={() => onConnect?.()}>
              ▶ {tg('app.connect')}
            </button>
            <button type="button" onClick={() => onOpenSftp?.()}>
              SFTP
            </button>
            <button type="button" onClick={() => onOpenMonitor?.()}>
              {tg('tab.monitor')}
            </button>
            <button type="button" onClick={() => onOpenToolbox?.()}>
              {tg('tab.toolbox')}
            </button>
            <button
              type="button"
              className="st-icon-btn"
              aria-label={tg('st.more')}
              title={rootHint || tg('st.more')}
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className="hp-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); copyAddr() }}>
                  {tg('hp.copyAddr')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  title={rootHint}
                  disabled={!rootHint}
                  onClick={() => {
                    setMenuOpen(false)
                    if (rootHint) void window.aiss.app.showItemInFolder(rootHint)
                  }}
                >
                  {tg('hp.showInFolder')}
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); exportMd() }}>
                  {tg('hp.exportMd')}
                </button>
                <div className="hp-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  disabled={!metaId}
                  onClick={() => {
                    setMenuOpen(false)
                    void (async () => {
                      const ok = await confirmDialog({
                        title: tg('hp.deleteProfile'),
                        body: tg('ui.158', { 0: title }),
                        danger: true,
                        confirmText: tg('hp.deleteProfile')
                      })
                      if (ok) await onDelete()
                    })()
                  }}
                >
                  {tg('hp.deleteProfile')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <button type="button" className="hp-sub" onClick={copyAddr} title={addr}>
          {addr}
          <span> · {keyLabel}</span>
          {updatedAt ? <span> · {tg('hp.updated')} {formatUpdated(updatedAt)}</span> : null}
        </button>
      </header>
      {error ? <p className="hp-error">{error}</p> : null}
      <div className="hp-body">
        <aside className="hp-side" style={narrow ? undefined : { width: sideW }}>
          <section className="hp-card">
            <div className="hp-card-h">
              <button
                type="button"
                className="hp-fold"
                onClick={() => {
                  setBasicOpen((v) => {
                    localStorage.setItem('aiss.hp.basicOpen', v ? '0' : '1')
                    return !v
                  })
                }}
              >
                {basicOpen ? '▾' : '▸'} {tg('hp.basic')}
              </button>
              {basicDirty ? <span className="hp-unsaved">● {tg('hp.unsaved')}</span> : null}
              {!editing ? (
                <button type="button" onClick={startEdit}>
                  {tg('hp.edit')}
                </button>
              ) : null}
            </div>
            {basicOpen && !editing ? (
              <div className="hp-kv" onDoubleClick={startEdit}>
                <span className="hp-k">{tg('hp.host')}</span>
                <span className="hp-v hp-mono">{display.host || dash}</span>
                <span className="hp-k">{tg('hp.port')}</span>
                <span className="hp-v hp-mono">{display.port || dash}</span>
                <span className="hp-k">{tg('hp.user')}</span>
                <span className="hp-v">{display.username || dash}</span>
                <span className="hp-k">{tg('hp.env')}</span>
                <span className="hp-v">{display.env || dash}</span>
                <span className="hp-k">{tg('hp.tags')}</span>
                <span className="hp-v">{display.tags.length ? display.tags.map((t) => '#' + t).join(' ') : dash}</span>
                <span className="hp-k">{tg('hp.key')}</span>
                <span className="hp-v hp-mono" title={display.privateKeyPath || undefined}>
                  {display.privateKeyPath ? shortKey(display.privateKeyPath) : dash}
                </span>
              </div>
            ) : null}
            {basicOpen && editing ? (
              <div className="hp-form">
                <p className="hp-group">{tg('hp.groupConn')}</p>
                <label className="hp-field">
                  {tg('hp.host')}
                  <input value={draft.host} onChange={(e) => setDraft((p) => ({ ...p, host: e.target.value }))} />
                  {hostErr ? <span className="hp-field-err">{hostErr}</span> : null}
                </label>
                <div className="hp-form-row">
                  <label className="hp-field">
                    {tg('hp.port')}
                    <input style={{ width: 80 }} value={draft.port} onChange={(e) => setDraft((p) => ({ ...p, port: e.target.value }))} inputMode="numeric" />
                    {portErr ? <span className="hp-field-err">{portErr}</span> : null}
                  </label>
                  <label className="hp-field hp-field-grow">
                    {tg('hp.user')}
                    <input value={draft.username} onChange={(e) => setDraft((p) => ({ ...p, username: e.target.value }))} />
                  </label>
                </div>
                <label className="hp-field">
                  {tg('hp.key')}
                  <span className="hp-key-row">
                    <input value={draft.privateKeyPath} onChange={(e) => setDraft((p) => ({ ...p, privateKeyPath: e.target.value }))} />
                    <button
                      type="button"
                      onClick={() => {
                        void window.aiss.app.pickFile(tg('hp.browse')).then((p) => {
                          if (p) setDraft((prev) => ({ ...prev, privateKeyPath: p }))
                        })
                      }}
                    >
                      {tg('hp.browse')}
                    </button>
                  </span>
                </label>
                <p className="hp-group">{tg('hp.groupClass')}</p>
                <label className="hp-field">
                  {tg('hp.titleField')}
                  <input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
                </label>
                <label className="hp-field">
                  {tg('hp.env')}
                  <select
                    value={envPreset}
                    onChange={(e) => {
                      const v = e.target.value
                      setEnvPreset(v)
                      if (v !== 'custom') setDraft((p) => ({ ...p, env: v }))
                    }}
                  >
                    <option value="">{dash}</option>
                    {PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    <option value="custom">{tg('hp.customEnv')}</option>
                  </select>
                  {envPreset === 'custom' ? (
                    <input value={draft.env} onChange={(e) => setDraft((p) => ({ ...p, env: e.target.value }))} />
                  ) : null}
                </label>
                <label className="hp-field">
                  {tg('hp.tags')}
                  <span className="hp-tag-input">
                    {draft.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="hp-tag"
                        onClick={() => setDraft((p) => ({ ...p, tags: p.tags.filter((x) => x !== tag) }))}
                      >
                        #{tag} ×
                      </button>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault()
                          commitTags(tagInput)
                        } else if (e.key === 'Backspace' && !tagInput && draft.tags.length) {
                          setDraft((p) => ({ ...p, tags: p.tags.slice(0, -1) }))
                        }
                      }}
                    />
                  </span>
                </label>
                <div className="hp-form-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(saved)
                      setEditing(false)
                      setHostErr(null)
                      setPortErr(null)
                    }}
                  >
                    {tg('dlg.cancel')}
                  </button>
                  <button type="button" className="primary" onClick={() => void saveBasic()}>
                    {tg('conn.save')}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="hp-card">
            <div className="hp-card-h">
              <button
                type="button"
                className="hp-fold"
                onClick={() => {
                  setSvcOpen((v) => {
                    localStorage.setItem('aiss.hp.svcOpen', v ? '0' : '1')
                    return !v
                  })
                }}
              >
                {svcOpen ? '▾' : '▸'} {tg('hp.services')} ({services.length})
              </button>
              <span className="hp-card-actions">
                <button type="button" className="st-icon-btn" title={tg('hp.filter')} aria-label={tg('hp.filter')} onClick={() => setFilterOpen((v) => !v)}>
                  ⌕
                </button>
                <button type="button" onClick={() => openSvcEditor(null)}>
                  + {tg('hp.addService')}
                </button>
              </span>
            </div>
            {svcOpen ? (
              <>
                {filterOpen ? (
                  <input
                    className="hp-filter"
                    value={filter}
                    placeholder={tg('hp.filter')}
                    aria-label={tg('hp.filter')}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                ) : null}
                <div className="hp-chips">
                  {(['all', 'docker', 'systemd', 'k8s', 'other'] as const).map((k) => (
                    <button key={k} type="button" className={kindFilter === k ? 'hp-chip is-on' : 'hp-chip'} onClick={() => setKindFilter(k)}>
                      {k === 'all' ? tg('hp.all') : k === 'other' ? tg('hp.other') : k} {counts[k]}
                    </button>
                  ))}
                </div>
                {loading || scanning ? (
                  <div className="hp-skel-wrap" aria-hidden>
                    <div className="hp-skel" />
                    <div className="hp-skel" />
                    <div className="hp-skel" />
                  </div>
                ) : services.length === 0 ? (
                  <div className="hp-empty">
                    <p>{tg('hp.noServices')}</p>
                    <button type="button" className="primary" onClick={() => void scan()}>
                      {tg('hp.scan')}
                    </button>
                    <button type="button" onClick={() => openSvcEditor(null)}>
                      {tg('hp.addManual')}
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="hp-empty">{tg('hp.noMatch')}</p>
                ) : (
                  <div className="hp-svc-list" tabIndex={0} onKeyDown={onSvcKey}>
                    {rows.map((r) => {
                      if (r.type === 'group') {
                        const open = openGroups.has(r.key)
                        return (
                          <div key={r.key}>
                            <button
                              type="button"
                              className="hp-svc-group"
                              onClick={() =>
                                setOpenGroups((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(r.key)) next.delete(r.key)
                                  else next.add(r.key)
                                  return next
                                })
                              }
                            >
                              {open ? '▾' : '▸'} {r.label} ({r.items.length})
                            </button>
                            {open
                              ? r.items.map((svc) => (
                                  <SvcRow
                                    key={svc.name + svc.kind}
                                    svc={svc}
                                    selected={flatItems[selected] === svc}
                                    menu={rowMenu === services.indexOf(svc)}
                                    onSelect={() => setSelected(flatItems.indexOf(svc))}
                                    onLogs={() => onViewLogs?.(svc)}
                                    onEdit={() => openSvcEditor(svc)}
                                    onMenu={(e) => {
                                      e.stopPropagation()
                                      setRowMenu(services.indexOf(svc))
                                    }}
                                    onCopy={() => {
                                      setRowMenu(null)
                                      void navigator.clipboard.writeText(svc.name).then(() => showToast(tg('ctx.copied')))
                                    }}
                                    onDelete={() => {
                                      setRowMenu(null)
                                      removeService(svc)
                                    }}
                                  />
                                ))
                              : null}
                          </div>
                        )
                      }
                      const svc = r.svc
                      return (
                        <SvcRow
                          key={svc.name + svc.kind + r.index}
                          svc={svc}
                          selected={flatItems[selected] === svc}
                          menu={rowMenu === r.index}
                          onSelect={() => setSelected(flatItems.indexOf(svc))}
                          onLogs={() => onViewLogs?.(svc)}
                          onEdit={() => openSvcEditor(svc)}
                          onMenu={(e) => {
                            e.stopPropagation()
                            setRowMenu(r.index)
                          }}
                          onCopy={() => {
                            setRowMenu(null)
                            void navigator.clipboard.writeText(svc.name).then(() => showToast(tg('ctx.copied')))
                          }}
                          onDelete={() => {
                            setRowMenu(null)
                            removeService(svc)
                          }}
                        />
                      )
                    })}
                    {editingIdx != null ? (
                      <div className="hp-svc-edit">
                        <input value={svcForm.name} aria-label={tg('ui.153')} onChange={(e) => setSvcForm((p) => ({ ...p, name: e.target.value }))} />
                        <select value={svcForm.kind} aria-label={tg('hp.services')} onChange={(e) => setSvcForm((p) => ({ ...p, kind: e.target.value as HostServiceKind }))}>
                          {KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <input style={{ width: 80 }} value={svcForm.port} aria-label={tg('hp.port')} placeholder={tg('hp.port')} onChange={(e) => setSvcForm((p) => ({ ...p, port: e.target.value }))} />
                        <input value={svcForm.unit} aria-label={tg('hp.unit')} placeholder={tg('hp.unit')} onChange={(e) => setSvcForm((p) => ({ ...p, unit: e.target.value }))} />
                        <input value={svcForm.image} aria-label={tg('hp.image')} placeholder={tg('hp.image')} onChange={(e) => setSvcForm((p) => ({ ...p, image: e.target.value }))} />
                        <input value={svcForm.notes} aria-label={tg('hp.svcNotes')} placeholder={tg('hp.svcNotes')} onChange={(e) => setSvcForm((p) => ({ ...p, notes: e.target.value }))} />
                        <button type="button" onClick={() => setEditingIdx(null)}>
                          {tg('dlg.cancel')}
                        </button>
                        <button type="button" className="primary" onClick={() => void commitSvc()}>
                          {tg('conn.save')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            ) : null}
          </section>
        </aside>
        {narrow ? null : (
          <div
            className="hp-resizer"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => {
              const startX = e.clientX
              const startW = sideW
              const move = (ev: PointerEvent) => {
                const next = Math.min(480, Math.max(300, startW + (ev.clientX - startX)))
                setSideW(next)
              }
              const up = () => {
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
                setSideW((w) => {
                  localStorage.setItem('aiss.hp.leftW', String(w))
                  return w
                })
              }
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
            }}
          />
        )}
        <section className="hp-notes">
          <div className="hp-notes-bar">
            <strong>{tg('hp.notes')}</strong>
            <span className="hp-notes-meta">
              {tg('hp.lines', { n: noteLines })}
              {updatedAt ? ` · ${tg('hp.updated')} ${formatUpdated(updatedAt)}` : ''}
              {noteStatus === 'saving' ? ` · ${tg('hp.saving')}` : null}
              {noteStatus === 'saved' ? ` · ${tg('hp.saved')} ✓` : null}
              {noteStatus === 'error' ? (
                <>
                  {' · '}
                  {tg('hp.saveFailed')}{' '}
                  <button type="button" onClick={() => void saveNotes(notes)}>
                    {tg('upd.retry')}
                  </button>
                </>
              ) : null}
            </span>
            <div className="hp-seg" role="group" aria-label={tg('hp.notes')}>
              {(
                [
                  ['preview', tg('hp.preview')],
                  ['edit', tg('hp.edit')],
                  ['split', tg('hp.split')]
                ] as const
              ).map(([mode, label]) => (
                <button key={mode} type="button" className={notesMode === mode ? 'is-on' : ''} onClick={() => setNotesMode(mode)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {h2s.length >= 3 ? (
            <div className="hp-toc">
              <button type="button" onClick={() => setTocOpen((v) => !v)}>
                {tg('hp.contents')}
              </button>
              {tocOpen ? (
                <div className="hp-toc-pop">
                  {h2s.map((h, i) => (
                    <button
                      key={h + i}
                      type="button"
                      onClick={() => {
                        setTocOpen(false)
                        document.getElementById(`hp-h2-${i}`)?.scrollIntoView({ block: 'start' })
                      }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className={`hp-notes-stage hp-notes-stage--${notesMode}`}>
            {notesMode !== 'preview' ? (
              <textarea
                className="hp-notes-editor"
                value={notes}
                spellCheck={false}
                onChange={(e) => setNotes(e.target.value)}
              />
            ) : null}
            {notesMode !== 'edit' ? (
              notes.trim() ? (
                <div className="hp-notes-read">
                  <NotesMarkdownPreview markdown={notes} />
                </div>
              ) : (
                <div className="hp-empty hp-notes-empty">
                  <p>{tg('hp.notesEmpty')}</p>
                  <button type="button" className="primary" onClick={() => setNotesMode('edit')}>
                    {tg('hp.startWriting')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotes(tg('hp.noteTemplate'))
                      setNotesMode('edit')
                    }}
                  >
                    {tg('hp.insertTemplate')}
                  </button>
                </div>
              )
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

function SvcRow({
  svc,
  selected,
  menu,
  onSelect,
  onLogs,
  onEdit,
  onMenu,
  onCopy,
  onDelete
}: {
  svc: HostService
  selected: boolean
  menu: boolean
  onSelect: () => void
  onLogs: () => void
  onEdit: () => void
  onMenu: (e: ReactMouseEvent) => void
  onCopy: () => void
  onDelete: () => void
}) {
  const port = svc.ports?.[0]
  return (
    <div className={`hp-svc-row${selected ? ' is-selected' : ''}`} onClick={onSelect} onDoubleClick={onEdit} title={`${svc.name}${svc.image ? '\n' + svc.image : ''}`}>
      <span className={`hp-dot hp-dot--${kindBucket(svc.kind)}`} />
      <span className="hp-svc-name">{svc.name}</span>
      <span className="hp-svc-meta">
        {kindBucket(svc.kind) === 'other' ? tg('hp.other') : svc.kind}
        {port ? ` ${port}` : ''}
      </span>
      <span className="hp-svc-actions">
        <button type="button" className="st-icon-btn" title={tg('hp.viewLogs')} aria-label={tg('hp.viewLogs')} onClick={(e) => { e.stopPropagation(); onLogs() }}>
          ≡
        </button>
        <button type="button" className="st-icon-btn" title={tg('hp.edit')} aria-label={tg('hp.edit')} onClick={(e) => { e.stopPropagation(); onEdit() }}>
          ✎
        </button>
        <button type="button" className="st-icon-btn" title={tg('st.more')} aria-label={tg('st.more')} onClick={onMenu}>
          ⋯
        </button>
        {menu ? (
          <span className="hp-row-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            <button type="button" role="menuitem" onClick={onCopy}>
              {tg('hp.copyName')}
            </button>
            <button type="button" role="menuitem" className="danger" onClick={onDelete}>
              {tg('hp.delete')}
            </button>
          </span>
        ) : null}
      </span>
    </div>
  )
}
