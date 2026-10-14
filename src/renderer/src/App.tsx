import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AUTO_RECONNECT_DELAYS_MS,
  autoReconnectDelay,
  moveById,
  normalizeTabTitle
} from '@shared/workspace-features'
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
import AboutModal from './components/AboutModal'
import ShortcutsModal from './components/ShortcutsModal'
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
import McpGuidePanel from './components/McpGuidePanel'
import LayoutResizer from './components/LayoutResizer'
import BatchExecuteModal, { type BatchSessionOption } from './components/BatchExecuteModal'
import PortForwardModal from './components/PortForwardModal'
import ResourceMonitorModal from './components/ResourceMonitorModal'
import CommandPalette from './components/CommandPalette'
import WhatsNewModal from './components/WhatsNewModal'
import BackupModal from './components/BackupModal'
import ServerToolsModal from './components/ServerToolsModal'
import RecentConnections from './components/RecentConnections'
import SessionCommandBar from './components/SessionCommandBar'
import { useI18n, tg, type MessageKey } from './lib/i18n'
import { askText, DialogHost } from './lib/dialogs'
import { notifyRecentChanged } from './lib/workspace-events'
import type { RecentConnection } from '@shared/workspace-features'
import { normalizeTags } from '@shared/workspace-features'
import { filterProfiles, folderMatches } from './lib/session-filter'
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
    p.privateKeyPath ? tg('app.keyPath', { path: p.privateKeyPath }) : null,
    tg('app.profileTip')
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
  | 'mcpGuide'

type SettingsTabView = 'ai' | 'terminalPrefs' | 'uiTheme' | 'snippets' | 'mcpGuide'

