import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  LocalPortForward,
  SavedSessionProfile,
  SavedSessionsState,
  SshConnectOptions,
  SshHostKeyPromptEvent,
  SshJumpHostOptions,
  TerminalPrefs
} from '@shared/ipc'
import { TERMINAL_PREFS_DEFAULTS } from '@shared/ipc'
import TerminalPane from './components/TerminalPane'
import SplitTerminalView from './components/SplitTerminalView'
import AIPanel from './components/AIPanel'
import AppToolbar from './components/AppToolbar'
import type { TitlebarMenuAction } from './components/TitlebarMenus'
import AiConfigModal from './components/AiConfigModal'
import ConnectionConfigModal from './components/ConnectionConfigModal'
import HostKeyConfirmModal from './components/HostKeyConfirmModal'
import SessionSearchBar from './components/SessionSearchBar'
import { exportSessionsAndCopy } from './components/SessionExportButtons'
import SnippetsPanel from './components/SnippetsPanel'
import TerminalPrefsModal from './components/TerminalPrefsModal'
import UiThemeModal from './components/UiThemeModal'
import SftpPanel from './components/SftpPanel'
import RemoteTextEditor from './components/RemoteTextEditor'
import DockerPanel from './components/DockerPanel'
import SessionDockerBranch, { type DockerTreeCache } from './components/SessionDockerBranch'
import HostInventoryModal, { type HostInventoryLink } from './components/HostInventoryModal'
import LayoutResizer from './components/LayoutResizer'
import { filterProfiles } from './lib/session-filter'
import { clearRemoteFileDirty, isRemoteFileDirty } from './lib/remote-file-dirty'
import {
  clampAiWidth,
  clampSidebarWidth,
  loadLayoutPrefs,
  saveLayoutPrefs,
  withPaneToggle,
  type LayoutPrefs
} from './lib/layout-prefs'
import {
  loadSidebarExpandPrefs,
  saveSidebarExpandPrefs
} from './lib/sidebar-expand-prefs'

/** 侧栏树：列表显示名称，悬停看连接详情 */
function profileSidebarTitle(p: SavedSessionProfile): string {
  const name = p.label?.trim() || `${p.username}@${p.host}`
  const lines = [
    name,
    `${p.username}@${p.host}:${p.port}`,
    p.privateKeyPath ? `密钥：${p.privateKeyPath}` : null,
    '双击连接，右键打开菜单'
  ].filter(Boolean)
  return lines.join('\n')
}

function profileSidebarLabel(p: SavedSessionProfile): string {
  return p.label?.trim() || p.host || `${p.username}@${p.host}` || '—'
}

type TabView =
  | 'session'
  | 'connection'
  | 'inventory'
  | 'sftp'
  | 'remote-file'
  | 'ai'
  | 'terminalPrefs'
  | 'uiTheme'
  | 'snippets'
  | 'docker'

type SettingsTabView = 'ai' | 'terminalPrefs' | 'uiTheme' | 'snippets'

const SETTINGS_TAB_TITLES: Record<SettingsTabView, string> = {
  ai: 'AI 配置',
  terminalPrefs: '终端外观',
  uiTheme: '界面主题',
  snippets: '命令片段'
}

const WORKSPACE_TAB_VIEWS = new Set<TabView>([
  'connection',
  'inventory',
  'sftp',
  'remote-file',
  'ai',
  'terminalPrefs',
  'uiTheme',
  'snippets',
  'docker'
])

type Tab = {
  tabId: string
  sessionId: string
  title: string
  /** 用于断线后重连；编辑/档案 tab 用占位 */
  connectOpts: SshConnectOptions
  status: 'connecting' | 'connected' | 'disconnected'
  /** 默认 session；其余为工作区面板 tab */
  view?: TabView
  /** 来自已保存会话时写入，供 AI 历史键 */
  profileId?: string
  /** 关联主机知识库档案 id */
  hostInventoryId?: string
  kind?: 'ssh' | 'local'
  /** 文件传输 / 远端编辑 / Docker 绑定的 SSH sessionId */
  boundSessionId?: string
  /** 远端文件路径（remote-file） */
  remotePath?: string
  /** Docker 详情 */
  dockerKind?: 'container' | 'compose'
  dockerResourceId?: string
  dockerResourceName?: string
}

const PLACEHOLDER_CONNECT: SshConnectOptions = {
  host: '',
  port: 22,
  username: ''
}

function uuid(): string {
  return crypto.randomUUID()
}

