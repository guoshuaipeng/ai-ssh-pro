import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppDialogKind } from '@shared/ipc'
import TerminalPane from './components/TerminalPane'
import AIPanel from './components/AIPanel'
import AppToolbar from './components/AppToolbar'
import AiConfigModal from './components/AiConfigModal'
import ConnectionConfigModal from './components/ConnectionConfigModal'
import type { SavedSessionProfile, SavedSessionsState, SshConnectOptions } from '@shared/ipc'

type Tab = {
  tabId: string
  sessionId: string
  title: string
}

function uuid(): string {
  return crypto.randomUUID()
}

export default function App() {
  const [dialog, setDialog] = useState<AppDialogKind | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sessionState, setSessionState] = useState<SavedSessionsState>({ folders: [], profiles: [] })
  const { folders, profiles } = sessionState

  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [label, setLabel] = useState('')

  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [smartPaste, setSmartPaste] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [parseNotes, setParseNotes] = useState<string | null>(null)

  /** 非空表示正在编辑侧栏已保存会话，保存时按 id 写回 */
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null)

  const [sessionMenu, setSessionMenu] = useState<{
    x: number
    y: number
    profile: SavedSessionProfile
  } | null>(null)
  const sessionMenuRef = useRef<HTMLDivElement>(null)
  const [folderMenu, setFolderMenu] = useState<{
    x: number
    y: number
    folderId: string
    folderName: string
  } | null>(null)
  const folderMenuRef = useRef<HTMLDivElement>(null)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [sideInfo, setSideInfo] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? null
  const activeSessionId = activeTab?.sessionId ?? null

  useEffect(() => {
    void window.aiss.sessions.list().then(setSessionState)
  }, [])

  useEffect(() => {
    return window.aiss.app.onOpenDialog((kind) => {
      if (kind === 'connection') setEditingSavedId(null)
      if (kind === 'debug') {
        void window.aiss.debug.openWindow()
        return
      }
      setDialog(kind)
    })
  }, [])

  useEffect(() => {
    return window.aiss.ssh.onStatus((st) => {
      if (st.status === 'error' && st.message) {
        setError(st.message)
      }
      if (st.status === 'closed') {
        setTabs((prev) => prev.filter((t) => t.sessionId !== st.sessionId))
      }
    })
  }, [])

  useEffect(() => {
    if (activeTabId && !tabs.some((t) => t.tabId === activeTabId)) {
      setActiveTabId(tabs[0]?.tabId ?? null)
    }
  }, [tabs, activeTabId])

  useEffect(() => {
    if (!sessionMenu && !folderMenu) return
    const onPointerDown = (e: PointerEvent) => {
      if (sessionMenu && sessionMenuRef.current?.contains(e.target as Node)) return
      if (folderMenu && folderMenuRef.current?.contains(e.target as Node)) return
      setSessionMenu(null)
      setFolderMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSessionMenu(null)
        setFolderMenu(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [sessionMenu, folderMenu])

  const persistSessionState = useCallback(async (next: SavedSessionsState) => {
    setSessionState(next)
    await window.aiss.sessions.save(next)
  }, [])

  const openSession = useCallback(async (opts: SshConnectOptions): Promise<boolean> => {
    setError(null)
    setConnecting(true)
    try {
      const { sessionId, meta } = await window.aiss.ssh.connect(opts)
      const title = meta.label ?? `${meta.username}@${meta.host}`
      const tabId = uuid()
      setTabs((prev) => [...prev, { tabId, sessionId, title }])
      setActiveTabId(tabId)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setConnecting(false)
    }
  }, [])

  const connectFromForm = useCallback(async () => {
    const p = Number(port) || 22
    const ok = await openSession({
      host: host.trim(),
      port: p,
      username: username.trim(),
      password: password || undefined,
      privateKeyPath: privateKeyPath.trim() || undefined,
      passphrase: passphrase || undefined,
      label: label.trim() || undefined
    })
    if (ok) {
      setDialog(null)
      setEditingSavedId(null)
    }
  }, [host, label, openSession, passphrase, password, port, privateKeyPath, username])

  const closeTab = useCallback(
    (tabId: string, sessionId: string) => {
      void window.aiss.ssh.disconnect(sessionId)
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      setActiveTabId((cur) => (cur === tabId ? null : cur))
    },
    []
  )

  const saveProfile = useCallback(() => {
    if (!host.trim() || !username.trim()) {
      setError('保存前请填写主机与用户名')
      return
    }
    const h = host.trim()
    const po = Number(port) || 22
    const u = username.trim()
    const base = {
      label: label.trim() || `${u}@${h}`,
      host: h,
      port: po,
      username: u,
      password: password.trim() || undefined,
      privateKeyPath: privateKeyPath.trim() || undefined,
      passphrase: passphrase.trim() || undefined
    }

    let nextProfiles: SavedSessionProfile[]
    if (editingSavedId) {
      const id = editingSavedId
      const prev = profiles.find((s) => s.id === id)
      const merged: SavedSessionProfile = { ...base, id }
      if (prev?.folderId) merged.folderId = prev.folderId
      const exists = profiles.some((s) => s.id === id)
      nextProfiles = exists ? profiles.map((s) => (s.id === id ? merged : s)) : [...profiles, merged]
    } else {
      const sameTarget = (s: SavedSessionProfile) => s.host === h && s.port === po && s.username === u
      const existing = profiles.find(sameTarget)
      const row: SavedSessionProfile = { ...base, id: existing?.id ?? uuid() }
      if (existing?.folderId) row.folderId = existing.folderId
      nextProfiles = existing ? profiles.map((s) => (s.id === existing.id ? row : s)) : [...profiles, row]
    }
    void persistSessionState({ folders, profiles: nextProfiles })
  }, [editingSavedId, folders, host, label, passphrase, password, persistSessionState, port, privateKeyPath, profiles, username])

  const applyProfileToForm = useCallback((profile: SavedSessionProfile) => {
    setHost(profile.host)
    setPort(String(profile.port))
    setUsername(profile.username)
    setPassword(profile.password ?? '')
    setPrivateKeyPath(profile.privateKeyPath ?? '')
    setPassphrase(profile.passphrase ?? '')
    setLabel(profile.label)
  }, [])

  const connectProfile = useCallback(
    (p: SavedSessionProfile) => {
      applyProfileToForm(p)
      void openSession({
        host: p.host,
        port: p.port,
        username: p.username,
        privateKeyPath: p.privateKeyPath,
        password: p.password?.trim() || undefined,
        passphrase: p.passphrase?.trim() || undefined,
        label: p.label
      })
    },
    [applyProfileToForm, openSession]
  )

  const removeProfile = useCallback(
    (id: string) => {
      void persistSessionState({ folders, profiles: profiles.filter((s) => s.id !== id) })
    },
    [folders, persistSessionState, profiles]
  )

  const folderIdSet = useMemo(() => new Set(folders.map((f) => f.id)), [folders])
  const rootProfiles = useMemo(
    () =>
      profiles
        .filter((p) => !p.folderId || !folderIdSet.has(p.folderId))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN')),
    [profiles, folderIdSet]
  )

  const profilesInFolder = useCallback(
    (fid: string) =>
      profiles
        .filter((p) => p.folderId === fid)
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN')),
    [profiles]
  )

  const toggleFolderExpanded = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const open = prev[id] !== false
      return { ...prev, [id]: !open }
    })
  }, [])

  const addFolder = useCallback(() => {
    const name = window.prompt('新建文件夹名称', '新文件夹')?.trim()
    if (!name) return
    const id = uuid()
    void persistSessionState({ folders: [...folders, { id, name }], profiles })
    setExpandedFolders((e) => ({ ...e, [id]: true }))
  }, [folders, persistSessionState, profiles])

  const renameFolder = useCallback(
    (folderId: string, currentName: string) => {
      const name = window.prompt('重命名文件夹', currentName)?.trim()
      if (!name) return
      void persistSessionState({
        folders: folders.map((f) => (f.id === folderId ? { ...f, name } : f)),
        profiles
      })
      setFolderMenu(null)
    },
    [folders, persistSessionState, profiles]
  )

  const deleteFolder = useCallback(
    (folderId: string) => {
      const nextProfiles = profiles.map((p) => {
        if (p.folderId !== folderId) return p
        const { folderId: _omit, ...rest } = p
        return rest as SavedSessionProfile
      })
      void persistSessionState({
        folders: folders.filter((f) => f.id !== folderId),
        profiles: nextProfiles
      })
      setFolderMenu(null)
    },
    [folders, persistSessionState, profiles]
  )

  const moveProfileToFolder = useCallback(
    (profileId: string, targetFolderId: string | undefined) => {
      const next = profiles.map((p) => {
        if (p.id !== profileId) return p
        if (!targetFolderId) {
          const { folderId: _omit, ...rest } = p
          return rest as SavedSessionProfile
        }
        return { ...p, folderId: targetFolderId }
      })
      void persistSessionState({ folders, profiles: next })
      setSessionMenu(null)
    },
    [folders, persistSessionState, profiles]
  )

  const importSessionsPick = useCallback(async () => {
    setError(null)
    setSideInfo(null)
    try {
      const res = await window.aiss.sessions.importPick()
      if (!res) return
      const { items, notes } = res
      const dupKey = (p: { host: string; port: number; username: string }) =>
        `${p.host}|${p.port}|${p.username}`.toLowerCase()
      const existingKeys = new Set(profiles.map(dupKey))
      const additions: SavedSessionProfile[] = []
      for (const d of items) {
        const k = dupKey(d)
        if (existingKeys.has(k)) continue
        existingKeys.add(k)
        additions.push({
          id: uuid(),
          label: d.label?.trim() || d.username,
          host: d.host,
          port: d.port,
          username: d.username,
          password: d.password,
          privateKeyPath: d.privateKeyPath,
          passphrase: d.passphrase
        })
      }
      if (additions.length) {
        void persistSessionState({ folders, profiles: [...profiles, ...additions] })
      }
      const tail = additions.length ? `已添加 ${additions.length} 条。` : '未添加新会话（可能已全部存在）。'
      setSideInfo([...notes, tail].join(' '))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [folders, persistSessionState, profiles])

  useEffect(() => {
    if (!sideInfo) return
    const t = window.setTimeout(() => setSideInfo(null), 12000)
    return () => window.clearTimeout(t)
  }, [sideInfo])

  const parseAndFillForm = useCallback(async () => {
    setError(null)
    setParseNotes(null)
    const blob = smartPaste.trim()
    if (!blob) return
    setAiParsing(true)
    try {
      const p = await window.aiss.ai.parseSshForm(blob)
      if (p.label != null && p.label !== '') setLabel(p.label)
      if (p.host != null && p.host !== '') setHost(p.host)
      if (p.port != null && Number.isFinite(p.port)) setPort(String(p.port))
      if (p.username != null && p.username !== '') setUsername(p.username)
      if (p.password != null) setPassword(p.password)
      if (p.privateKeyPath != null) setPrivateKeyPath(p.privateKeyPath)
      if (p.passphrase != null) setPassphrase(p.passphrase)
      setParseNotes(p.notes ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiParsing(false)
    }
  }, [smartPaste])

  return (
    <div className="app-root">
      <AppToolbar
        onOpenConnection={() => {
          setEditingSavedId(null)
          setDialog('connection')
        }}
        onOpenAi={() => setDialog('ai')}
        onOpenDebug={() => {
          try {
            const d = window.aiss?.debug
            if (!d?.openWindow) {
              window.alert('调试接口未加载：请执行 npm run build 后重启应用，或使用菜单「会话 → AI 助手调试」重试。')
              return
            }
            void d.openWindow()
          } catch (e) {
            console.error('[App] openDebugWindow', e)
            window.alert(e instanceof Error ? e.message : String(e))
          }
        }}
      />

      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-scroll">
            {error && dialog !== 'connection' && (
              <div
                style={{
                  color: 'var(--danger)',
                  fontSize: 11,
                  marginBottom: 12,
                  lineHeight: 1.4,
                  padding: 8,
                  background: 'var(--bg)',
                  borderRadius: 6,
                  border: '1px solid var(--border)'
                }}
              >
                {error}
              </div>
            )}

            {sideInfo && (
              <div className="sidebar-info-banner" role="status">
                {sideInfo}
              </div>
            )}

            <h3>已保存会话</h3>
            <div className="session-sidebar-toolbar">
              <button type="button" className="session-toolbar-btn" onClick={addFolder}>
                新建文件夹
              </button>
              <button type="button" className="session-toolbar-btn" onClick={() => void importSessionsPick()}>
                导入…
              </button>
            </div>
            <p className="session-sidebar-hint">
              支持 Xshell 的 .xsh 与 OpenSSH 的 config。Xshell 密码多为加密存储，无法导入时需在本应用内补填。
            </p>

            {folders.length === 0 && profiles.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>暂无</div>
            )}

            {folders.map((f) => {
              const expanded = expandedFolders[f.id] !== false
              const inFolder = profilesInFolder(f.id)
              return (
                <div key={f.id} className="session-folder-block">
                  <div
                    className="session-folder-row"
                    role="button"
                    tabIndex={0}
                    title="单击展开/折叠，右键管理文件夹"
                    onClick={() => toggleFolderExpanded(f.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setFolderMenu({ x: e.clientX, y: e.clientY, folderId: f.id, folderName: f.name })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleFolderExpanded(f.id)
                      }
                    }}
                  >
                    <span className="session-folder-chevron" aria-hidden>
                      {expanded ? '▼' : '▶'}
                    </span>
                    <span className="session-folder-name">{f.name}</span>
                    <span className="session-folder-count">{inFolder.length}</span>
                  </div>
                  {expanded &&
                    inFolder.map((p) => (
                      <div
                        key={p.id}
                        className="profile-row profile-row--in-folder"
                        title="双击连接，右键打开菜单"
                        onDoubleClick={() => connectProfile(p)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setSessionMenu({ x: e.clientX, y: e.clientY, profile: p })
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {p.username}@{p.host}:{p.port}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )
            })}

            {rootProfiles.map((p) => (
              <div
                key={p.id}
                className="profile-row"
                title="双击连接，右键打开菜单"
                onDoubleClick={() => connectProfile(p)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setSessionMenu({ x: e.clientX, y: e.clientY, profile: p })
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {p.username}@{p.host}:{p.port}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="main">
          <div className="tab-bar">
            {tabs.length === 0 && <span style={{ padding: '8px 12px', color: 'var(--muted)' }}>未打开会话</span>}
            {tabs.map((t) => (
              <button
                key={t.tabId}
                type="button"
                className={`tab ${t.tabId === activeTabId ? 'active' : ''}`}
                onClick={() => setActiveTabId(t.tabId)}
              >
                {t.title}
                <span
                  role="presentation"
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.tabId, t.sessionId)
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>

          <div className="terminal-stack">
            {tabs.map((t) => (
              <div key={t.tabId} className={`terminal-layer ${t.tabId === activeTabId ? 'active' : ''}`}>
                <TerminalPane sessionId={t.sessionId} active={t.tabId === activeTabId} />
              </div>
            ))}
          </div>
        </section>

        <AIPanel activeSessionId={activeSessionId} />
      </div>

      <ConnectionConfigModal
        open={dialog === 'connection'}
        title={editingSavedId ? '编辑已保存会话' : '新建连接'}
        saveProfileButtonLabel={editingSavedId ? '保存修改' : '保存到列表'}
        onClose={() => {
          setDialog(null)
          setEditingSavedId(null)
        }}
        error={error}
        host={host}
        setHost={setHost}
        port={port}
        setPort={setPort}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        privateKeyPath={privateKeyPath}
        setPrivateKeyPath={setPrivateKeyPath}
        passphrase={passphrase}
        setPassphrase={setPassphrase}
        label={label}
        setLabel={setLabel}
        smartPaste={smartPaste}
        setSmartPaste={setSmartPaste}
        parseNotes={parseNotes}
        aiParsing={aiParsing}
        connecting={connecting}
        onParseAndFill={parseAndFillForm}
        onConnect={connectFromForm}
        onSaveProfile={saveProfile}
      />

      <AiConfigModal open={dialog === 'ai'} onClose={() => setDialog(null)} />

      {sessionMenu && (
        <div
          ref={sessionMenuRef}
          className="session-context-menu session-context-menu--wide"
          style={{ left: sessionMenu.x, top: sessionMenu.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item"
            onClick={() => {
              connectProfile(sessionMenu.profile)
              setSessionMenu(null)
            }}
          >
            连接
          </button>
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item"
            onClick={() => {
              applyProfileToForm(sessionMenu.profile)
              setEditingSavedId(sessionMenu.profile.id)
              setSessionMenu(null)
              setDialog('connection')
            }}
          >
            编辑
          </button>
          <div className="session-context-menu-sub">移动到…</div>
          <div className="session-context-menu-scroll">
            <button
              type="button"
              role="menuitem"
              className="session-context-menu-item"
              disabled={!sessionMenu.profile.folderId}
              onClick={() => moveProfileToFolder(sessionMenu.profile.id, undefined)}
            >
              未分组
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitem"
                className="session-context-menu-item"
                disabled={sessionMenu.profile.folderId === f.id}
                onClick={() => moveProfileToFolder(sessionMenu.profile.id, f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item danger"
            onClick={() => {
              removeProfile(sessionMenu.profile.id)
              setSessionMenu(null)
            }}
          >
            删除
          </button>
        </div>
      )}

      {folderMenu && (
        <div
          ref={folderMenuRef}
          className="session-context-menu"
          style={{ left: folderMenu.x, top: folderMenu.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item"
            onClick={() => renameFolder(folderMenu.folderId, folderMenu.folderName)}
          >
            重命名…
          </button>
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item danger"
            onClick={() => deleteFolder(folderMenu.folderId)}
          >
            删除文件夹（会话移至未分组）
          </button>
        </div>
      )}
    </div>
  )
}