const SETTINGS_TAB_TITLES: Record<SettingsTabView, MessageKey> = {
  ai: 'app.tab.ai',
  terminalPrefs: 'app.tab.terminalPrefs',
  uiTheme: 'app.tab.uiTheme',
  snippets: 'app.tab.snippets',
  mcpGuide: 'app.tab.mcpGuide'
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
  'docker',
  'mcpGuide'
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
  /** user-chosen name (rename); kept across reconnect */
  customTitle?: string
  /** 文件传输 / 远端编辑 / Docker 绑定的 SSH sessionId */
  boundSessionId?: string
  /** 远端文件路径（remote-file） */
  remotePath?: string
  /** Docker 详情 */
  dockerKind?: 'container' | 'compose' | 'swarm'
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
  const { t: tr } = useI18n()
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
  /** 静默刷新进行中的 profile，避免轮询叠请求 */
  const dockerPollInFlightRef = useRef(new Set<string>())
  /** 刷新进行中时又来了请求：结束后补刷一次，避免漏掉启停 */
  const dockerPollPendingRef = useRef(new Set<string>())
  /** 已对 session 订阅 docker events 的 profile → sessionId */
  const dockerEventsWatchingRef = useRef(new Map<string, string>())
  const expandedHostsRef = useRef(expandedHosts)
  expandedHostsRef.current = expandedHosts
  const profilesRef = useRef(profiles)
  profilesRef.current = profiles
  const silentRefreshDockerTreeRef = useRef<(profile: SavedSessionProfile) => Promise<void>>(
    async () => undefined
  )
  const [sideInfo, setSideInfo] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [hostKeyPrompt, setHostKeyPrompt] = useState<SshHostKeyPromptEvent | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const dragTabIdRef = useRef<string | null>(null)
  // Ctrl+1..9 jump to tab, Ctrl+Tab / Ctrl+Shift+Tab cycle (capture phase so the terminal does not swallow it)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      if (e.shiftKey && (e.key === 'T' || e.key === 't')) {
        setServerToolsSession(null)
        setServerToolsOpen(true)
        e.preventDefault()
        e.stopPropagation()
        return
      }
      const list = tabsRef.current
      if (!list.length) return
      let target: string | undefined
      if (e.key === 'Tab') {
        setActiveTabId((cur) => {
          const i = Math.max(0, list.findIndex((t) => t.tabId === cur))
          const n = (i + (e.shiftKey ? -1 : 1) + list.length) % list.length
          return list[n]!.tabId
        })
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
        const idx = e.key === '9' ? list.length - 1 : Number(e.key) - 1
        target = list[idx]?.tabId
      }
      if (target) {
        setActiveTabId(target)
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  useEffect(() => {
    if (!tabMenu) return
    const close = () => setTabMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTabMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [tabMenu])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [batchOpen, setBatchOpen] = useState(false)
  const [portForwardOpen, setPortForwardOpen] = useState(false)
  const [resourceOpen, setResourceOpen] = useState(false)
  const [resourceTarget, setResourceTarget] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  useEffect(() => {
    // "What's new" once after an upgrade (not on a fresh install)
    void window.aiss.app
      .getVersion()
      .then((v) => {
        setAppVersion(v)
        const last = localStorage.getItem('aiss.lastSeenVersion')
        if (last && last !== v) setWhatsNewOpen(true)
        localStorage.setItem('aiss.lastSeenVersion', v)
      })
      .catch(() => {})
  }, [])
  const [backupOpen, setBackupOpen] = useState(false)
  const [serverToolsOpen, setServerToolsOpen] = useState(false)
  const [serverToolsSession, setServerToolsSession] = useState<string | null>(null)
  const [reconnectingTabId, setReconnectingTabId] = useState<string | null>(null)
  /** 连接中关闭的 tab，避免连上后仍挂会话 */
  const cancelledConnectingTabsRef = useRef(new Set<string>())

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? null
  const activeIsSession = !activeTab?.view || activeTab.view === 'session'
  const activeSessionId =
    activeIsSession && activeTab?.status === 'connected' ? activeTab.sessionId : null
  const connectedSshSessions = useMemo<BatchSessionOption[]>(
    () =>
      tabs
        .filter(
          (tab) =>
            (!tab.view || tab.view === 'session') &&
            tab.kind !== 'local' &&
            tab.status === 'connected' &&
            Boolean(tab.sessionId)
        )
        .map((tab) => ({
          sessionId: tab.sessionId,
          title: tab.title,
          host: tab.connectOpts.host,
          port: tab.connectOpts.port || 22,
          username: tab.connectOpts.username
        })),
    [tabs]
  )
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
        if (st.unexpected) {
          const tab = tabsRef.current.find((t) => t.sessionId === st.sessionId)
          if (tab && tab.kind !== 'local') scheduleAutoReconnectRef.current(tab.tabId)
        }
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
        notifyRecentChanged()
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

  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const autoRetryRef = useRef(new Map<string, { attempt: number; timer: ReturnType<typeof setTimeout> }>())
  const [autoRetry, setAutoRetry] = useState<{ tabId: string; attempt: number; delayMs: number } | null>(null)
  const reconnectTabRef = useRef<(tabId: string) => Promise<boolean>>(async () => false)
  const scheduleAutoReconnectRef = useRef<(tabId: string) => void>(() => {})

  const cancelAutoReconnect = useCallback((tabId: string) => {
    const cur = autoRetryRef.current.get(tabId)
    if (cur) clearTimeout(cur.timer)
    autoRetryRef.current.delete(tabId)
    setAutoRetry((s) => (s?.tabId === tabId ? null : s))
  }, [])

  scheduleAutoReconnectRef.current = (tabId: string) => {
    const prev = autoRetryRef.current.get(tabId)
    if (prev) clearTimeout(prev.timer)
    const attempt = (prev?.attempt ?? 0) + 1
    const delayMs = autoReconnectDelay(attempt)
    if (delayMs === null) {
      autoRetryRef.current.delete(tabId)
      setAutoRetry((s) => (s?.tabId === tabId ? null : s))
      return
    }
    const timer = setTimeout(() => {
      void (async () => {
        if (!tabsRef.current.some((t) => t.tabId === tabId && t.status === 'disconnected')) {
          cancelAutoReconnect(tabId)
          return
        }
        const ok = await reconnectTabRef.current(tabId)
        if (ok) cancelAutoReconnect(tabId)
        else if (autoRetryRef.current.has(tabId)) scheduleAutoReconnectRef.current(tabId)
      })()
    }, delayMs)
    autoRetryRef.current.set(tabId, { attempt, timer })
    setAutoRetry({ tabId, attempt, delayMs })
  }

  useEffect(() => {
    const map = autoRetryRef.current
    return () => {
      for (const v of map.values()) clearTimeout(v.timer)
      map.clear()
    }
  }, [])

  const reconnectTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      const tab = tabsRef.current.find((t) => t.tabId === tabId)
      if (!tab || tab.status !== 'disconnected') return false
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
                    title: t.customTitle ?? meta.label ?? t.title,
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
          return true
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
                  title: t.customTitle ?? meta.label ?? t.title,
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
        notifyRecentChanged()
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return false
      } finally {
        setReconnectingTabId(null)
      }
    },
    []
  )
  reconnectTabRef.current = reconnectTab

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
      view === 'docker' ||
      view === 'mcpGuide'
    ) {
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      setActiveTabId((cur) => (cur === tabId ? null : cur))
      return
    }
    if (view === 'remote-file') {
      if (isRemoteFileDirty(tabId)) {
        if (!window.confirm(tg('app.unsavedClose'))) return
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

  const commitRename = useCallback(() => {
    const id = renamingTabId
    if (!id) return
    const title = normalizeTabTitle(renameDraft)
    if (title) setTabs((prev) => prev.map((t) => (t.tabId === id ? { ...t, title, customTitle: title } : t)))
    setRenamingTabId(null)
  }, [renamingTabId, renameDraft])

  const startRename = useCallback((tabId: string) => {
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    if (!tab) return
    setRenameDraft(tab.title)
    setRenamingTabId(tabId)
  }, [])

  const closeTabsWhere = useCallback(
    (keep: (t: Tab, index: number) => boolean) => {
      tabsRef.current.forEach((t, idx) => {
        if (!keep(t, idx)) closeTab(t.tabId, t.sessionId, t.status, t.view)
      })
    },
    [closeTab]
  )


  const ensureMainVisible = useCallback(() => {
    updateLayout((p) => (p.showMain ? p : withPaneToggle(p, 'main', true)))
  }, [updateLayout])

  const saveProfile = useCallback(() => {
    if (!host.trim() || !username.trim()) {
      setError(tg('app.needHostUser'))
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
      const title = profile ? tg('app.editProfile', { name: profileSidebarLabel(profile) }) : tg('app.newConnection')
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
        ? `${tg('app.inventory')} · ${link.host.trim()}`
        : link?.label?.trim()
          ? `${tg('app.inventory')} · ${link.label.trim()}`
          : tg('app.inventory')
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
      setError(tg('app.needSshSftp'))
      return
    }
    setError(null)
    const title = `${tg('sftp.title')} · ${bound.title}`
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
      const title = tg(SETTINGS_TAB_TITLES[view])
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

  /**
   * 静默刷新 Docker 树：不改 connecting/loading，避免侧栏闪烁。
   * 用于轮询、docker events 与操作后刷新。
   */
  const silentRefreshDockerTree = useCallback(
    async (profile: SavedSessionProfile) => {
      const cached = dockerTreeByProfileIdRef.current[profile.id]
      if (cached?.status === 'connecting') return
      const sessionId =
        cached?.sessionId || findConnectedSessionForProfile(profile)?.sessionId
      if (!sessionId) return
      if (dockerPollInFlightRef.current.has(profile.id)) {
        dockerPollPendingRef.current.add(profile.id)
        return
      }

      dockerPollInFlightRef.current.add(profile.id)
      try {
        const data = await window.aiss.docker.listTree(sessionId)
        setDockerTreeByProfileId((prev) => {
          const cur = prev[profile.id]
          if (cur?.sessionId && cur.sessionId !== sessionId) return prev
          return {
            ...prev,
            [profile.id]: { status: 'ready', data, sessionId }
          }
        })
      } catch {
        /* 轮询失败保留旧数据 */
      } finally {
        dockerPollInFlightRef.current.delete(profile.id)
        if (dockerPollPendingRef.current.has(profile.id)) {
          dockerPollPendingRef.current.delete(profile.id)
          // 用最新函数再刷，避免闭包过期
          void silentRefreshDockerTreeRef.current(profile)
        }
      }
    },
    [findConnectedSessionForProfile]
  )
  silentRefreshDockerTreeRef.current = silentRefreshDockerTree

  const loadDockerTreeForProfile = useCallback(
    async (profile: SavedSessionProfile, force = false, opts?: { expandWhenReady?: boolean }) => {
      const expandWhenReady = Boolean(opts?.expandWhenReady)
      const cached = dockerTreeByProfileIdRef.current[profile.id]

      // 已有树且强制刷新：静默拉取，不闪 loading（用于操作后 / 手动刷新）
      if (force && cached?.sessionId && (cached.status === 'ready' || cached.data)) {
        if (expandWhenReady) {
          setExpandedHosts((prev) => ({ ...prev, [profile.id]: true }))
        }
        await silentRefreshDockerTree(profile)
        return
      }

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
              error: tg('app.dockerConnFail'),
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
    [applyProfileToForm, findConnectedSessionForProfile, openSession, silentRefreshDockerTree]
  )

  /**
   * 已展开主机：稳定 2s 轮询（用 ref，不因 tabs/回调重建而重置定时器）。
   * 另用 docker events 近实时推送。
   */
  useEffect(() => {
    const tick = () => {
      const expanded = expandedHostsRef.current
      for (const id of Object.keys(expanded)) {
        if (!expanded[id]) continue
        const profile = profilesRef.current.find((p) => p.id === id)
        if (!profile) continue
        const cached = dockerTreeByProfileIdRef.current[id]
        if (cached?.status === 'connecting' || cached?.status === 'loading') continue
        if (!cached?.sessionId) continue
        void silentRefreshDockerTreeRef.current(profile)
      }
    }
    const timer = window.setInterval(tick, 2000)
    // 展开后尽快刷一次
    const first = window.setTimeout(tick, 800)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(first)
    }
  }, [])

  /** session 就绪且主机展开时订阅 docker events；data 刷新不重订阅 */
  const dockerEventsWatchKey = useMemo(() => {
    return Object.keys(expandedHosts)
      .filter((id) => expandedHosts[id])
      .map((id) => {
        const t = dockerTreeByProfileId[id]
        return `${id}:${t?.sessionId ?? ''}:${t?.status ?? ''}`
      })
      .sort()
      .join('|')
  }, [dockerTreeByProfileId, expandedHosts])

  useEffect(() => {
    const wanted = new Map<string, string>()
    for (const id of Object.keys(expandedHostsRef.current)) {
      if (!expandedHostsRef.current[id]) continue
      const cached = dockerTreeByProfileIdRef.current[id]
      if (!cached?.sessionId) continue
      if (cached.status !== 'ready' && cached.status !== 'error') continue
      wanted.set(id, cached.sessionId)
    }

    for (const [pid, sid] of [...dockerEventsWatchingRef.current]) {
      if (wanted.get(pid) === sid) continue
      void window.aiss.docker.unwatchEvents(sid)
      dockerEventsWatchingRef.current.delete(pid)
    }
    for (const [pid, sid] of wanted) {
      if (dockerEventsWatchingRef.current.get(pid) === sid) continue
      dockerEventsWatchingRef.current.set(pid, sid)
      void window.aiss.docker.watchEvents(sid).catch(() => {
        dockerEventsWatchingRef.current.delete(pid)
      })
    }
  }, [dockerEventsWatchKey])

  useEffect(() => {
    return () => {
      for (const [, sid] of dockerEventsWatchingRef.current) {
        void window.aiss.docker.unwatchEvents(sid)
      }
      dockerEventsWatchingRef.current.clear()
    }
  }, [])

  /** docker events → 静默刷新（稳定订阅，读 ref） */
  useEffect(() => {
    return window.aiss.docker.onChanged((ev) => {
      const sessionId = ev.sessionId
      if (!sessionId) return
      for (const [profileId, cache] of Object.entries(dockerTreeByProfileIdRef.current)) {
        if (cache.sessionId !== sessionId) continue
        if (!expandedHostsRef.current[profileId]) continue
        const profile = profilesRef.current.find((p) => p.id === profileId)
        if (profile) void silentRefreshDockerTreeRef.current(profile)
      }
    })
  }, [])

  const toggleHostExpanded = useCallback(
    (profile: SavedSessionProfile) => {
      const tree = dockerTreeByProfileId[profile.id]
      const busy = tree?.status === 'connecting' || tree?.status === 'loading'
      if (busy) return

      if (expandedHosts[profile.id]) {
        setExpandedHosts((prev) => ({ ...prev, [profile.id]: false }))
        return
      }

      // 有缓存：直接展开，并立刻静默刷新一次拿到最新状态
      if (tree?.status === 'ready' && tree.data) {
        setExpandedHosts((prev) => ({ ...prev, [profile.id]: true }))
        void silentRefreshDockerTree(profile)
        return
      }

      void loadDockerTreeForProfile(profile, false, { expandWhenReady: true })
    },
    [
      dockerTreeByProfileId,
      expandedHosts,
      loadDockerTreeForProfile,
      silentRefreshDockerTree
    ]
  )

  const openDockerDetail = useCallback(
    (info: {
      profile: SavedSessionProfile
      kind: 'container' | 'compose' | 'swarm'
      resourceId: string
      resourceName: string
    }) => {
      const bound = findConnectedSessionForProfile(info.profile)
      if (!bound?.sessionId) {
        setError(tg('app.needSshDocker'))
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
          ? `${tg('app.container')} · ${info.resourceName}`
          : info.kind === 'swarm'
            ? `Swarm · ${info.resourceName}`
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
      const title = `${tg('app.containerShell')} · ${info.containerName}`
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
      setError(tg('app.needSshRefreshDocker'))
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
      return openSession(
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

  const quickConnectRecent = useCallback(
    (row: RecentConnection) => {
      const match = profiles.find(
        (p) =>
          p.host === row.host &&
          p.username === row.username &&
          (p.port || 22) === (row.port || 22)
      )
      if (match) {
        connectProfile(match)
        return
      }
      setEditingSavedId(null)
      setError(null)
      setHost(row.host)
      setPort(String(row.port || 22))
      setUsername(row.username)
      setLabel(row.label ?? '')
      setPassword('')
      setPrivateKeyPath('')
      setPassphrase('')
      setJumpHost('')
      setJumpPort('22')
      setJumpUsername('')
      setJumpPassword('')
      setJumpPrivateKeyPath('')
      setJumpPassphrase('')
      setForwardLocalPort('')
      setForwardRemoteHost('')
      setForwardRemotePort('')
      openConnectionEditor()
    },
    [connectProfile, openConnectionEditor, profiles]
  )

  const renderProfileBranch = (p: SavedSessionProfile, inFolder?: boolean) => (
    <SessionDockerBranch
      key={p.id}
      profile={p}
      selected={highlightedProfileId === p.id}
      inFolder={inFolder}
      searchQuery={sessionSearch}
      hostExpanded={Boolean(expandedHosts[p.id])}
      composeExpanded={expandedDockerGroups[`${p.id}:compose`] === true}
      swarmExpanded={expandedDockerGroups[`${p.id}:swarm`] === true}
      containersExpanded={expandedDockerGroups[`${p.id}:containers`] === true}
      isComposeProjectExpanded={(projectName) =>
        expandedDockerGroups[`${p.id}:cp:${projectName}`] === true
      }
      isSwarmNodeExpanded={(key) => expandedDockerGroups[`${p.id}:sw:${key}`] === true}
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
      onToggleSwarm={() =>
        setExpandedDockerGroups((prev) => ({
          ...prev,
          [`${p.id}:swarm`]: !prev[`${p.id}:swarm`]
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
      onToggleSwarmNode={(key) =>
        setExpandedDockerGroups((prev) => ({
          ...prev,
          [`${p.id}:sw:${key}`]: !prev[`${p.id}:sw:${key}`]
        }))
      }
      onRefresh={() => void loadDockerTreeForProfile(p, true)}
      onOpenContainer={(id, name) =>
        openDockerDetail({ profile: p, kind: 'container', resourceId: id, resourceName: name })
      }
      onOpenCompose={(name) =>
        openDockerDetail({ profile: p, kind: 'compose', resourceId: name, resourceName: name })
      }
      onOpenSwarmService={(name) =>
        openDockerDetail({ profile: p, kind: 'swarm', resourceId: name, resourceName: name })
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
      else setError(tg('app.recordFail'))
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

  const treeDataForProfile = useCallback(
    (p: SavedSessionProfile) => dockerTreeByProfileId[p.id]?.data,
    [dockerTreeByProfileId]
  )

  const filteredRootProfiles = useMemo(
    () => filterProfiles(rootProfiles, sessionSearch, treeDataForProfile),
    [rootProfiles, sessionSearch, treeDataForProfile]
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

  const addFolder = useCallback(async () => {
    const name = (await askText(tg('app.newFolderName'), tg('app.newFolderDefault')))?.trim()
    if (!name) return
    const id = uuid()
    void persistSessionState({ folders: [...folders, { id, name }], profiles })
    setExpandedFolders((e) => ({ ...e, [id]: true }))
  }, [folders, persistSessionState, profiles])

  const renameFolder = useCallback(
    async (folderId: string, currentName: string) => {
      const name = (await askText(tg('app.renameFolder'), currentName))?.trim()
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

  const editProfileTags = useCallback(
    async (profileId: string) => {
      setSessionMenu(null)
      const cur = profiles.find((p) => p.id === profileId)
      if (!cur) return
      const input = await askText(tg('tags.prompt'), (cur.tags ?? []).join(', '))
      if (input == null) return
      const tags = normalizeTags(input)
      const next = profiles.map((p) => {
        if (p.id !== profileId) return p
        const { tags: _old, ...rest } = p
        return tags.length ? { ...rest, tags } : (rest as SavedSessionProfile)
      })
      void persistSessionState({ folders, profiles: next })
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
      const tail = additions.length ? tg('app.importAdded', { n: additions.length }) : tg('app.importNone')
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
            setSideInfo(tg('exp.copied', { format }))
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
      if (kind === 'about') {
        setAboutOpen(true)
        return
      }
      if (kind === 'ai' || kind === 'terminalPrefs' || kind === 'uiTheme' || kind === 'snippets' || kind === 'mcpGuide') {
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
            setSideInfo(tg('exp.copied', { format }))
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
            window.alert(tg('app.debugMissing'))
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
      if (action === 'about') {
        setAboutOpen(true)
        return
      }
      if (action === 'shortcuts') {
        setShortcutsOpen(true)
        return
      }
      if (action === 'batchExec') {
        setBatchOpen(true)
        return
      }
      if (action === 'portForward') {
        setPortForwardOpen(true)
        return
      }
      if (action === 'resourceMonitor') {
        setResourceTarget(null)
        setResourceOpen(true)
        return
      }
      if (action === 'commandPalette') {
        setPaletteOpen(true)
        return
      }
      if (action === 'whatsNew') {
        setWhatsNewOpen(true)
        return
      }
      if (action === 'backup') {
        setBackupOpen(true)
        return
      }
      if (action === 'serverTools') {
        setServerToolsSession(null)
        setServerToolsOpen(true)
        return
      }
      if (action === 'ai' || action === 'terminalPrefs' || action === 'uiTheme' || action === 'snippets' || action === 'mcpGuide') {
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

  const openMonitorForSession = useCallback((sid: string | null) => {
    setResourceTarget(sid)
    setResourceOpen(true)
  }, [])
  const monitorProfile = useCallback(
    async (p: SavedSessionProfile) => {
      setSessionMenu(null)
      const live = tabs.find(
        (x) => x.profileId === p.id && x.status === 'connected' && x.sessionId && (!x.view || x.view === 'session')
      )
      if (live) return openMonitorForSession(live.sessionId)
      const sid = await connectProfile(p)
      if (sid) openMonitorForSession(sid)
    },
    [tabs, connectProfile, openMonitorForSession]
  )
  useEffect(() => {
    const map: Record<string, TitlebarMenuAction> = {
      KeyP: 'commandPalette',
      KeyM: 'resourceMonitor',
      KeyO: 'portForward',
      KeyB: 'batchExec',
      KeyS: 'snippets'
    }
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      let action: TitlebarMenuAction | undefined
      if (e.shiftKey) action = map[e.code]
      else if (e.code === 'KeyK') {
        // plain Ctrl+K stays with the shell (kill-line) while a terminal has focus
        const el = document.activeElement as HTMLElement | null
        if (el?.closest('.xterm')) return
        action = 'commandPalette'
      }
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      if (action === 'batchExec') setBatchOpen(true)
      else handleTitlebarMenuAction(action)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [handleTitlebarMenuAction])

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
        onOpenBatch={() => setBatchOpen(true)}
        onQuickConnect={quickConnectRecent}
      />

      <div className="app-shell">
        {layout.showSidebar ? (
          <>
            <aside className="sidebar" style={{ width: layout.sidebarWidth, minWidth: layout.sidebarWidth }}>
              <div className="sidebar-header">
                <h3>{tr('sidebar.saved')}</h3>
                <SessionSearchBar value={sessionSearch} onChange={setSessionSearch} />
              </div>
              <div className="sidebar-scroll">
                <RecentConnections onQuickConnect={quickConnectRecent} />
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

                {folders.length === 0 && profiles.length === 0 && (
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{tr('sidebar.empty')}</div>
                )}

                {folders.map((f) => {
                  const inFolder = folderMatches(f.name, sessionSearch)
                    ? profilesInFolder(f.id)
                    : filterProfiles(profilesInFolder(f.id), sessionSearch, treeDataForProfile)
                  const expanded = sessionSearch.trim()
                    ? inFolder.length > 0
                    : expandedFolders[f.id] === true
                  return (
                    <div key={f.id} className="session-folder-block">
                      <div
                        className="session-folder-row"
                        role="button"
                        tabIndex={0}
                        title={tg('app.folderTip')}
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
                title={tg('app.dragLeft')}
                onDrag={(dx) =>
                  updateLayout((p) => ({ ...p, sidebarWidth: clampSidebarWidth(p.sidebarWidth + dx) }))
                }
              />
            ) : layout.showAi ? (
              <LayoutResizer
                title={tg('app.dragResize')}
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
            {tabs.length === 0 && <span style={{ padding: '8px 12px', color: 'var(--muted)' }}>{tr('tab.none')}</span>}
            {tabs.map((t) => {
              const isSession = !t.view || t.view === 'session'
              return (
              <button
                key={t.tabId}
                type="button"
                className={`tab ${t.tabId === activeTabId ? 'active' : ''} ${isSession && t.status === 'disconnected' ? 'tab--disconnected' : ''} ${isSession && t.status === 'connecting' ? 'tab--connecting' : ''} ${t.view && WORKSPACE_TAB_VIEWS.has(t.view) ? 'tab--workspace' : ''}`}
                onClick={() => setActiveTabId(t.tabId)}
                onDoubleClick={() => startRename(t.tabId)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setActiveTabId(t.tabId)
                  setTabMenu({ tabId: t.tabId, x: e.clientX, y: e.clientY })
                }}
                draggable={renamingTabId !== t.tabId}
                onDragStart={(e) => {
                  dragTabIdRef.current = t.tabId
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  if (dragTabIdRef.current) e.preventDefault()
                }}
                onDrop={(e) => {
                  const from = dragTabIdRef.current
                  dragTabIdRef.current = null
                  if (!from) return
                  e.preventDefault()
                  setTabs((prev) => moveById(prev, (x) => x.tabId, from, t.tabId))
                }}
                onDragEnd={() => {
                  dragTabIdRef.current = null
                }}
              >
                {renamingTabId === t.tabId ? (
                  <input
                    className="tab-rename-input"
                    autoFocus
                    value={renameDraft}
                    maxLength={60}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenamingTabId(null)
                    }}
                  />
                ) : (
                <span className="tab-title">
                  {isSession && t.status === 'connecting'
                    ? tr('tab.connecting', { title: t.title })
                    : isSession && t.status === 'disconnected'
                      ? tr('tab.disconnected', { title: t.title })
                      : t.title}
                </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  className="tab-close"
                  title={tr('tab.close')}
                  aria-label={tr('tab.closeLabel')}
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
          {tabMenu
            ? (() => {
                const idx = tabs.findIndex((x) => x.tabId === tabMenu.tabId)
                const tab = tabs[idx]
                if (!tab) return null
                const canDuplicate = (!tab.view || tab.view === 'session') && tab.kind !== 'local' && Boolean(tab.connectOpts?.host)
                return (
                  <div
                    className="tab-context-menu"
                    role="menu"
                    style={{ left: tabMenu.x, top: tabMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button type="button" role="menuitem" onClick={() => { setTabMenu(null); startRename(tab.tabId) }}>
                      {tr('tab.rename')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!canDuplicate}
                      onClick={() => {
                        setTabMenu(null)
                        void openSession(tab.connectOpts, { profileId: tab.profileId, hostInventoryId: tab.hostInventoryId, kind: 'ssh' })
                      }}
                    >
                      {tr('tab.duplicate')}
                    </button>
                    <hr />
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!(tab.status === 'connected' && tab.sessionId && tab.kind !== 'local' && (!tab.view || tab.view === 'session'))}
                      onClick={() => {
                        setTabMenu(null)
                        openMonitorForSession(tab.sessionId)
                      }}
                    >
                      {tr('menu.resourceMonitor')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!(tab.status === 'connected' && tab.sessionId && tab.kind !== 'local')}
                      onClick={() => {
                        setTabMenu(null)
                        setActiveTabId(tab.tabId)
                        setPortForwardOpen(true)
                      }}
                    >
                      {tr('menu.portForward')}
                    </button>
                    <hr />
                    <button type="button" role="menuitem" disabled={tabs.length < 2} onClick={() => { setTabMenu(null); closeTabsWhere((x) => x.tabId === tab.tabId) }}>
                      {tr('tab.closeOthers')}
                    </button>
                    <button type="button" role="menuitem" disabled={idx >= tabs.length - 1} onClick={() => { setTabMenu(null); closeTabsWhere((_x, i) => i <= idx) }}>
                      {tr('tab.closeRight')}
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setTabMenu(null); closeTab(tab.tabId, tab.sessionId, tab.status, tab.view) }}>
                      {tr('tab.close')}
                    </button>
                  </div>
                )
              })()
            : null}

          {activeIsSession && activeTab?.status === 'connecting' && (
            <div className="session-disconnect-banner session-connecting-banner" role="status">
              <span>
                {tr('banner.connecting', {
                  target: `${activeTab.connectOpts.username}@${activeTab.connectOpts.host}:${activeTab.connectOpts.port}`
                })}
              </span>
            </div>
          )}

          {activeIsSession && activeTab?.status === 'disconnected' && (
            <div className="session-disconnect-banner" role="status">
              <span>{tr('banner.disconnected')}</span>
              {autoRetry?.tabId === activeTab.tabId ? (
                <>
                  <span className="session-autoretry">
                    {tr('banner.autoReconnect', {
                      sec: String(Math.round(autoRetry.delayMs / 1000)),
                      n: String(autoRetry.attempt),
                      max: String(AUTO_RECONNECT_DELAYS_MS.length)
                    })}
                  </span>
                  <button type="button" onClick={() => cancelAutoReconnect(activeTab.tabId)}>
                    {tr('banner.autoReconnectCancel')}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="primary"
                disabled={reconnectingTabId === activeTab.tabId}
                onClick={() => {
                  cancelAutoReconnect(activeTab.tabId)
                  void reconnectTab(activeTab.tabId)
                }}
              >
                {reconnectingTabId === activeTab.tabId ? tr('banner.reconnecting') : tr('banner.reconnect')}
              </button>
            </div>
          )}

          {activeIsSession && activeTab?.status === 'connected' && activeTab.sessionId ? (
            <SessionCommandBar sessionId={activeTab.sessionId} />
          ) : null}

          <div className="terminal-stack">
            {tabs.map((t) => {
              return (
              <div key={t.tabId} className={`terminal-layer ${t.tabId === activeTabId ? 'active' : ''}`}>
                {t.view === 'connection' ? (
                  <ConnectionConfigModal
                    title={editingSavedId ? tg('app.editSaved') : tg('app.newConnection')}
                    saveProfileButtonLabel={editingSavedId ? tg('app.saveChanges') : tg('app.saveToList')}
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
                    sessionTitle={t.title.replace(/^[^·]+ · /, '')}
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
                      if (!profile) return
                      void loadDockerTreeForProfile(profile, true)
                      // Swarm / compose 启停后任务可能稍晚才落盘，补刷两次
                      window.setTimeout(() => void silentRefreshDockerTree(profile), 1200)
                      window.setTimeout(() => void silentRefreshDockerTree(profile), 3200)
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
                ) : t.view === 'mcpGuide' ? (
                  <McpGuidePanel onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.status === 'connecting' ? (
                  <div className="terminal-disconnected-placeholder">{tr('term.connecting')}</div>
                ) : t.status === 'connected' ? (
                  splitEnabled && t.tabId === activeTabId ? (
                    <SplitTerminalView
                      sessionId={t.sessionId}
                      active={t.tabId === activeTabId}
                      prefs={terminalPrefs}
                      broadcastEnabled={broadcastEnabled}
                      peers={connectedSshSessions
                        .filter((x) => x.sessionId !== t.sessionId)
                        .map((x) => ({ sessionId: x.sessionId, title: x.title }))}
                    />
                  ) : (
                    <TerminalPane sessionId={t.sessionId} active={t.tabId === activeTabId} prefs={terminalPrefs} />
                  )
                ) : (
                  <div className="terminal-disconnected-placeholder">{tr('term.disconnected')}</div>
                )}
              </div>
              )
            })}
          </div>
        </section>
        ) : null}

        {layout.showMain && layout.showAi ? (
          <LayoutResizer
            title={tg('app.dragAi')}
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
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <BatchExecuteModal open={batchOpen} sessions={connectedSshSessions} onClose={() => setBatchOpen(false)} />
      <PortForwardModal
        open={portForwardOpen}
        sessions={connectedSshSessions}
        activeSessionId={activeSessionId ?? null}
        onClose={() => setPortForwardOpen(false)}
      />
      <ResourceMonitorModal
        open={resourceOpen}
        sessions={connectedSshSessions}
        activeSessionId={resourceTarget ?? activeSessionId ?? null}
        onClose={() => {
          setResourceOpen(false)
          setResourceTarget(null)
        }}
        onOpenTools={(sid) => {
          setResourceOpen(false)
          setServerToolsSession(sid)
          setServerToolsOpen(true)
        }}
      />
      <ServerToolsModal
        open={serverToolsOpen}
        sessions={connectedSshSessions}
        activeSessionId={serverToolsSession ?? activeSessionId ?? null}
        onClose={() => setServerToolsOpen(false)}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={handleTitlebarMenuAction} />
      <WhatsNewModal
        open={whatsNewOpen}
        version={appVersion}
        onClose={() => setWhatsNewOpen(false)}
        onAction={handleTitlebarMenuAction}
      />
      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
      {/* last so confirm/prompt dialogs stack above any open modal */}
      <DialogHost />

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
            {tg('app.connect')}
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
            {expandedHosts[sessionMenu.profile.id] ? tg('app.collapseDocker') : tg('app.expandDocker')}
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
            {tg('app.edit')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item"
            onClick={() => void editProfileTags(sessionMenu.profile.id)}
          >
            {tg('tags.edit')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item"
            onClick={() => void monitorProfile(sessionMenu.profile)}
          >
            {tg('ctx.monitor')}
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
            {tg('app.inventory')}
          </button>
          <div
            className={`session-context-submenu-wrap${sessionMenu.x > window.innerWidth - 320 ? ' open-left' : ''}`}
          >
            <button type="button" role="menuitem" className="session-context-menu-item session-context-menu-item--submenu">
              <span>{tg('app.moveTo')}</span>
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
                {tg('app.ungrouped')}
              </button>
              {folders.length === 0 ? (
                <div className="session-context-submenu-empty">{tg('app.noFolders')}</div>
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
              const name = p.label?.trim() || `${p.username}@${p.host}` || p.host || tg('app.thisConn')
              if (!window.confirm(tg('app.confirmDeleteConn', { name }))) return
              removeProfile(p.id)
              setSessionMenu(null)
            }}
          >
            {tg('app.delete')}
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
            {tg('app.renameEllipsis')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item danger"
            onClick={() => deleteFolder(folderMenu.folderId)}
          >
            {tg('app.deleteFolder')}
          </button>
        </div>
      )}
    </div>
  )
}