export default function App() {
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

  const [jumpHost, setJumpHost] = useState('')
  const [jumpPort, setJumpPort] = useState('22')
  const [jumpUsername, setJumpUsername] = useState('')
  const [jumpPassword, setJumpPassword] = useState('')
  const [jumpPrivateKeyPath, setJumpPrivateKeyPath] = useState('')
  const [jumpPassphrase, setJumpPassphrase] = useState('')

  const [forwardLocalPort, setForwardLocalPort] = useState('')
  const [forwardRemoteHost, setForwardRemoteHost] = useState('')
  const [forwardRemotePort, setForwardRemotePort] = useState('')

  const [sessionSearch, setSessionSearch] = useState('')
  const [terminalPrefs, setTerminalPrefs] = useState<TerminalPrefs>(TERMINAL_PREFS_DEFAULTS)
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [broadcastEnabled, setBroadcastEnabled] = useState(false)
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null)
  const [localShellAvailable, setLocalShellAvailable] = useState(false)
  const [layout, setLayout] = useState<LayoutPrefs>(() => loadLayoutPrefs())

  const updateLayout = useCallback((patch: Partial<LayoutPrefs> | ((prev: LayoutPrefs) => LayoutPrefs)) => {
    setLayout((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      saveLayoutPrefs(next)
      return next
    })
  }, [])

  const toggleSidebar = useCallback(() => {
    updateLayout((p) => withPaneToggle(p, 'sidebar', !p.showSidebar))
  }, [updateLayout])
  const toggleMain = useCallback(() => {
    updateLayout((p) => withPaneToggle(p, 'main', !p.showMain))
  }, [updateLayout])
  const toggleAi = useCallback(() => {
    updateLayout((p) => withPaneToggle(p, 'ai', !p.showAi))
  }, [updateLayout])

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
  const [inventoryLink, setInventoryLink] = useState<HostInventoryLink | undefined>(undefined)
  const sessionMenuRef = useRef<HTMLDivElement>(null)
  const [folderMenu, setFolderMenu] = useState<{
    x: number
    y: number
    folderId: string
    folderName: string
  } | null>(null)
  const folderMenuRef = useRef<HTMLDivElement>(null)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    return loadSidebarExpandPrefs().folders
  })
  /** 主机 Docker 树不跨会话恢复，避免「展开但未加载」 */
  const [expandedHosts, setExpandedHosts] = useState<Record<string, boolean>>({})
  const [expandedDockerGroups, setExpandedDockerGroups] = useState<Record<string, boolean>>({})
  const [dockerTreeByProfileId, setDockerTreeByProfileId] = useState<Record<string, DockerTreeCache>>({})
  const dockerTreeByProfileIdRef = useRef(dockerTreeByProfileId)
  dockerTreeByProfileIdRef.current = dockerTreeByProfileId
  const [sideInfo, setSideInfo] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [hostKeyPrompt, setHostKeyPrompt] = useState<SshHostKeyPromptEvent | null>(null)
  const [reconnectingTabId, setReconnectingTabId] = useState<string | null>(null)
  /** 连接中关闭的 tab，避免连上后仍挂会话 */
  const cancelledConnectingTabsRef = useRef(new Set<string>())

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? null
  const activeIsSession = !activeTab?.view || activeTab.view === 'session'
  const activeSessionId =
    activeIsSession && activeTab?.status === 'connected' ? activeTab.sessionId : null
  const activeIsSsh = Boolean(activeSessionId && activeTab?.kind !== 'local')
  const isRecordingActive = Boolean(activeSessionId && recordingSessionId === activeSessionId)
  const highlightedProfileId = selectedProfileId || activeTab?.profileId || null

  const isProfileHighlighted = useCallback(
    (profileId: string) => highlightedProfileId === profileId,
    [highlightedProfileId]
  )

  const buildJumpHost = useCallback((): SshJumpHostOptions | undefined => {
    if (!jumpHost.trim() || !jumpUsername.trim()) return undefined
    return {
      host: jumpHost.trim(),
      port: Number(jumpPort) || 22,
      username: jumpUsername.trim(),
      password: jumpPassword || undefined,
      privateKeyPath: jumpPrivateKeyPath.trim() || undefined,
      passphrase: jumpPassphrase || undefined
    }
  }, [jumpHost, jumpPassphrase, jumpPassword, jumpPort, jumpPrivateKeyPath, jumpUsername])

  const buildForwards = useCallback((): LocalPortForward[] | undefined => {
    const lpRaw = forwardLocalPort.trim()
    const rh = forwardRemoteHost.trim()
    const rpRaw = forwardRemotePort.trim()
    if (!lpRaw || !rh || !rpRaw) return undefined
    const localPort = Number(lpRaw)
    const remotePort = Number(rpRaw)
    if (!Number.isFinite(localPort) || !Number.isFinite(remotePort)) return undefined
    return [{ localPort, remoteHost: rh, remotePort }]
  }, [forwardLocalPort, forwardRemoteHost, forwardRemotePort])

  useEffect(() => {
    void window.aiss.sessions
      .list()
      .then(setSessionState)
      .catch((e) => {
        console.error('[app] sessions.list failed', e)
        setError(e instanceof Error ? e.message : String(e))
      })
  }, [])

  useEffect(() => {
    void window.aiss.terminal.getPrefs().then(setTerminalPrefs)
    void window.aiss.ssh.isLocalShellAvailable().then(setLocalShellAvailable).catch(() => setLocalShellAvailable(false))
  }, [])

  useEffect(() => {
    return window.aiss.ssh.onStatus((st) => {
      if (st.status === 'error' && st.message) {
        setError(st.message)
      }
      if (st.status === 'closed') {
        setTabs((prev) =>
          prev.map((t) =>
            t.sessionId === st.sessionId ? { ...t, status: 'disconnected' as const } : t
          )
        )
        setRecordingSessionId((cur) => (cur === st.sessionId ? null : cur))
        if (st.message) setError(st.message)
      }
    })
  }, [])

  useEffect(() => {
    return window.aiss.ssh.onHostKeyPrompt((payload) => {
      setHostKeyPrompt(payload)
    })
  }, [])

  const respondHostKey = useCallback(async (accept: boolean, alwaysTrust: boolean) => {
    const prompt = hostKeyPrompt
    setHostKeyPrompt(null)
    if (!prompt) return
    await window.aiss.ssh.respondHostKey({
      requestId: prompt.requestId,
      accept,
      alwaysTrust
    })
  }, [hostKeyPrompt])

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

  const openSession = useCallback(
    async (
      opts: SshConnectOptions,
      extra?: { profileId?: string; hostInventoryId?: string; kind?: 'ssh' | 'local' }
    ): Promise<string | null> => {
      setError(null)
      setConnecting(true)
      const tabId = uuid()
      const title = opts.label?.trim() || `${opts.username}@${opts.host}`
      cancelledConnectingTabsRef.current.delete(tabId)
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title,
          connectOpts: opts,
          status: 'connecting',
          profileId: extra?.profileId,
          hostInventoryId: extra?.hostInventoryId,
          kind: extra?.kind ?? 'ssh'
        }
      ])
      setActiveTabId(tabId)
      try {
        const { sessionId, meta } = await window.aiss.ssh.connect(opts)
        if (cancelledConnectingTabsRef.current.has(tabId)) {
          cancelledConnectingTabsRef.current.delete(tabId)
          void window.aiss.ssh.disconnect(sessionId)
          return null
        }
        const nextTitle = meta.label ?? title
        const connectOpts: SshConnectOptions = {
          ...opts,
          host: meta.host,
          port: meta.port,
          username: meta.username,
          label: meta.label,
          termCols: meta.termCols,
          termRows: meta.termRows
        }
        setTabs((prev) => {
          if (!prev.some((t) => t.tabId === tabId)) {
            void window.aiss.ssh.disconnect(sessionId)
            return prev
          }
          return prev.map((t) =>
            t.tabId === tabId
              ? {
                  ...t,
                  sessionId,
                  title: nextTitle,
                  connectOpts,
                  status: 'connected',
                  kind: extra?.kind ?? meta.kind ?? 'ssh'
                }
              : t
          )
        })
        return sessionId
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        setTabs((prev) =>
          prev.map((t) => (t.tabId === tabId ? { ...t, status: 'disconnected' } : t))
        )
        return null
      } finally {
        setConnecting(false)
      }
    },
    []
  )

  const reconnectTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.tabId === tabId)
      if (!tab || tab.status !== 'disconnected') return
      setError(null)
      setReconnectingTabId(tabId)
      try {
        if (tab.kind === 'local') {
          const { sessionId, meta } = await window.aiss.ssh.openLocalShell()
          setTabs((prev) =>
            prev.map((t) =>
              t.tabId === tabId
                ? {
                    ...t,
                    sessionId,
                    title: meta.label ?? t.title,
                    status: 'connected',
                    kind: 'local',
                    connectOpts: {
                      ...t.connectOpts,
                      termCols: meta.termCols,
                      termRows: meta.termRows
                    }
                  }
                : t
            )
          )
          return
        }
        const { sessionId, meta } = await window.aiss.ssh.connect({
          ...tab.connectOpts,
          termCols: tab.connectOpts.termCols,
          termRows: tab.connectOpts.termRows
        })
        setTabs((prev) =>
          prev.map((t) =>
            t.tabId === tabId
              ? {
                  ...t,
                  sessionId,
                  title: meta.label ?? t.title,
                  status: 'connected',
                  connectOpts: {
                    ...t.connectOpts,
                    termCols: meta.termCols,
                    termRows: meta.termRows
                  }
                }
              : t
          )
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setReconnectingTabId(null)
      }
    },
    [tabs]
  )

  const connectFromForm = useCallback(async () => {
    const p = Number(port) || 22
    const jump = buildJumpHost()
    const forwards = buildForwards()
    const ok = await openSession(
      {
        host: host.trim(),
        port: p,
        username: username.trim(),
        password: password || undefined,
        privateKeyPath: privateKeyPath.trim() || undefined,
        passphrase: passphrase || undefined,
        label: label.trim() || undefined,
        ...(jump ? { jumpHost: jump } : {}),
        ...(forwards ? { forwards } : {})
      },
      editingSavedId
        ? {
            profileId: editingSavedId,
            hostInventoryId: profiles.find((s) => s.id === editingSavedId)?.hostInventoryId
          }
        : undefined
    )
    if (ok) {
      setTabs((prev) => prev.filter((t) => t.view !== 'connection'))
      setEditingSavedId(null)
    }
  }, [
    buildForwards,
    buildJumpHost,
    editingSavedId,
    host,
    label,
    openSession,
    passphrase,
    password,
    port,
    privateKeyPath,
    profiles,
    username
  ])

  const closeTab = useCallback((tabId: string, sessionId: string, status: Tab['status'], view?: TabView) => {
    if (view === 'connection') {
      setEditingSavedId(null)
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      setActiveTabId((cur) => (cur === tabId ? null : cur))
      return
    }
    if (view === 'inventory') {
      setInventoryLink(undefined)
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      setActiveTabId((cur) => (cur === tabId ? null : cur))
      return
    }
    if (
      view === 'sftp' ||
      view === 'ai' ||
      view === 'terminalPrefs' ||
      view === 'uiTheme' ||
      view === 'snippets' ||
      view === 'docker'
    ) {
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      setActiveTabId((cur) => (cur === tabId ? null : cur))
      return
    }
    if (view === 'remote-file') {
      if (isRemoteFileDirty(tabId)) {
        if (!window.confirm('有未保存的修改，确定关闭？')) return
      }
      clearRemoteFileDirty(tabId)
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      setActiveTabId((cur) => (cur === tabId ? null : cur))
      return
    }
    if (status === 'connecting') {
      cancelledConnectingTabsRef.current.add(tabId)
    }
    if (status === 'connected' && sessionId) {
      void window.aiss.ssh.disconnect(sessionId)
    }
    setRecordingSessionId((cur) => (cur === sessionId ? null : cur))
    setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
    setActiveTabId((cur) => (cur === tabId ? null : cur))
  }, [])

  const ensureMainVisible = useCallback(() => {
    updateLayout((p) => (p.showMain ? p : withPaneToggle(p, 'main', true)))
  }, [updateLayout])

  const saveProfile = useCallback(() => {
    if (!host.trim() || !username.trim()) {
      setError('保存前请填写主机与用户名')
      return
    }
    const h = host.trim()
    const po = Number(port) || 22
    const u = username.trim()
    const jump = buildJumpHost()
    const forwards = buildForwards()
    const base: Omit<SavedSessionProfile, 'id' | 'folderId'> = {
      label: label.trim() || `${u}@${h}`,
      host: h,
      port: po,
      username: u,
      password: password.trim() || undefined,
      privateKeyPath: privateKeyPath.trim() || undefined,
      passphrase: passphrase.trim() || undefined,
      ...(jump ? { jumpHost: jump } : {}),
      ...(forwards ? { forwards } : {})
    }

    let nextProfiles: SavedSessionProfile[]
    if (editingSavedId) {
      const id = editingSavedId
      const prev = profiles.find((s) => s.id === id)
      const merged: SavedSessionProfile = { ...base, id }
      if (prev?.folderId) merged.folderId = prev.folderId
      if (prev?.hostInventoryId) merged.hostInventoryId = prev.hostInventoryId
      const exists = profiles.some((s) => s.id === id)
      nextProfiles = exists ? profiles.map((s) => (s.id === id ? merged : s)) : [...profiles, merged]
    } else {
      const sameTarget = (s: SavedSessionProfile) => s.host === h && s.port === po && s.username === u
      const existing = profiles.find(sameTarget)
      const row: SavedSessionProfile = { ...base, id: existing?.id ?? uuid() }
      if (existing?.folderId) row.folderId = existing.folderId
      if (existing?.hostInventoryId) row.hostInventoryId = existing.hostInventoryId
      nextProfiles = existing ? profiles.map((s) => (s.id === existing.id ? row : s)) : [...profiles, row]
    }
    void persistSessionState({ folders, profiles: nextProfiles })
  }, [
    buildForwards,
    buildJumpHost,
    editingSavedId,
    folders,
    host,
    label,
    passphrase,
    password,
    persistSessionState,
    port,
    privateKeyPath,
    profiles,
    username
  ])

  const applyProfileToForm = useCallback((profile: SavedSessionProfile) => {
    setHost(profile.host)
    setPort(String(profile.port))
    setUsername(profile.username)
    setPassword(profile.password ?? '')
    setPrivateKeyPath(profile.privateKeyPath ?? '')
    setPassphrase(profile.passphrase ?? '')
    setLabel(profile.label)
    setJumpHost(profile.jumpHost?.host ?? '')
    setJumpPort(String(profile.jumpHost?.port ?? 22))
    setJumpUsername(profile.jumpHost?.username ?? '')
    setJumpPassword(profile.jumpHost?.password ?? '')
    setJumpPrivateKeyPath(profile.jumpHost?.privateKeyPath ?? '')
    setJumpPassphrase(profile.jumpHost?.passphrase ?? '')
    const fwd = profile.forwards?.[0]
    setForwardLocalPort(fwd ? String(fwd.localPort) : '')
    setForwardRemoteHost(fwd?.remoteHost ?? '')
    setForwardRemotePort(fwd ? String(fwd.remotePort) : '')
  }, [])

  const openConnectionEditor = useCallback(
    (profile?: SavedSessionProfile) => {
      ensureMainVisible()
      setError(null)
      if (profile) {
        applyProfileToForm(profile)
        setEditingSavedId(profile.id)
      } else {
        setEditingSavedId(null)
      }
      const title = profile ? `编辑 ${profileSidebarLabel(profile)}` : '新建连接'
      const existing = tabs.find((t) => t.view === 'connection')
      if (existing) {
        setTabs((prev) => prev.map((t) => (t.tabId === existing.tabId ? { ...t, title } : t)))
        setActiveTabId(existing.tabId)
        return
      }
      const tabId = uuid()
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title,
          connectOpts: PLACEHOLDER_CONNECT,
          status: 'connected',
          view: 'connection'
        }
      ])
      setActiveTabId(tabId)
    },
    [applyProfileToForm, ensureMainVisible, tabs]
  )

  const openInventoryEditor = useCallback(
    (link?: HostInventoryLink) => {
      ensureMainVisible()
      setInventoryLink(link)
      const title = link?.host?.trim()
        ? `主机档案 · ${link.host.trim()}`
        : link?.label?.trim()
          ? `主机档案 · ${link.label.trim()}`
          : '主机档案'
      const existing = tabs.find((t) => t.view === 'inventory')
      if (existing) {
        setTabs((prev) => prev.map((t) => (t.tabId === existing.tabId ? { ...t, title } : t)))
        setActiveTabId(existing.tabId)
        return
      }
      const tabId = uuid()
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title,
          connectOpts: PLACEHOLDER_CONNECT,
          status: 'connected',
          view: 'inventory'
        }
      ])
      setActiveTabId(tabId)
    },
    [ensureMainVisible, tabs]
  )

  const openSftpTransfer = useCallback(() => {
    ensureMainVisible()
    const sshTab = tabs.find(
      (t) =>
        t.tabId === activeTabId &&
        (!t.view || t.view === 'session') &&
        t.kind !== 'local' &&
        t.status === 'connected' &&
        t.sessionId
    )
    const fallback = tabs.find(
      (t) =>
        (!t.view || t.view === 'session') &&
        t.kind !== 'local' &&
        t.status === 'connected' &&
        t.sessionId
    )
    const bound = sshTab ?? fallback
    if (!bound) {
      setError('请先连接一个 SSH 会话，再打开文件传输')
      return
    }
    setError(null)
    const title = `文件传输 · ${bound.title}`
    const existing = tabs.find((t) => t.view === 'sftp')
    if (existing) {
      setTabs((prev) =>
        prev.map((t) =>
          t.tabId === existing.tabId
            ? { ...t, title, boundSessionId: bound.sessionId, connectOpts: bound.connectOpts }
            : t
        )
      )
      setActiveTabId(existing.tabId)
      return
    }
    const tabId = uuid()
    setTabs((prev) => [
      ...prev,
      {
        tabId,
        sessionId: '',
        title,
        connectOpts: bound.connectOpts,
        status: 'connected',
        view: 'sftp',
        boundSessionId: bound.sessionId
      }
    ])
    setActiveTabId(tabId)
  }, [activeTabId, ensureMainVisible, tabs])

  const openSettingsTab = useCallback(
    (view: SettingsTabView) => {
      ensureMainVisible()
      const title = SETTINGS_TAB_TITLES[view]
      const existing = tabs.find((t) => t.view === view)
      if (existing) {
        setActiveTabId(existing.tabId)
        return
      }
      const tabId = uuid()
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title,
          connectOpts: PLACEHOLDER_CONNECT,
          status: 'connected',
          view
        }
      ])
      setActiveTabId(tabId)
    },
    [ensureMainVisible, tabs]
  )

  const openRemoteFileEditor = useCallback(
    (info: { sessionId: string; remotePath: string; name: string; connectOpts?: SshConnectOptions }) => {
      ensureMainVisible()
      const existing = tabs.find(
        (t) => t.view === 'remote-file' && t.boundSessionId === info.sessionId && t.remotePath === info.remotePath
      )
      if (existing) {
        setActiveTabId(existing.tabId)
        return
      }
      const tabId = uuid()
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title: info.name,
          connectOpts: info.connectOpts ?? PLACEHOLDER_CONNECT,
          status: 'connected',
          view: 'remote-file',
          boundSessionId: info.sessionId,
          remotePath: info.remotePath
        }
      ])
      setActiveTabId(tabId)
    },
    [ensureMainVisible, tabs]
  )

  const findConnectedSessionForProfile = useCallback(
    (profile: SavedSessionProfile): Tab | null => {
      const activeMatch =
        activeTab &&
        (!activeTab.view || activeTab.view === 'session') &&
        activeTab.kind !== 'local' &&
        activeTab.status === 'connected' &&
        activeTab.sessionId &&
        (activeTab.profileId === profile.id ||
          (activeTab.connectOpts.host === profile.host &&
            activeTab.connectOpts.username === profile.username &&
            (activeTab.connectOpts.port || 22) === (profile.port || 22)))
          ? activeTab
          : null
      if (activeMatch) return activeMatch
      return (
        tabs.find(
          (t) =>
            (!t.view || t.view === 'session') &&
            t.kind !== 'local' &&
            t.status === 'connected' &&
            t.sessionId &&
            (t.profileId === profile.id ||
              (t.connectOpts.host === profile.host &&
                t.connectOpts.username === profile.username &&
                (t.connectOpts.port || 22) === (profile.port || 22)))
        ) ?? null
      )
    },
    [activeTab, tabs]
  )

  const loadDockerTreeForProfile = useCallback(
    async (profile: SavedSessionProfile, force = false, opts?: { expandWhenReady?: boolean }) => {
      const expandWhenReady = Boolean(opts?.expandWhenReady)
      const cached = dockerTreeByProfileIdRef.current[profile.id]

      if (!force && cached?.status === 'ready' && cached.data) {
        if (expandWhenReady) {
          setExpandedHosts((prev) => ({ ...prev, [profile.id]: true }))
        }
        return
      }

      if (cached?.status === 'connecting' || cached?.status === 'loading') {
        return
      }

      let sessionId = findConnectedSessionForProfile(profile)?.sessionId

      if (!sessionId) {
        setDockerTreeByProfileId((prev) => ({
          ...prev,
          [profile.id]: {
            status: 'connecting',
            data: prev[profile.id]?.data,
            sessionId: prev[profile.id]?.sessionId
          }
        }))
        applyProfileToForm(profile)
        sessionId =
          (await openSession(
            {
              host: profile.host,
              port: profile.port,
              username: profile.username,
              privateKeyPath: profile.privateKeyPath,
              password: profile.password?.trim() || undefined,
              passphrase: profile.passphrase?.trim() || undefined,
              label: profile.label,
              ...(profile.jumpHost?.host?.trim() && profile.jumpHost.username?.trim()
                ? { jumpHost: profile.jumpHost }
                : {}),
              ...(profile.forwards?.length ? { forwards: profile.forwards } : {})
            },
            { profileId: profile.id, hostInventoryId: profile.hostInventoryId }
          )) || undefined
        if (!sessionId) {
          setDockerTreeByProfileId((prev) => ({
            ...prev,
            [profile.id]: {
              status: 'error',
              error: '连接失败，无法加载 Docker',
              data: prev[profile.id]?.data
            }
          }))
          if (expandWhenReady) {
            setExpandedHosts((prev) => ({ ...prev, [profile.id]: true }))
          }
          return
        }
      }

      const again = dockerTreeByProfileIdRef.current[profile.id]
      if (!force && again?.status === 'ready' && again.data) {
        if (expandWhenReady) {
          setExpandedHosts((prev) => ({ ...prev, [profile.id]: true }))
        }
        return
      }

      setDockerTreeByProfileId((prev) => ({
        ...prev,
        [profile.id]: {
          status: 'loading',
          sessionId,
          data: prev[profile.id]?.data
        }
      }))
      try {
        const data = await window.aiss.docker.listTree(sessionId)
        setDockerTreeByProfileId((prev) => ({
          ...prev,
          [profile.id]: { status: 'ready', data, sessionId }
        }))
        if (expandWhenReady) {
          setExpandedHosts((prev) => ({ ...prev, [profile.id]: true }))
        }
      } catch (e) {
        setDockerTreeByProfileId((prev) => ({
          ...prev,
          [profile.id]: {
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
            sessionId,
            data: prev[profile.id]?.data
          }
        }))
        if (expandWhenReady) {
          setExpandedHosts((prev) => ({ ...prev, [profile.id]: true }))
        }
      }
    },
    [applyProfileToForm, findConnectedSessionForProfile, openSession]
  )

  const toggleHostExpanded = useCallback(
    (profile: SavedSessionProfile) => {
      const tree = dockerTreeByProfileId[profile.id]
      const busy = tree?.status === 'connecting' || tree?.status === 'loading'
      if (busy) return

      if (expandedHosts[profile.id]) {
        setExpandedHosts((prev) => ({ ...prev, [profile.id]: false }))
        return
      }

      // 有缓存：直接展开，不再请求
      if (tree?.status === 'ready' && tree.data) {
        setExpandedHosts((prev) => ({ ...prev, [profile.id]: true }))
        return
      }

      void loadDockerTreeForProfile(profile, false, { expandWhenReady: true })
    },
    [dockerTreeByProfileId, expandedHosts, loadDockerTreeForProfile]
  )

  const openDockerDetail = useCallback(
    (info: {
      profile: SavedSessionProfile
      kind: 'container' | 'compose'
      resourceId: string
      resourceName: string
    }) => {
      const bound = findConnectedSessionForProfile(info.profile)
      if (!bound?.sessionId) {
        setError('请先连接该主机，再打开 Docker 详情')
        return
      }
      ensureMainVisible()
      setError(null)
      const existing = tabs.find(
        (t) =>
          t.view === 'docker' &&
          t.boundSessionId === bound.sessionId &&
          t.dockerKind === info.kind &&
          t.dockerResourceId === info.resourceId
      )
      if (existing) {
        setActiveTabId(existing.tabId)
        return
      }
      const tabId = uuid()
      const title =
        info.kind === 'container'
          ? `容器 · ${info.resourceName}`
          : `Compose · ${info.resourceName}`
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title,
          connectOpts: bound.connectOpts,
          status: 'connected',
          view: 'docker',
          boundSessionId: bound.sessionId,
          profileId: info.profile.id,
          dockerKind: info.kind,
          dockerResourceId: info.resourceId,
          dockerResourceName: info.resourceName
        }
      ])
      setActiveTabId(tabId)
    },
    [ensureMainVisible, findConnectedSessionForProfile, tabs]
  )

  const openDockerShell = useCallback(
    async (info: {
      parentSessionId: string
      containerId: string
      containerName: string
      connectOpts: SshConnectOptions
      profileId?: string
    }) => {
      ensureMainVisible()
      setError(null)
      const tabId = uuid()
      const title = `容器壳 · ${info.containerName}`
      cancelledConnectingTabsRef.current.delete(tabId)
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title,
          connectOpts: info.connectOpts,
          status: 'connecting',
          profileId: info.profileId,
          kind: 'ssh'
        }
      ])
      setActiveTabId(tabId)
      try {
        const { sessionId, meta } = await window.aiss.docker.openShell(
          info.parentSessionId,
          info.containerId,
          {
            termCols: info.connectOpts.termCols,
            termRows: info.connectOpts.termRows,
            label: title
          }
        )
        if (cancelledConnectingTabsRef.current.has(tabId)) {
          cancelledConnectingTabsRef.current.delete(tabId)
          void window.aiss.ssh.disconnect(sessionId)
          return
        }
        setTabs((prev) => {
          if (!prev.some((t) => t.tabId === tabId)) {
            void window.aiss.ssh.disconnect(sessionId)
            return prev
          }
          return prev.map((t) =>
            t.tabId === tabId
              ? {
                  ...t,
                  sessionId,
                  title: meta.label ?? title,
                  status: 'connected' as const,
                  kind: 'ssh' as const
                }
              : t
          )
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        setTabs((prev) =>
          prev.map((t) => (t.tabId === tabId ? { ...t, status: 'disconnected' as const } : t))
        )
      }
    },
    [ensureMainVisible]
  )

  const refreshDockerForActiveHost = useCallback(() => {
    const t = tabs.find((x) => x.tabId === activeTabId) ?? null
    const sessionTab = t && (!t.view || t.view === 'session') && t.kind !== 'local' ? t : null
    const profile =
      (sessionTab?.profileId && profiles.find((p) => p.id === sessionTab.profileId)) ||
      profiles.find(
        (p) =>
          sessionTab &&
          p.host === sessionTab.connectOpts.host &&
          p.username === sessionTab.connectOpts.username
      )
    if (!profile) {
      setError('请先打开并激活一个已保存主机的 SSH 会话，再刷新 Docker')
      return
    }
    if (expandedHosts[profile.id]) {
      void loadDockerTreeForProfile(profile, true)
    } else {
      void loadDockerTreeForProfile(profile, true, { expandWhenReady: true })
    }
  }, [activeTabId, expandedHosts, loadDockerTreeForProfile, profiles, tabs])

  const connectProfile = useCallback(
    (p: SavedSessionProfile) => {
      applyProfileToForm(p)
      void openSession(
        {
          host: p.host,
          port: p.port,
          username: p.username,
          privateKeyPath: p.privateKeyPath,
          password: p.password?.trim() || undefined,
          passphrase: p.passphrase?.trim() || undefined,
          label: p.label,
          ...(p.jumpHost?.host?.trim() && p.jumpHost.username?.trim()
            ? { jumpHost: p.jumpHost }
            : {}),
          ...(p.forwards?.length ? { forwards: p.forwards } : {})
        },
        { profileId: p.id, hostInventoryId: p.hostInventoryId }
      )
    },
    [applyProfileToForm, openSession]
  )

  const renderProfileBranch = (p: SavedSessionProfile, inFolder?: boolean) => (
    <SessionDockerBranch
      key={p.id}
      profile={p}
      selected={highlightedProfileId === p.id}
      inFolder={inFolder}
      hostExpanded={Boolean(expandedHosts[p.id])}
      composeExpanded={expandedDockerGroups[`${p.id}:compose`] === true}
      containersExpanded={expandedDockerGroups[`${p.id}:containers`] === true}
      isComposeProjectExpanded={(projectName) =>
        expandedDockerGroups[`${p.id}:cp:${projectName}`] === true
      }
      tree={dockerTreeByProfileId[p.id]}
      onSelect={() => setSelectedProfileId(p.id)}
      onConnect={() => connectProfile(p)}
      onContextMenu={(e) => {
        e.preventDefault()
        setSelectedProfileId(p.id)
        setSessionMenu({ x: e.clientX, y: e.clientY, profile: p })
      }}
      onToggleHost={() => toggleHostExpanded(p)}
      onToggleCompose={() =>
        setExpandedDockerGroups((prev) => ({
          ...prev,
          [`${p.id}:compose`]: !prev[`${p.id}:compose`]
        }))
      }
      onToggleContainers={() =>
        setExpandedDockerGroups((prev) => ({
          ...prev,
          [`${p.id}:containers`]: !prev[`${p.id}:containers`]
        }))
      }
      onToggleComposeProject={(projectName) =>
        setExpandedDockerGroups((prev) => ({
          ...prev,
          [`${p.id}:cp:${projectName}`]: !prev[`${p.id}:cp:${projectName}`]
        }))
      }
      onRefresh={() => void loadDockerTreeForProfile(p, true)}
      onOpenContainer={(id, name) =>
        openDockerDetail({ profile: p, kind: 'container', resourceId: id, resourceName: name })
      }
      onOpenCompose={(name) =>
        openDockerDetail({ profile: p, kind: 'compose', resourceId: name, resourceName: name })
      }
    />
  )

  const openLocalShell = useCallback(async () => {
    setError(null)
    setConnecting(true)
    try {
      const { sessionId, meta } = await window.aiss.ssh.openLocalShell()
      const tabId = uuid()
      const title = meta.label ?? 'Local Shell'
      const connectOpts: SshConnectOptions = {
        host: 'localhost',
        port: 0,
        username: meta.username || 'local',
        label: title,
        termCols: meta.termCols,
        termRows: meta.termRows
      }
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId,
          title,
          connectOpts,
          status: 'connected',
          kind: 'local'
        }
      ])
      setActiveTabId(tabId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(false)
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (!activeSessionId) return
    setError(null)
    try {
      const path = await window.aiss.ssh.startRecording(activeSessionId)
      if (path) setRecordingSessionId(activeSessionId)
      else setError('无法开始录制')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [activeSessionId])

  const stopRecording = useCallback(async () => {
    if (!recordingSessionId) return
    try {
      await window.aiss.ssh.stopRecording(recordingSessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRecordingSessionId(null)
    }
  }, [recordingSessionId])

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

  const filteredRootProfiles = useMemo(
    () => filterProfiles(rootProfiles, sessionSearch),
    [rootProfiles, sessionSearch]
  )

  const toggleFolderExpanded = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const open = prev[id] === true
      return { ...prev, [id]: !open }
    })
  }, [])

  useEffect(() => {
    saveSidebarExpandPrefs({ folders: expandedFolders })
  }, [expandedFolders])

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
          passphrase: d.passphrase,
          ...(d.jumpHost ? { jumpHost: d.jumpHost } : {}),
          ...(d.forwards?.length ? { forwards: d.forwards } : {})
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
    return window.aiss.app.onOpenDialog((kind) => {
      if (kind === 'newFolder') {
        addFolder()
        return
      }
      if (kind === 'importSessions') {
        void importSessionsPick()
        return
      }
      if (kind === 'exportJson' || kind === 'exportOpenssh') {
        const format = kind === 'exportJson' ? 'json' : 'openssh'
        void (async () => {
          try {
            await exportSessionsAndCopy(format)
            setSideInfo(`已导出并复制到剪贴板（${format}）`)
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        })()
        return
      }
      if (kind === 'toggleSidebar') {
        toggleSidebar()
        return
      }
      if (kind === 'toggleMain') {
        toggleMain()
        return
      }
      if (kind === 'toggleAi') {
        toggleAi()
        return
      }
      if (kind === 'localShell') {
        void openLocalShell()
        return
      }
      if (kind === 'sftp') {
        openSftpTransfer()
        return
      }
      if (kind === 'refreshDocker') {
        refreshDockerForActiveHost()
        return
      }
      if (kind === 'toggleSplit') {
        setSplitEnabled((v) => {
          if (v) setBroadcastEnabled(false)
          return !v
        })
        return
      }
      if (kind === 'toggleBroadcast') {
        setBroadcastEnabled((v) => !v)
        return
      }
      if (kind === 'toggleRecording') {
        if (recordingSessionId) void stopRecording()
        else void startRecording()
        return
      }
      if (kind === 'connection') {
        openConnectionEditor()
        return
      }
      if (kind === 'debug') {
        void window.aiss.debug.openWindow()
        return
      }
      if (kind === 'inventory') {
        const t = tabs.find((x) => x.tabId === activeTabId) ?? null
        const sessionTab = t && (!t.view || t.view === 'session') ? t : null
        openInventoryEditor(
          sessionTab
            ? {
                profileId: sessionTab.profileId,
                host: sessionTab.connectOpts.host,
                port: sessionTab.connectOpts.port,
                username: sessionTab.connectOpts.username,
                label: sessionTab.connectOpts.label ?? sessionTab.title,
                hostInventoryId: sessionTab.hostInventoryId
              }
            : undefined
        )
        return
      }
      if (kind === 'ai' || kind === 'terminalPrefs' || kind === 'uiTheme' || kind === 'snippets') {
        openSettingsTab(kind)
        return
      }
    })
  }, [
    activeTabId,
    tabs,
    addFolder,
    importSessionsPick,
    toggleSidebar,
    toggleMain,
    toggleAi,
    openLocalShell,
    openConnectionEditor,
    openInventoryEditor,
    openSftpTransfer,
    openSettingsTab,
    refreshDockerForActiveHost,
    recordingSessionId,
    startRecording,
    stopRecording
  ])

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

  const handleTitlebarMenuAction = useCallback(
    (action: TitlebarMenuAction) => {
      if (action === 'quit') {
        window.close()
        return
      }
      if (action === 'undo' || action === 'redo' || action === 'cut' || action === 'copy' || action === 'paste' || action === 'selectAll') {
        try {
          document.execCommand(action === 'selectAll' ? 'selectAll' : action)
        } catch {
          /* ignore */
        }
        return
      }
      if (action === 'newFolder') {
        addFolder()
        return
      }
      if (action === 'importSessions') {
        void importSessionsPick()
        return
      }
      if (action === 'exportJson' || action === 'exportOpenssh') {
        const format = action === 'exportJson' ? 'json' : 'openssh'
        void (async () => {
          try {
            await exportSessionsAndCopy(format)
            setSideInfo(`已导出并复制到剪贴板（${format}）`)
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        })()
        return
      }
      if (action === 'toggleSidebar') {
        toggleSidebar()
        return
      }
      if (action === 'toggleMain') {
        toggleMain()
        return
      }
      if (action === 'toggleAi') {
        toggleAi()
        return
      }
      if (action === 'localShell') {
        void openLocalShell()
        return
      }
      if (action === 'sftp') {
        openSftpTransfer()
        return
      }
      if (action === 'refreshDocker') {
        refreshDockerForActiveHost()
        return
      }
      if (action === 'toggleSplit') {
        setSplitEnabled((v) => {
          if (v) setBroadcastEnabled(false)
          return !v
        })
        return
      }
      if (action === 'toggleBroadcast') {
        setBroadcastEnabled((v) => !v)
        return
      }
      if (action === 'toggleRecording') {
        if (recordingSessionId) void stopRecording()
        else void startRecording()
        return
      }
      if (action === 'connection') {
        openConnectionEditor()
        return
      }
      if (action === 'debug') {
        try {
          const d = window.aiss?.debug
          if (!d?.openWindow) {
            window.alert('调试接口未加载：请执行 npm run build 后重启应用。')
            return
          }
          void d.openWindow()
        } catch (e) {
          window.alert(e instanceof Error ? e.message : String(e))
        }
        return
      }
      if (action === 'inventory') {
        const t = tabs.find((x) => x.tabId === activeTabId) ?? null
        const sessionTab = t && (!t.view || t.view === 'session') ? t : null
        openInventoryEditor(
          sessionTab
            ? {
                profileId: sessionTab.profileId,
                host: sessionTab.connectOpts.host,
                port: sessionTab.connectOpts.port,
                username: sessionTab.connectOpts.username,
                label: sessionTab.connectOpts.label ?? sessionTab.title,
                hostInventoryId: sessionTab.hostInventoryId
              }
            : undefined
        )
        return
      }
      if (action === 'ai' || action === 'terminalPrefs' || action === 'uiTheme' || action === 'snippets') {
        openSettingsTab(action)
      }
    },
    [
      addFolder,
      importSessionsPick,
      toggleSidebar,
      toggleMain,
      toggleAi,
      openLocalShell,
      openConnectionEditor,
      openInventoryEditor,
      openSftpTransfer,
      openSettingsTab,
      refreshDockerForActiveHost,
      recordingSessionId,
      startRecording,
      stopRecording,
      tabs,
      activeTabId
    ]
  )

  return (
    <div className="app-root">
      <AppToolbar
        onMenuAction={handleTitlebarMenuAction}
        onToggleSidebar={toggleSidebar}
        onToggleMain={toggleMain}
        onToggleAi={toggleAi}
        showSidebar={layout.showSidebar}
        showMain={layout.showMain}
        showAi={layout.showAi}
      />

      <div className="app-shell">
        {layout.showSidebar ? (
          <>
            <aside className="sidebar" style={{ width: layout.sidebarWidth, minWidth: layout.sidebarWidth }}>
              <div className="sidebar-scroll">
            {error && activeTab?.view !== 'connection' && (
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
            <SessionSearchBar value={sessionSearch} onChange={setSessionSearch} />

            {folders.length === 0 && profiles.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>暂无</div>
            )}

            {folders.map((f) => {
              const expanded = expandedFolders[f.id] === true
              const inFolder = filterProfiles(profilesInFolder(f.id), sessionSearch)
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
                  {expanded && inFolder.map((p) => renderProfileBranch(p, true))}
                </div>
              )
            })}

            {filteredRootProfiles.map((p) => renderProfileBranch(p))}
          </div>
            </aside>
            {layout.showMain ? (
              <LayoutResizer
                title="拖动调整左侧宽度"
                onDrag={(dx) =>
                  updateLayout((p) => ({ ...p, sidebarWidth: clampSidebarWidth(p.sidebarWidth + dx) }))
                }
              />
            ) : layout.showAi ? (
              <LayoutResizer
                title="拖动调整左右宽度"
                onDrag={(dx) =>
                  updateLayout((p) => ({
                    ...p,
                    sidebarWidth: clampSidebarWidth(p.sidebarWidth + dx),
                    aiWidth: clampAiWidth(p.aiWidth - dx)
                  }))
                }
              />
            ) : null}
          </>
        ) : null}

        {layout.showMain ? (
          <section className="main">
          <div className="tab-bar">
            {tabs.length === 0 && <span style={{ padding: '8px 12px', color: 'var(--muted)' }}>未打开会话</span>}
            {tabs.map((t) => {
              const isSession = !t.view || t.view === 'session'
              return (
              <button
                key={t.tabId}
                type="button"
                className={`tab ${t.tabId === activeTabId ? 'active' : ''} ${isSession && t.status === 'disconnected' ? 'tab--disconnected' : ''} ${isSession && t.status === 'connecting' ? 'tab--connecting' : ''} ${t.view && WORKSPACE_TAB_VIEWS.has(t.view) ? 'tab--workspace' : ''}`}
                onClick={() => setActiveTabId(t.tabId)}
              >
                <span className="tab-title">
                  {isSession && t.status === 'connecting'
                    ? `${t.title} (连接中…)`
                    : isSession && t.status === 'disconnected'
                      ? `${t.title} (已断开)`
                      : t.title}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="tab-close"
                  title="关闭"
                  aria-label="关闭标签"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.tabId, t.sessionId, t.status, t.view)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      closeTab(t.tabId, t.sessionId, t.status, t.view)
                    }
                  }}
                >
                  ×
                </span>
              </button>
              )
            })}
          </div>

          {activeIsSession && activeTab?.status === 'connecting' && (
            <div className="session-disconnect-banner session-connecting-banner" role="status">
              <span>
                正在连接 {activeTab.connectOpts.username}@{activeTab.connectOpts.host}:
                {activeTab.connectOpts.port}…
              </span>
            </div>
          )}

          {activeIsSession && activeTab?.status === 'disconnected' && (
            <div className="session-disconnect-banner" role="status">
              <span>会话已断开（连接失败、keepalive 超时或对端关闭）。</span>
              <button
                type="button"
                className="primary"
                disabled={reconnectingTabId === activeTab.tabId}
                onClick={() => void reconnectTab(activeTab.tabId)}
              >
                {reconnectingTabId === activeTab.tabId ? '重连中…' : '重新连接'}
              </button>
            </div>
          )}

          <div className="terminal-stack">
            {tabs.map((t) => {
              return (
              <div key={t.tabId} className={`terminal-layer ${t.tabId === activeTabId ? 'active' : ''}`}>
                {t.view === 'connection' ? (
                  <ConnectionConfigModal
                    title={editingSavedId ? '编辑已保存会话' : '新建连接'}
                    saveProfileButtonLabel={editingSavedId ? '保存修改' : '保存到列表'}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
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
                    jumpHost={jumpHost}
                    setJumpHost={setJumpHost}
                    jumpPort={jumpPort}
                    setJumpPort={setJumpPort}
                    jumpUsername={jumpUsername}
                    setJumpUsername={setJumpUsername}
                    jumpPassword={jumpPassword}
                    setJumpPassword={setJumpPassword}
                    jumpPrivateKeyPath={jumpPrivateKeyPath}
                    setJumpPrivateKeyPath={setJumpPrivateKeyPath}
                    jumpPassphrase={jumpPassphrase}
                    setJumpPassphrase={setJumpPassphrase}
                    forwardLocalPort={forwardLocalPort}
                    setForwardLocalPort={setForwardLocalPort}
                    forwardRemoteHost={forwardRemoteHost}
                    setForwardRemoteHost={setForwardRemoteHost}
                    forwardRemotePort={forwardRemotePort}
                    setForwardRemotePort={setForwardRemotePort}
                  />
                ) : t.view === 'inventory' ? (
                  <HostInventoryModal
                    key={
                      inventoryLink
                        ? `${inventoryLink.hostInventoryId ?? ''}:${inventoryLink.profileId ?? ''}:${inventoryLink.host ?? ''}`
                        : 'inventory-blank'
                    }
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    link={inventoryLink}
                    onUpserted={(rec) => {
                      const pid = rec.meta.profileId
                      if (!pid) return
                      const next = profiles.map((p) =>
                        p.id === pid ? { ...p, hostInventoryId: rec.meta.id } : p
                      )
                      void persistSessionState({ folders, profiles: next })
                      setTabs((prev) =>
                        prev.map((x) => (x.profileId === pid ? { ...x, hostInventoryId: rec.meta.id } : x))
                      )
                    }}
                  />
                ) : t.view === 'sftp' ? (
                  <SftpPanel
                    key={t.boundSessionId || t.tabId}
                    sessionId={t.boundSessionId || null}
                    sessionTitle={t.title.replace(/^文件传输 · /, '')}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    onOpenRemoteFile={(info) => {
                      if (!t.boundSessionId) return
                      openRemoteFileEditor({
                        sessionId: t.boundSessionId,
                        remotePath: info.remotePath,
                        name: info.name,
                        connectOpts: t.connectOpts
                      })
                    }}
                  />
                ) : t.view === 'remote-file' && t.boundSessionId && t.remotePath ? (
                  <RemoteTextEditor
                    key={`${t.boundSessionId}:${t.remotePath}`}
                    tabId={t.tabId}
                    sessionId={t.boundSessionId}
                    remotePath={t.remotePath}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    onTitleChange={(title) => {
                      setTabs((prev) => prev.map((x) => (x.tabId === t.tabId ? { ...x, title } : x)))
                    }}
                  />
                ) : t.view === 'docker' && t.boundSessionId && t.dockerKind && t.dockerResourceId ? (
                  <DockerPanel
                    key={`${t.boundSessionId}:${t.dockerKind}:${t.dockerResourceId}`}
                    sessionId={t.boundSessionId}
                    kind={t.dockerKind}
                    resourceId={t.dockerResourceId}
                    resourceName={t.dockerResourceName || t.dockerResourceId}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    onTreeDirty={() => {
                      const pid = t.profileId
                      if (!pid) return
                      const profile = profiles.find((p) => p.id === pid)
                      if (profile) void loadDockerTreeForProfile(profile, true)
                    }}
                    onOpenShell={() => {
                      if (t.dockerKind !== 'container' || !t.boundSessionId || !t.dockerResourceId) return
                      void openDockerShell({
                        parentSessionId: t.boundSessionId,
                        containerId: t.dockerResourceId,
                        containerName: t.dockerResourceName || t.dockerResourceId,
                        connectOpts: t.connectOpts,
                        profileId: t.profileId
                      })
                    }}
                  />
                ) : t.view === 'ai' ? (
                  <AiConfigModal onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'terminalPrefs' ? (
                  <TerminalPrefsModal
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    onSaved={setTerminalPrefs}
                  />
                ) : t.view === 'uiTheme' ? (
                  <UiThemeModal onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'snippets' ? (
                  <SnippetsPanel
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    activeSessionId={activeSessionId}
                  />
                ) : t.status === 'connecting' ? (
                  <div className="terminal-disconnected-placeholder">正在建立 SSH 连接…</div>
                ) : t.status === 'connected' ? (
                  splitEnabled && t.tabId === activeTabId ? (
                    <SplitTerminalView
                      sessionId={t.sessionId}
                      active={t.tabId === activeTabId}
                      prefs={terminalPrefs}
                      broadcastEnabled={broadcastEnabled}
                    />
                  ) : (
                    <TerminalPane sessionId={t.sessionId} active={t.tabId === activeTabId} prefs={terminalPrefs} />
                  )
                ) : (
                  <div className="terminal-disconnected-placeholder">连接已断开，可点击上方「重新连接」。</div>
                )}
              </div>
              )
            })}
          </div>
        </section>
        ) : null}

        {layout.showMain && layout.showAi ? (
          <LayoutResizer
            title="拖动调整 AI 面板宽度"
            onDrag={(dx) => updateLayout((p) => ({ ...p, aiWidth: clampAiWidth(p.aiWidth - dx) }))}
          />
        ) : null}

        {layout.showAi ? (
          <div className="ai-panel-shell" style={{ width: layout.aiWidth, minWidth: layout.aiWidth }}>
            <AIPanel
              activeSessionId={activeSessionId}
              historyKey={activeTab?.profileId ?? activeSessionId}
              hostInventoryId={activeTab?.hostInventoryId}
              inventoryLookup={
                activeTab
                  ? {
                      host: activeTab.connectOpts.host,
                      port: activeTab.connectOpts.port,
                      profileId: activeTab.profileId
                    }
                  : undefined
              }
            />
          </div>
        ) : null}
      </div>

      <HostKeyConfirmModal prompt={hostKeyPrompt} onRespond={(accept, alwaysTrust) => void respondHostKey(accept, alwaysTrust)} />

      {sessionMenu && (
        <div
          ref={sessionMenuRef}
          className="session-context-menu"
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
            disabled={
              (dockerTreeByProfileId[sessionMenu.profile.id]?.status === 'connecting' ||
                dockerTreeByProfileId[sessionMenu.profile.id]?.status === 'loading') &&
              !expandedHosts[sessionMenu.profile.id]
            }
            onClick={() => {
              toggleHostExpanded(sessionMenu.profile)
              setSessionMenu(null)
            }}
          >
            {expandedHosts[sessionMenu.profile.id] ? '收起 Docker' : '展开 Docker'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item"
            onClick={() => {
              openConnectionEditor(sessionMenu.profile)
              setSessionMenu(null)
            }}
          >
            编辑
          </button>
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item"
            onClick={() => {
              const p = sessionMenu.profile
              openInventoryEditor({
                profileId: p.id,
                host: p.host,
                port: p.port,
                username: p.username,
                label: p.label,
                hostInventoryId: p.hostInventoryId
              })
              setSessionMenu(null)
            }}
          >
            主机档案
          </button>
          <div
            className={`session-context-submenu-wrap${sessionMenu.x > window.innerWidth - 320 ? ' open-left' : ''}`}
          >
            <button type="button" role="menuitem" className="session-context-menu-item session-context-menu-item--submenu">
              <span>移动到</span>
              <span className="session-context-menu-caret" aria-hidden>
                ›
              </span>
            </button>
            <div className="session-context-submenu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="session-context-menu-item"
                disabled={!sessionMenu.profile.folderId}
                onClick={() => moveProfileToFolder(sessionMenu.profile.id, undefined)}
              >
                未分组
              </button>
              {folders.length === 0 ? (
                <div className="session-context-submenu-empty">暂无文件夹</div>
              ) : (
                folders.map((f) => (
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
                ))
              )}
            </div>
          </div>
          <div className="session-context-menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item danger"
            onClick={() => {
              const p = sessionMenu.profile
              const name = p.label?.trim() || `${p.username}@${p.host}` || p.host || '该连接'
              if (!window.confirm(`确定删除连接「${name}」？\n删除后无法从列表恢复。`)) return
              removeProfile(p.id)
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
