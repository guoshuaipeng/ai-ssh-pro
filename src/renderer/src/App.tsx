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
import { askSftpClose, clearArmedFolderSync, requestFolderSync, takeArmedFolderSync } from './lib/sftp-activity'
import { clearHostHistory, countHostHistory, loadSmartPrefs, saveSmartPrefs, SMART_PREFS_EVENT } from './lib/smart-history'
import RemoteTextEditor from './components/RemoteTextEditor'
import DockerPanel from './components/DockerPanel'
import SessionDockerBranch, { type DockerTreeCache } from './components/SessionDockerBranch'
import HostInventoryModal, { type HostInventoryLink } from './components/HostInventoryModal'
import McpGuidePanel from './components/McpGuidePanel'
import LayoutResizer from './components/LayoutResizer'
import BatchExecuteModal, { type BatchSessionOption } from './components/BatchExecuteModal'
import PortForwardModal from './components/PortForwardModal'
import ResourceMonitorModal from './components/ResourceMonitorModal'
import MultiHostDashboard from './components/MultiHostDashboard'
import AlertRulesModal from './components/AlertRulesModal'
import BroadcastTargetPicker from './components/BroadcastTargetPicker'
import InspectWizard, { type InspectReport } from './components/InspectWizard'
import {
  evaluateAlerts,
  loadAlertHistory,
  loadAlertRules,
  readingsFromSnapshot,
  saveAlertHistory,
  saveAlertRules,
  type AlertRulesState,
  type FiredAlert
} from '@shared/alert-rules'
import { friendlyErrorMessage } from './lib/friendly-error'
import CommandPalette from './components/CommandPalette'
import WhatsNewModal, { WHATS_NEW_AUTO_KEY } from './components/WhatsNewModal'
import UpdateModal from './components/UpdateModal'
import { ToastHost, showToast } from './lib/toast'
import { isSkipped, markChecked, shouldAutoCheck, skipVersion } from './lib/update-check'
import { requestTerminalFind } from './lib/terminal-find'
import { matchKeymap } from '@shared/keymap'
import { changelogFor } from '@shared/changelog'
import { HOST_PROBE_INTERVAL_MS, type HostProbeResult } from '@shared/host-status'
import BackupModal from './components/BackupModal'
import ServerToolsModal from './components/ServerToolsModal'
import RecentConnections from './components/RecentConnections'
import SessionCommandBar from './components/SessionCommandBar'
import EmptyState from './components/EmptyState'
import HostPicker from './components/HostPicker'
import WelcomeTour, { TOUR_DONE_KEY } from './components/WelcomeTour'
import AiAssistCard from './components/AiAssistCard'
import {
  AI_EXPLAIN_EVENT,
  aiHasKey,
  enterAiMode,
  fillCommandBar,
  flashAiConfig,
  lastErrorFor,
  lastErrorSessionId,
  requestAiExplain,
  type AiExplainDetail
} from './lib/ai-events'
import { confirmAndRunAiCommand } from './lib/ai-run'
import { DEMO_HOST, DEMO_PROFILE_ID, DEMO_USER, demoProfileLabel } from '@shared/demo-host'
import { SHARED_MENUS, menuLabel, type MenuAction } from '@shared/menus'
import { useI18n, tg, type MessageKey } from './lib/i18n'
import { askConfirm, askText, confirmDialog, DialogHost , isDialogOpen, toast} from './lib/dialogs'
import { ContextMenuHost, openContextMenu, textFieldContextItems } from './components/ContextMenu'
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
  | 'monitor'
  | 'toolbox'
  | 'forward'
  | 'batch'
  | 'dashboard'
  | 'inspect-report'

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
  'mcpGuide',
  'monitor',
  'toolbox',
  'forward',
  'batch',
  'dashboard',
  'inspect-report'
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
  /** batch tab: sessions to tick */
  batchPreselect?: string[]
}

const PLACEHOLDER_CONNECT: SshConnectOptions = {
  host: '',
  port: 22,
  username: ''
}

function uuid(): string {
  return crypto.randomUUID()
}

/** UX-09: actions that need a connected SSH session; with none connected they open the host picker. */
const PICKER_ACTIONS = new Set<MenuAction>(['resourceMonitor', 'serverTools', 'sftp', 'folderSync', 'portForward', 'batchExec', 'aiCommand'])

function featureLabel(action: MenuAction, locale: string): string {
  for (const m of SHARED_MENUS) {
    for (const it of m.items) {
      if (it.type === 'item' && it.id === action) return menuLabel(it.label, locale).replace(/…$/, '')
    }
  }
  return action
}

function sessionHostKey(tab: { profileId?: string; connectOpts: { username?: string; host?: string; port?: number } }): string {
  if (tab.profileId) return `profile:${tab.profileId}`
  const o = tab.connectOpts
  return `${o.username || ''}@${o.host || ''}:${o.port || 22}`
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(sec / 60)
  const s2 = sec % 60
  return `${m}:${String(s2).padStart(2, '0')}`
}

export default function App() {
  const { t: tr, locale, setLocale } = useI18n()
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
  const [broadcastTargets, setBroadcastTargets] = useState<string[]>([])
  const [broadcastPickerOpen, setBroadcastPickerOpen] = useState(false)
  const [alertRules, setAlertRules] = useState<AlertRulesState>(() => loadAlertRules())
  const [alertHistory, setAlertHistory] = useState<FiredAlert[]>(() => loadAlertHistory())
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [alertModalTab, setAlertModalTab] = useState<'rules' | 'history'>('rules')
  const [inspectOpen, setInspectOpen] = useState(false)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [smartOn, setSmartOn] = useState(() => loadSmartPrefs().enabled)
  const alertBreachSinceRef = useRef(new Map<string, number>())
  const alertLastFiredRef = useRef(new Map<string, number>())
  const [activeAlertIds, setActiveAlertIds] = useState<Set<string>>(() => new Set())
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
  /** 每次点「新建连接」递增，强制 ConnectionConfigModal 重挂载（重置认证模式等本地态） */
  const [connectionFormNonce, setConnectionFormNonce] = useState(0)

  const [sessionMenu, setSessionMenu] = useState<{
    x: number
    y: number
    profile: SavedSessionProfile
    /** profile ids when the menu was opened on a multi-selection (H1) */
    multi?: string[]
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
        const auto = localStorage.getItem(WHATS_NEW_AUTO_KEY) !== '0'
        if (last && last !== v && auto && changelogFor(v).length) setWhatsNewOpen(true)
        // G2: fresh install only (never together with What's new)
        else if (!last && localStorage.getItem(TOUR_DONE_KEY) !== '1') window.setTimeout(() => setTourOpen(true), 600)
        localStorage.setItem('aiss.lastSeenVersion', v)
      })
      .catch(() => {})
  }, [])
  // V2: update check (silent once a day 10 s after start; manual from Help / More)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string; notes?: string } | null>(null)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const checkingUpdateRef = useRef(false)
  const runUpdateCheck = useCallback(async (manual: boolean) => {
    if (checkingUpdateRef.current) return
    checkingUpdateRef.current = true
    if (manual) showToast(tg('upd.checking'))
    try {
      const r = await window.aiss.app.checkUpdate()
      markChecked()
      if (r.status === 'available' && r.latestVersion) {
        const info = { version: r.latestVersion, url: r.downloadUrl || r.releaseUrl || '', notes: r.notes }
        if (!manual && isSkipped(r.latestVersion)) return
        setUpdateInfo(info)
        if (manual) setUpdateModalOpen(true)
        return
      }
      if (!manual) return
      if (r.status === 'error') {
        showToast(tg('upd.failed'), { kind: 'error', action: { label: tg('upd.retry'), run: () => void runUpdateCheck(true) } })
      } else {
        showToast(tg('upd.upToDate', { version: r.currentVersion }))
      }
    } catch {
      if (manual) showToast(tg('upd.failed'), { kind: 'error', action: { label: tg('upd.retry'), run: () => void runUpdateCheck(true) } })
    } finally {
      checkingUpdateRef.current = false
    }
  }, [])
  useEffect(() => {
    if (!shouldAutoCheck()) return
    const id = window.setTimeout(() => void runUpdateCheck(false), 10_000)
    return () => window.clearTimeout(id)
  }, [runUpdateCheck])
  // H2: host online status
  const [showHostStatus, setShowHostStatus] = useState(() => localStorage.getItem('aiss.showHostStatus') !== '0')
  const [hostStatus, setHostStatus] = useState<Record<string, HostProbeResult>>({})
  // H1: multi-select in the sidebar (Ctrl/Shift+click)
  const [multiSelected, setMultiSelected] = useState<string[]>([])
  const lastClickedProfileRef = useRef<string | null>(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const openDashboardRef = useRef<() => void>(() => {})
  const openToolTabRef = useRef<(
    kind: 'monitor' | 'toolbox' | 'sftp' | 'forward' | 'batch',
    forSessionId?: string | null,
    preselect?: string[],
    attempt?: number
  ) => void>(() => undefined)
  const [reconnectingTabId, setReconnectingTabId] = useState<string | null>(null)
  // G2 welcome tour, UX-09 host picker, A1 AI explain card, UX-10 indicators
  const [tourOpen, setTourOpen] = useState(false)
  const [hostPicker, setHostPicker] = useState<{ action: MenuAction; feature: string } | null>(null)
  const [aiExplain, setAiExplain] = useState<{ id: number; sessionId: string; text: string; host?: string } | null>(null)
  const aiExplainSeqRef = useRef(0)
  const [splitSecondary, setSplitSecondary] = useState('')
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null)
  const [recentKeys, setRecentKeys] = useState<string[]>([])
  const lastConnectErrorRef = useRef<string | null>(null)
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
  const connectedSshSessionsRef = useRef(connectedSshSessions)
  connectedSshSessionsRef.current = connectedSshSessions
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const addDemoHostRef = useRef<(connect: boolean) => Promise<void>>(async () => undefined)
  const activeIsDemo = Boolean(activeIsSession && activeTab?.status === 'connected' && activeTab.connectOpts.demo)
  // X3 / UX-10: broadcast targets are explicit; fall back to split pair for legacy
  const broadcastSessions = useMemo(() => {
    if (!broadcastEnabled) return [] as string[]
    if (broadcastTargets.length >= 2) return broadcastTargets
    if (splitEnabled && activeSessionId) return [...new Set([activeSessionId, splitSecondary || activeSessionId])]
    return activeSessionId ? [activeSessionId] : []
  }, [broadcastEnabled, broadcastTargets, splitEnabled, activeSessionId, splitSecondary])
  const [recordTick, setRecordTick] = useState(0)
  useEffect(() => {
    if (!recordingStartedAt) return
    const id = window.setInterval(() => setRecordTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [recordingStartedAt])
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
      lastConnectErrorRef.current = null
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
        lastConnectErrorRef.current = msg
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
  // keep the active tab visible when the tab bar scrolls
  useEffect(() => {
    if (!activeTabId) return
    const el = document.querySelector('.tab-bar .tab.active')
    if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])
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

  const closeTabRef = useRef<(tabId: string, sessionId: string, status: Tab['status'], view?: TabView) => void>(() => {})
  const sftpBypassRef = useRef(false)
  const closeTab = useCallback((tabId: string, sessionId: string, status: Tab['status'], view?: TabView) => {
    if (view === 'sftp' && !sftpBypassRef.current) {
      void askSftpClose().then((answer) => {
        if (answer === 'stay') return
        sftpBypassRef.current = true
        closeTabRef.current(tabId, sessionId, status, view)
        sftpBypassRef.current = false
      })
      return
    }
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
      view === 'mcpGuide' ||
      view === 'monitor' ||
      view === 'toolbox' ||
      view === 'forward' ||
      view === 'batch' ||
      view === 'dashboard' ||
      view === 'inspect-report'
    ) {
      // focus the host session the tool belonged to, else the neighbour tab
      const cur = tabsRef.current
      const idx = cur.findIndex((t) => t.tabId === tabId)
      const closing = cur[idx]
      const rest = cur.filter((t) => t.tabId !== tabId)
      const owner = closing?.boundSessionId ? rest.find((t) => t.sessionId === closing.boundSessionId) : undefined
      const fallback = owner?.tabId ?? rest[Math.min(Math.max(idx, 0), rest.length - 1)]?.tabId ?? null
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      setActiveTabId((c) => (c === tabId ? fallback : c))
      return
    }
    if (view === 'remote-file') {
      const drop = () => {
        clearRemoteFileDirty(tabId)
        setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
        setActiveTabId((cur) => (cur === tabId ? null : cur))
      }
      if (isRemoteFileDirty(tabId)) {
        void confirmDialog({ title: tg('dlg.confirmTitle'), body: tg('app.unsavedClose'), danger: true, confirmText: tg('dlg.discard') }).then((ok) => ok && drop())
        return
      }
      drop()
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
  closeTabRef.current = closeTab

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

  const resetConnectionForm = useCallback(() => {
    setHost('')
    setPort('22')
    setUsername('')
    setPassword('')
    setPrivateKeyPath('')
    setPassphrase('')
    setLabel('')
    setJumpHost('')
    setJumpPort('22')
    setJumpUsername('')
    setJumpPassword('')
    setJumpPrivateKeyPath('')
    setJumpPassphrase('')
    setForwardLocalPort('')
    setForwardRemoteHost('')
    setForwardRemotePort('')
    setSmartPaste('')
    setParseNotes(null)
    setError(null)
  }, [])

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
        // 新建：空白表单（占位 192.0.2.10），不带入侧栏选中 / 上次连接信息
        resetConnectionForm()
        setEditingSavedId(null)
        setConnectionFormNonce((n) => n + 1)
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
    [applyProfileToForm, ensureMainVisible, resetConnectionForm, tabs]
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

  const openSftpTransfer = useCallback((forSessionId?: string) => {
    ensureMainVisible()
    const tabs = tabsRef.current
    const sshTab = tabs.find(
      (t) =>
        (forSessionId ? t.sessionId === forSessionId : t.tabId === activeTabId) &&
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
            ? { ...t, title, boundSessionId: bound.sessionId, connectOpts: bound.connectOpts, profileId: bound.profileId }
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
        boundSessionId: bound.sessionId,
        profileId: bound.profileId
      }
    ])
    setActiveTabId(tabId)
  }, [activeTabId, ensureMainVisible, tabs])


  const openToolTab = useCallback(
    (kind: 'monitor' | 'toolbox' | 'sftp' | 'forward' | 'batch', forSessionId?: string | null, preselect?: string[], attempt = 0) => {
      ensureMainVisible()
      const tabsNow = tabsRef.current
      if (kind === 'sftp') {
        openSftpTransfer(forSessionId || undefined)
        return
      }
      if (kind === 'batch') {
        // one batch tab; re-opening focuses it (and updates the preselection)
        const pre = preselect ?? (forSessionId ? [forSessionId] : undefined)
        const ex = tabsNow.find((t) => t.view === 'batch')
        if (ex) {
          if (pre) setTabs((prev) => prev.map((t) => (t.tabId === ex.tabId ? { ...t, batchPreselect: pre } : t)))
          setActiveTabId(ex.tabId)
          return
        }
        const tabId = uuid()
        setTabs((prev) => [
          ...prev,
          {
            tabId,
            sessionId: '',
            title: tg('batch.title'),
            connectOpts: PLACEHOLDER_CONNECT,
            status: 'connected',
            view: 'batch',
            batchPreselect: pre
          }
        ])
        setActiveTabId(tabId)
        return
      }
      // a host that was just connected may not be in tabsRef yet: wait for it instead of
      // falling back to another host's session
      if (forSessionId && !tabsNow.some((t) => t.sessionId === forSessionId && t.status === 'connected')) {
        if (attempt < 20) {
          window.setTimeout(() => openToolTabRef.current(kind, forSessionId, preselect, attempt + 1), 150)
          return
        }
      }
      const bound =
        tabsNow.find(
          (t) =>
            (forSessionId ? t.sessionId === forSessionId : t.tabId === activeTabId) &&
            (!t.view || t.view === 'session') &&
            t.kind !== 'local' &&
            t.status === 'connected' &&
            t.sessionId
        ) ||
        tabsNow.find(
          (t) =>
            (!t.view || t.view === 'session') &&
            t.kind !== 'local' &&
            t.status === 'connected' &&
            t.sessionId
        )
      if (!bound) {
        setError(tg('app.needSshSftp'))
        return
      }
      const hostLabel = bound.title
      const titlePrefix = kind === 'monitor' ? tg('tab.monitor') : kind === 'forward' ? tg('pf.title') : tg('tab.toolbox')
      const title = `${titlePrefix} · ${hostLabel}`.slice(0, 24)
      const view: TabView = kind
      const existing = tabsNow.find(
        (t) => t.view === view && (t.boundSessionId === bound.sessionId || (!!bound.profileId && t.profileId === bound.profileId))
      )
      if (existing) {
        setTabs((prev) =>
          prev.map((t) =>
            t.tabId === existing.tabId
              ? {
                  ...t,
                  title,
                  boundSessionId: bound.sessionId,
                  connectOpts: bound.connectOpts,
                  profileId: bound.profileId
                }
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
          view,
          boundSessionId: bound.sessionId,
          profileId: bound.profileId
        }
      ])
      setActiveTabId(tabId)
    },
    [activeTabId, ensureMainVisible, openSftpTransfer]
  )
  openToolTabRef.current = openToolTab

  const openDashboard = useCallback(() => {
    ensureMainVisible()
    const tabsNow = tabsRef.current
    const ex = tabsNow.find((t) => t.view === 'dashboard')
    if (ex) {
      setActiveTabId(ex.tabId)
      return
    }
    const tabId = uuid()
    setTabs((prev) => [
      ...prev,
      {
        tabId,
        sessionId: '',
        title: tg('o1.title'),
        connectOpts: PLACEHOLDER_CONNECT,
        status: 'connected',
        view: 'dashboard'
      }
    ])
    setActiveTabId(tabId)
  }, [ensureMainVisible])
  openDashboardRef.current = openDashboard

  useEffect(() => {
    void window.aiss.ai.getSettings().then((s) => {
      const providers = Array.isArray(s?.providers) ? s.providers : []
      const p = providers.find((x) => x.id === s.activeProviderId) ?? providers[0]
      setAiConfigured(Boolean(p?.apiKey && p?.baseURL && s?.model))
    }).catch(() => setAiConfigured(false))
  }, [layout.showAi, inspectOpen])

  useEffect(() => {
    const sync = () => setSmartOn(loadSmartPrefs().enabled)
    window.addEventListener(SMART_PREFS_EVENT, sync)
    return () => window.removeEventListener(SMART_PREFS_EVENT, sync)
  }, [])
  useEffect(() => {
    const onNeed = () => updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
    window.addEventListener('aiss-ai-need-config', onNeed)
    return () => window.removeEventListener('aiss-ai-need-config', onNeed)
  }, [updateLayout])

  // O2: evaluate thresholds from dashboard/monitor snapshots periodically
  useEffect(() => {
    if (!connectedSshSessions.length) return
    const muted = alertRules.mutedUntil && Date.now() < alertRules.mutedUntil
    let cancelled = false
    const tick = async () => {
      const newly: FiredAlert[] = []
      const active = new Set<string>()
      for (const s of connectedSshSessionsRef.current) {
        try {
          const snap = await window.aiss.workspace.resources(s.sessionId)
          if (cancelled) return
          const readings = readingsFromSnapshot(snap, true)
          const fired = evaluateAlerts({
            hostKey: s.sessionId,
            hostTitle: s.title,
            rules: alertRules.rules,
            readings,
            breachSince: alertBreachSinceRef.current,
            lastFiredAt: alertLastFiredRef.current
          })
          for (const f of fired) {
            newly.push(f)
            active.add(s.sessionId)
          }
          // mark currently breaching for badge even inside cooldown
          for (const r of alertRules.rules) {
            if (!r.enabled) continue
            const val = readings.find((x) => x.metric === r.id)?.value
            if (r.id === 'offline') continue
            if (val != null && val >= r.threshold) active.add(s.sessionId)
          }
        } catch {
          /* ignore single host */
        }
      }
      if (cancelled) return
      setActiveAlertIds(active)
      if (newly.length && !muted) {
        setAlertHistory((prev) => {
          const next = [...newly, ...prev].slice(0, 200)
          saveAlertHistory(next)
          return next
        })
        if (alertRules.notify.systemNotify && typeof Notification !== 'undefined') {
          try {
            if (Notification.permission === 'granted') {
              const f = newly[0]!
              new Notification(`⚠ ${f.hostTitle}`, {
                body: `${f.ruleId} ${Math.round(f.value)}${f.ruleId === 'offline' ? '' : '%'} · ${new Date(f.at).toLocaleTimeString()}`
              })
            } else if (Notification.permission === 'default') {
              void Notification.requestPermission()
            }
          } catch { /* */ }
        }
        showToast(tg('o2.fired', { n: newly.length }), { kind: 'error' })
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 15000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [connectedSshSessions.length, alertRules])

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
          ...(p.demo ? { demo: true } : {}),
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

  /** "Connect": focus an open tab for this host, otherwise connect (H1). */
  const openOrFocusProfile = useCallback(
    (p: SavedSessionProfile) => {
      const live = tabsRef.current.find((x) => x.profileId === p.id && x.status !== 'disconnected' && (!x.view || x.view === 'session'))
      if (live) {
        setActiveTabId(live.tabId)
        return
      }
      void connectProfile(p)
    },
    [connectProfile]
  )
  const renameProfile = useCallback(
    async (p: SavedSessionProfile) => {
      setSessionMenu(null)
      const next = await askText(tg('ctx.renameTitle'), p.label?.trim() || `${p.username}@${p.host}`)
      if (next == null || !next.trim()) return
      void persistSessionState({ folders, profiles: profiles.map((x) => (x.id === p.id ? { ...x, label: next.trim() } : x)) })
    },
    [folders, persistSessionState, profiles]
  )
  const onSidebarKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const p = profiles.find((x) => x.id === selectedProfileId)
      if (!p) return
      if (e.key === 'Enter') {
        e.preventDefault()
        openOrFocusProfile(p)
      } else if (e.key === 'F2') {
        e.preventDefault()
        void renameProfile(p)
      } else if (e.key === 'Delete') {
        e.preventDefault()
        void deleteProfilesRef.current(multiSelected.length >= 2 ? multiSelected : [p.id])
      }
    },
    [profiles, selectedProfileId, openOrFocusProfile, renameProfile, multiSelected]
  )
  const deleteProfilesRef = useRef<(ids: string[]) => Promise<void>>(async () => undefined)

  const renderProfileBranch = (p: SavedSessionProfile, inFolder?: boolean) => (
    <SessionDockerBranch
      key={p.id}
      profile={p}
      selected={highlightedProfileId === p.id || multiSelected.includes(p.id)}
      inFolder={inFolder}
      hostStatus={showHostStatus ? (hostStatus[p.id] ?? null) : undefined}
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
      onSelect={(e) => {
        if (e.ctrlKey || e.metaKey) {
          setMultiSelected((prev) => {
            const base = prev.length ? prev : selectedProfileId ? [selectedProfileId] : []
            return base.includes(p.id) ? base.filter((x) => x !== p.id) : [...base, p.id]
          })
        } else if (e.shiftKey && lastClickedProfileRef.current) {
          const ids = profiles.map((x) => x.id)
          const a = ids.indexOf(lastClickedProfileRef.current)
          const b = ids.indexOf(p.id)
          if (a >= 0 && b >= 0) setMultiSelected(ids.slice(Math.min(a, b), Math.max(a, b) + 1))
        } else {
          setMultiSelected([])
        }
        if (!e.shiftKey) lastClickedProfileRef.current = p.id
        setSelectedProfileId(p.id)
      }}
      onConnect={() => openOrFocusProfile(p)}
      onContextMenu={(e) => {
        e.preventDefault()
        const multi = multiSelected.length >= 2 && multiSelected.includes(p.id) ? multiSelected : undefined
        if (!multi) {
          setMultiSelected([])
          setSelectedProfileId(p.id)
        }
        setSessionMenu({ x: e.clientX, y: e.clientY, profile: p, multi })
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
      if (path) {
        setRecordingSessionId(activeSessionId)
        setRecordingStartedAt(Date.now())
      } else setError(tg('app.recordFail'))
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
      setRecordingStartedAt(null)
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
    (profileId: string | string[], targetFolderId: string | undefined) => {
      const ids = new Set(Array.isArray(profileId) ? profileId : [profileId])
      const next = profiles.map((p) => {
        if (!ids.has(p.id)) return p
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

  // main-process menu clicks use the same handler as the titlebar menus (UX-03)
  useEffect(() => {
    return window.aiss.app.onOpenDialog((kind) => handleTitlebarMenuActionRef.current(kind))
  }, [])

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
      if (action === 'aiExplainError' || action === 'aiCommand' || action === 'aiInspect') {
        void aiHasKey().then((ready) => {
          if (!ready) {
            flashAiConfig(action === 'aiCommand' ? 'command' : 'explain')
            return
          }
          if (action === 'aiInspect') {
            setInspectOpen(true)
            return
          }
          if (action === 'aiExplainError') {
            const sid = activeSessionIdRef.current
            const text = lastErrorFor(sid) ?? lastErrorFor(null)
            const target = lastErrorFor(sid) ? sid : lastErrorSessionId()
            if (!text || !target) {
              showToast(tg('a1.noError'))
              return
            }
            requestAiExplain({ sessionId: target, text, source: 'palette' })
            return
          }
          if (connectedSshSessionsRef.current.length === 0) {
            setHostPicker({ action, feature: featureLabel(action, locale) })
            return
          }
          const sid = activeSessionIdRef.current
          if (sid) {
            enterAiMode(sid)
            return
          }
          const tab = tabsRef.current.find((x) => (!x.view || x.view === 'session') && x.status === 'connected' && x.sessionId)
          if (tab) {
            setActiveTabId(tab.tabId)
            window.setTimeout(() => enterAiMode(tab.sessionId), 120)
          }
        })
        return
      }
      // UX-09: features that need a session open the host picker when nothing is connected
      if (PICKER_ACTIONS.has(action) && connectedSshSessionsRef.current.length === 0) {
        setHostPicker({ action, feature: featureLabel(action, locale) })
        return
      }
      if (action === 'tour') {
        setTourOpen(true)
        return
      }
      if (action === 'demoHost') {
        void addDemoHostRef.current(true)
        return
      }
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
      if (action === 'folderSync') {
        const armed = takeArmedFolderSync()
        requestFolderSync(armed.set ? armed.profileId : undefined)
        openSftpTransfer()
        return
      }
      if (action === 'smartComplete') {
        const cur = loadSmartPrefs()
        const next = saveSmartPrefs({ ...cur, enabled: !cur.enabled })
        showToast(next.enabled ? tg('x1.toggleOn') : tg('x1.toggleOff'))
        return
      }
      if (action === 'clearHostHistory') {
        const tab =
          tabsRef.current.find((x) => x.tabId === activeTabId && (!x.view || x.view === 'session') && x.kind !== 'local') ||
          tabsRef.current.find((x) => (!x.view || x.view === 'session') && x.kind !== 'local' && x.status === 'connected')
        const hk = tab ? sessionHostKey(tab) : ''
        const host = tab ? tab.connectOpts.label?.trim() || tab.title : ''
        const n = countHostHistory(hk)
        void askConfirm(tg('x1.clear'), tg('x1.clearConfirm', { host: host || '—', n }), { danger: true, okLabel: tg('x1.clear') }).then((ok) => {
          if (!ok) return
          const removed = clearHostHistory(hk).removed
          showToast(tg('x1.cleared', { n: removed }))
        })
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
        setBroadcastEnabled((v) => {
          if (v) {
            setBroadcastTargets([])
            return false
          }
          setBroadcastPickerOpen(true)
          return v // stay off until picker confirms
        })
        return
      }
      if (action === 'broadcastTargets') {
        setBroadcastPickerOpen(true)
        return
      }
      if (action === 'alertRules') {
        setAlertModalTab('rules')
        setAlertModalOpen(true)
        return
      }
      if (action === 'alertHistory') {
        setAlertModalTab('history')
        setAlertModalOpen(true)
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
            showToast(tg('app.debugMissing'), { kind: 'error' })
            return
          }
          void d.openWindow()
        } catch (e) {
          showToast(e instanceof Error ? e.message : String(e), { kind: 'error' })
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
        openToolTabRef.current('batch')
        return
      }
      if (action === 'portForward') {
        openToolTabRef.current('forward')
        return
      }
      if (action === 'dashboard') {
        openDashboardRef.current()
        return
      }
      if (action === 'resourceMonitor') {
        openToolTabRef.current('monitor')
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
        openToolTabRef.current('toolbox')
        return
        return
      }
      if (action === 'settings') {
        openSettingsTab('terminalPrefs')
        return
      }
      if (action === 'find') {
        requestTerminalFind()
        return
      }
      if (action === 'toggleLanguage') {
        setLocale(locale === 'en' ? 'zh-CN' : 'en')
        return
      }
      if (action === 'toggleHostStatus') {
        setShowHostStatus((v) => {
          localStorage.setItem('aiss.showHostStatus', v ? '0' : '1')
          return !v
        })
        return
      }
      if (action === 'openAi') {
        if (!layout.showAi) toggleAi()
        return
      }
      if (action === 'checkUpdate') {
        void runUpdateCheck(true)
        return
      }
      if (action === 'github') {
        void window.aiss.app.openGithub().catch(() => undefined)
        return
      }
      if (action === 'reconnect' || action === 'duplicateSession') {
        const tab = tabs.find((x) => x.tabId === activeTabId)
        if (!tab || (tab.view && tab.view !== 'session') || tab.kind === 'local') {
          showToast(tg('toolbar.needSession'))
          return
        }
        if (action === 'reconnect') void reconnectTab(tab.tabId)
        else void openSession(tab.connectOpts, { profileId: tab.profileId, hostInventoryId: tab.hostInventoryId, kind: 'ssh' })
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
      activeTabId,
      locale,
      setLocale,
      layout.showAi,
      runUpdateCheck,
      reconnectTab,
      openSession
    ]
  )
  const handleTitlebarMenuActionRef = useRef(handleTitlebarMenuAction)
  handleTitlebarMenuActionRef.current = handleTitlebarMenuAction

  const openMonitorForSession = useCallback((sid: string | null) => {
    openToolTabRef.current('monitor', sid)
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

  /** H1: reuse a connected tab for this host or connect first; failure shows a toast with Retry. */
  const ensureProfileSession = useCallback(
    async (p: SavedSessionProfile): Promise<string | null> => {
      const live = tabsRef.current.find(
        (x) => x.profileId === p.id && x.status === 'connected' && x.sessionId && (!x.view || x.view === 'session')
      )
      if (live) return live.sessionId
      const sid = await connectProfile(p)
      if (!sid) return null
      await new Promise((r) => window.setTimeout(r, 30))
      return sid
    },
    [connectProfile]
  )
  const runForProfile = useCallback(
    (p: SavedSessionProfile, open: (sid: string) => void) => {
      setSessionMenu(null)
      void (async () => {
        const sid = await ensureProfileSession(p)
        if (sid) {
          open(sid)
          return
        }
        showToast(tg('ctx.connectFailed', { reason: tg('ctx.seeError') }), {
          kind: 'error',
          action: { label: tg('upd.retry'), run: () => runForProfile(p, open) }
        })
      })()
    },
    [ensureProfileSession]
  )
  const deleteProfilesFn = useCallback(
    async (ids: string[]) => {
      setSessionMenu(null)
      if (!ids.length) return
      const first = profiles.find((x) => x.id === ids[0])
      const name = first ? first.label?.trim() || `${first.username}@${first.host}` : ''
      const allDemo = ids.every((id) => profiles.find((x) => x.id === id)?.demo)
      const ok = allDemo || await askConfirm(
        ids.length > 1 ? tg('ctx.deleteManyTitle', { n: ids.length }) : tg('ctx.deleteOneTitle', { name }),
        tg('ctx.deleteIrreversible'),
        { danger: true, okLabel: ids.length > 1 ? tg('ctx.deleteMany', { n: ids.length }) : tg('app.delete') }
      )
      if (!ok) return
      const drop = new Set(ids)
      void persistSessionState({ folders, profiles: profiles.filter((x) => !drop.has(x.id)) })
      setMultiSelected([])
    },
    [folders, persistSessionState, profiles]
  )
  deleteProfilesRef.current = deleteProfilesFn

  /** G1: add the built-in demo host (local simulation, no network) and optionally open it. */
  const addDemoHost = useCallback(
    async (connect: boolean) => {
      let demo = profilesRef.current.find((x) => x.demo)
      if (!demo) {
        demo = {
          id: DEMO_PROFILE_ID,
          label: demoProfileLabel(locale),
          host: DEMO_HOST,
          port: 22,
          username: DEMO_USER,
          demo: true
        }
        await persistSessionState({ folders, profiles: [demo, ...profilesRef.current] })
      }
      setSelectedProfileId(demo.id)
      if (connect) openOrFocusProfile(demo)
    },
    [folders, locale, openOrFocusProfile, persistSessionState]
  )
  addDemoHostRef.current = addDemoHost

  // UX-09: picker → connect → open the feature that was asked for
  const openFeatureForSession = useCallback(
    (action: MenuAction, sid: string) => {
      if (action === 'resourceMonitor') openMonitorForSession(sid)
      else if (action === 'serverTools') {
        openToolTabRef.current('toolbox', sid)
      } else if (action === 'sftp') openSftpTransfer(sid)
      else if (action === 'folderSync') {
        const armed = takeArmedFolderSync()
        requestFolderSync(armed.set ? armed.profileId : undefined)
        openSftpTransfer(sid)
      } else if (action === 'portForward') openToolTabRef.current('forward', sid)
      else if (action === 'batchExec') {
        openToolTabRef.current('batch', sid)
      } else if (action === 'aiCommand') window.setTimeout(() => enterAiMode(sid), 120)
    },
    [openMonitorForSession, openSftpTransfer]
  )
  const pickHostForFeature = useCallback(
    async (p: SavedSessionProfile): Promise<string | null> => {
      const req = hostPicker
      if (!req) return null
      const sid = await connectProfile(p)
      if (!sid) return lastConnectErrorRef.current || tg('ctx.seeError')
      await new Promise((r) => window.setTimeout(r, 60))
      setHostPicker(null)
      openFeatureForSession(req.action, sid)
      return null
    },
    [connectProfile, hostPicker, openFeatureForSession]
  )
  useEffect(() => {
    if (!hostPicker) return
    void window.aiss.workspace.recent
      .list()
      .then((rows) => setRecentKeys(rows.map((r) => `${r.host}|${r.port || 22}|${r.username}`.toLowerCase())))
      .catch(() => setRecentKeys([]))
  }, [hostPicker])

  // A1: "Explain with AI" from the terminal hint, selection menu or palette → card at the top of the AI panel
  useEffect(() => {
    const onExplain = (e: Event) => {
      const d = (e as CustomEvent<AiExplainDetail>).detail
      if (!d?.text) return
      const tab = tabsRef.current.find((x) => x.sessionId === d.sessionId)
      updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
      aiExplainSeqRef.current += 1
      setAiExplain({
        id: aiExplainSeqRef.current,
        sessionId: d.sessionId,
        text: d.text,
        host: tab ? tab.connectOpts.label?.trim() || tab.title : undefined
      })
    }
    window.addEventListener(AI_EXPLAIN_EVENT, onExplain)
    return () => window.removeEventListener(AI_EXPLAIN_EVENT, onExplain)
  }, [updateLayout])
  const ensureAiVisible = useCallback(() => {
    updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
  }, [updateLayout])
  const closeTour = useCallback(() => setTourOpen(false), [])
  const focusSessionTab = useCallback((sid: string) => {
    const tab = tabsRef.current.find((x) => x.sessionId === sid && (!x.view || x.view === 'session'))
    if (tab) setActiveTabId(tab.tabId)
  }, [])
  // H2: TCP probe every 60 s while the window is visible
  useEffect(() => {
    if (!showHostStatus) return
    let cancelled = false
    const run = async () => {
      if (document.hidden) return
      const demo = profilesRef.current.filter((p) => p.demo)
      if (demo.length) {
        setHostStatus((prev) => {
          const next = { ...prev }
          for (const p of demo) next[p.id] = { id: p.id, latencyMs: 9, checkedAt: Date.now() }
          return next
        })
      }
      const targets = profilesRef.current
        .filter((p) => p.host && !p.demo)
        .map((p) =>
          p.jumpHost?.host?.trim()
            ? { id: p.id, host: p.jumpHost.host.trim(), port: p.jumpHost.port || 22 }
            : { id: p.id, host: p.host, port: p.port || 22 }
        )
      if (!targets.length || !window.aiss.workspace.probeHosts) return
      try {
        const res = await window.aiss.workspace.probeHosts(targets)
        if (cancelled) return
        setHostStatus((prev) => {
          const next = { ...prev }
          for (const r of res) next[r.id] = r
          return next
        })
      } catch {
        /* status stays as it was */
      }
    }
    void run()
    const id = window.setInterval(() => void run(), HOST_PROBE_INTERVAL_MS)
    const onVis = () => {
      if (!document.hidden) void run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [showHostStatus, profiles.length])

  // UX-22: unified right-click on text fields
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest('.ctx-menu-root, .xterm, .tab-context-menu, .session-context-menu')) return
      const field = t.closest('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null
      if (!field || field.disabled) return
      if ((field as HTMLInputElement).type === 'button' || (field as HTMLInputElement).type === 'checkbox' || (field as HTMLInputElement).type === 'radio' || (field as HTMLInputElement).type === 'file') return
      openContextMenu(e, textFieldContextItems(field, (k) => tg(k as 'ctx.copy')))
    }
    document.addEventListener('contextmenu', onCtx, true)
    return () => document.removeEventListener('contextmenu', onCtx, true)
  }, [])

  // UX-01/UX-02: every shortcut comes from the keymap registry; plain Ctrl+letter stays with a focused terminal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const inTerminal = Boolean(el?.closest('.xterm'))
      const action = matchKeymap(e, inTerminal)
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      // UX-45: ops shortcuts toast instead of running while a Confirm/Prompt is open
      const opsBlocked = new Set([
        'resourceMonitor',
        'serverTools',
        'sftp',
        'portForward',
        'batchExec',
        'dashboard'
      ])
      if (opsBlocked.has(action) && isDialogOpen()) {
        toast({ text: tg('ux45.finishDialog') })
        return
      }
      handleTitlebarMenuActionRef.current(action as TitlebarMenuAction)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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
        onQuickConnect={quickConnectRecent}
        hasSession={connectedSshSessions.length > 0}
        version={appVersion}
        isDev={import.meta.env.DEV}
        updateVersion={updateInfo?.version ?? null}
        onOpenUpdate={() => setUpdateModalOpen(true)}
        toggles={{
          toggleSidebar: layout.showSidebar,
          toggleMain: layout.showMain,
          toggleAi: layout.showAi,
          toggleSplit: splitEnabled,
          toggleHostStatus: showHostStatus,
          toggleBroadcast: broadcastEnabled,
          toggleRecording: Boolean(recordingSessionId),
          smartComplete: smartOn
        }}
      />

      <div className="app-shell">
        {layout.showSidebar ? (
          <>
            <aside className="sidebar" style={{ width: layout.sidebarWidth, minWidth: layout.sidebarWidth }}>
              <div className="sidebar-header">
                <h3>{tr('sidebar.saved')}</h3>
                <SessionSearchBar value={sessionSearch} onChange={setSessionSearch} />
              </div>
              <div className="sidebar-scroll" tabIndex={0} onKeyDown={onSidebarKeyDown}>
                <RecentConnections hideWhenEmpty={profiles.length === 0} onQuickConnect={quickConnectRecent} />
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
                  <EmptyState
                    testId="sidebar-empty"
                    compact
                    icon="🖥"
                    title={tr('ux08.sidebarTitle')}
                    desc={tr('ux08.sidebarDesc')}
                    primary={{ label: tr('ux08.newConnection'), onClick: () => openConnectionEditor(), testId: 'empty-new-connection', tour: 'new-connection' }}
                    secondary={[
                      { label: tr('ux08.import'), onClick: () => void importSessionsPick() },
                      { label: tr('g1.try'), onClick: () => void addDemoHost(true), testId: 'empty-try-demo' }
                    ]}
                  />
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
            {broadcastSessions.length ? (
              <button
                type="button"
                className="broadcast-badge"
                data-testid="broadcast-badge"
                title={tr('ux10.broadcastOff')}
                onClick={() => setBroadcastEnabled(false)}
              >
                {tr('ux10.broadcasting', { n: broadcastSessions.length })}
              </button>
            ) : null}
            {tabs.map((t) => {
              const isSession = !t.view || t.view === 'session'
              return (
              <button
                key={t.tabId}
                type="button"
                className={`tab tab-kind-${t.view || 'session'} ${t.tabId === activeTabId ? 'active' : ''} ${isSession && t.status === 'disconnected' ? 'tab--disconnected' : ''} ${isSession && t.status === 'connecting' ? 'tab--connecting' : ''} ${t.view && WORKSPACE_TAB_VIEWS.has(t.view) ? 'tab--workspace' : ''}`}
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
                <>
                {isSession && t.sessionId && broadcastSessions.includes(t.sessionId) ? (
                  <span className="tab-bc-dot" data-testid="tab-bc-dot" title={tr('ux10.inBroadcast')} aria-label={tr('ux10.inBroadcast')} />
                ) : null}
                {isSession && t.sessionId && t.sessionId === recordingSessionId ? (
                  <span
                    className="tab-rec"
                    data-testid="tab-rec"
                    data-tick={recordTick}
                    title={tr('ux10.recFor', { time: formatDuration(Date.now() - (recordingStartedAt ?? Date.now())) })}
                  >
                    ●REC
                  </span>
                ) : null}
                <span className="tab-title">
                  {isSession && t.status === 'connecting'
                    ? tr('tab.connecting', { title: t.title })
                    : isSession && t.status === 'disconnected'
                      ? tr('tab.disconnected', { title: t.title })
                      : t.title}
                </span>
                </>
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
          {broadcastSessions.length ? <div className="broadcast-bar" data-testid="broadcast-bar" aria-hidden /> : null}
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
                        openToolTabRef.current('forward', tab.sessionId)
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

          {activeIsDemo ? (
            <div className="demo-banner" data-testid="demo-banner" role="status">
              <span>{tr('g1.banner')}</span>
              <button type="button" className="primary" onClick={() => openConnectionEditor()}>
                {tr('g1.addMine')}
              </button>
            </div>
          ) : null}

          {activeIsSession && activeTab?.status === 'connected' && activeTab.sessionId ? (
            <SessionCommandBar
              sessionId={activeTab.sessionId}
              hostLabel={activeTab.connectOpts.label?.trim() || activeTab.title}
              hostKey={sessionHostKey(activeTab)}
              onOpenAiSettings={() => openSettingsTab('ai')}
            />
          ) : null}

          <div className="terminal-stack">
            {tabs.length === 0 ? (
              <EmptyState
                testId="terminal-empty"
                icon="⌨"
                title={tr('ux08.termTitle')}
                desc={tr('ux08.termDesc')}
                primary={{ label: tr('ux08.newConnection'), onClick: () => openConnectionEditor(), avoid: true }}
                secondary={[{ label: tr('ux08.palette'), onClick: () => setPaletteOpen(true) }]}
              >
                <RecentConnections variant="welcome" limit={5} hideWhenEmpty onQuickConnect={quickConnectRecent} />
                <div className="empty-state-keys">
                  <span>
                    <kbd>Ctrl+Shift+N</kbd> {tr('ux08.keyNew')}
                  </span>
                  <span>
                    <kbd>Ctrl+K</kbd> {tr('ux08.keyPalette')}
                  </span>
                </div>
              </EmptyState>
            ) : null}
            {tabs.map((t) => {
              return (
              <div key={t.tabId} className={`terminal-layer ${t.tabId === activeTabId ? 'active' : ''}`}>
                {t.view === 'connection' ? (
                  <ConnectionConfigModal
                    key={editingSavedId ? `edit-${editingSavedId}` : `new-${connectionFormNonce}`}
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
                    onConnect={(lnk) => {
                      const pid = lnk.profileId
                      const prof = pid
                        ? profiles.find((p) => p.id === pid)
                        : profiles.find((p) => p.host === lnk.host && (!lnk.username || p.username === lnk.username))
                      if (prof) void connectProfile(prof)
                      else openConnectionEditor()
                    }}
                    onOpenTool={(tool, lnk) => {
                      const sid =
                        tabsRef.current.find((x) => x.profileId && lnk.profileId && x.profileId === lnk.profileId && x.status === 'connected')?.sessionId ||
                        tabsRef.current.find((x) => x.connectOpts?.host === lnk.host && x.status === 'connected' && (!x.view || x.view === 'session'))?.sessionId
                      if (tool === 'sftp') openToolTabRef.current('sftp', sid)
                      else if (tool === 'monitor') openToolTabRef.current('monitor', sid)
                      else openToolTabRef.current('toolbox', sid)
                    }}
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
                ) : t.view === 'monitor' && t.boundSessionId ? (
                  <ResourceMonitorModal
                    open
                    embedded
                    sessions={connectedSshSessions}
                    activeSessionId={t.boundSessionId}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    onOpenTools={(sid) => openToolTabRef.current('toolbox', sid)}
                  />
                ) : t.view === 'toolbox' && t.boundSessionId ? (
                  <ServerToolsModal
                    open
                    embedded
                    sessions={connectedSshSessions}
                    activeSessionId={t.boundSessionId}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'forward' ? (
                  <PortForwardModal
                    open
                    embedded
                    sessions={connectedSshSessions}
                    activeSessionId={t.boundSessionId ?? activeSessionId ?? null}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'batch' ? (
                  <BatchExecuteModal
                    key={`batch:${(t.batchPreselect ?? []).join(',')}`}
                    open
                    embedded
                    sessions={connectedSshSessions}
                    preselect={t.batchPreselect}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'dashboard' ? (
                  <MultiHostDashboard
                    sessions={connectedSshSessions}
                    alertSessionIds={activeAlertIds}
                    sortAlertsFirst
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    onOpenMonitor={(sid) => openToolTabRef.current('monitor', sid)}
                    onOpenToolbox={(sid) => openToolTabRef.current('toolbox', sid)}
                    onConnectTerminal={(sid) => {
                      const tab = tabsRef.current.find((x) => x.sessionId === sid)
                      if (tab) setActiveTabId(tab.tabId)
                    }}
                    onOpenAlertRules={() => {
                      setAlertModalTab('rules')
                      setAlertModalOpen(true)
                    }}
                    onOpenInspect={() => setInspectOpen(true)}
                  />
                ) : t.view === 'inspect-report' ? (
                  <div className="workspace-panel" data-testid="inspect-report">
                    <div className="workspace-panel-toolbar">
                      <h2 className="workspace-panel-title">{t.title}</h2>
                      <div className="workspace-panel-actions">
                        <button
                          type="button"
                          onClick={() => {
                            const md = (t as { inspectMarkdown?: string }).inspectMarkdown || ''
                            void navigator.clipboard.writeText(md)
                            showToast(tg('a3.copied'), { kind: 'info' })
                          }}
                        >
                          {tg('a3.copyMd')}
                        </button>
                        <button type="button" onClick={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}>
                          {tg('common.close')}
                        </button>
                      </div>
                    </div>
                    <div className="workspace-panel-body a3-report-body">
                      <pre className="a3-report-pre">{(t as { inspectMarkdown?: string }).inspectMarkdown || ''}</pre>
                    </div>
                  </div>
                ) : t.view === 'sftp' ? (
                  <SftpPanel
                    key={t.boundSessionId || t.tabId}
                    sessionId={t.boundSessionId || null}
                    sessionTitle={t.title.replace(/^[^·]+ · /, '')}
                    hostKey={sessionHostKey(t)}
                    hostLabel={t.connectOpts.label?.trim() || t.title}
                    hostName={t.connectOpts.host}
                    tags={profiles.find((p) => p.id === t.profileId)?.tags}
                    connected={tabs.some((x) => x.sessionId === t.boundSessionId && x.status === 'connected')}
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
                      hostKey={sessionHostKey(t)}
                      onSecondaryChange={setSplitSecondary}
                      peers={connectedSshSessions
                        .filter((x) => x.sessionId !== t.sessionId)
                        .map((x) => ({ sessionId: x.sessionId, title: x.title }))}
                    />
                  ) : (
                    <TerminalPane
                      sessionId={t.sessionId}
                      active={t.tabId === activeTabId}
                      prefs={terminalPrefs}
                      hostKey={sessionHostKey(t)}
                      onUserData={
                        broadcastEnabled && broadcastSessions.length > 1
                          ? (data) => {
                              for (const sid of broadcastSessions) void window.aiss.ssh.write(sid, data)
                            }
                          : undefined
                      }
                    />
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
            {aiExplain ? (
              <AiAssistCard
                key={aiExplain.id}
                request={aiExplain}
                onClose={() => setAiExplain(null)}
                onOpenSettings={() => openSettingsTab('ai')}
                onInsert={(sid, command) => {
                  focusSessionTab(sid)
                  window.setTimeout(() => fillCommandBar(sid, command), 60)
                }}
                onRun={(sid, command) => {
                  focusSessionTab(sid)
                  window.setTimeout(() => void confirmAndRunAiCommand({ sessionId: sid, command, host: aiExplain.host }), 60)
                }}
              />
            ) : null}
            <AIPanel
              onOpenSettings={() => openSettingsTab('ai')}
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

      <HostPicker
        open={Boolean(hostPicker)}
        feature={hostPicker?.feature ?? ''}
        profiles={profiles}
        recentKeys={recentKeys}
        statusById={showHostStatus ? hostStatus : undefined}
        groupOf={(p) => (p.folderId ? folders.find((f) => f.id === p.folderId)?.name : undefined)}
        onPick={pickHostForFeature}
        onNewConnection={() => openConnectionEditor()}
        onClose={() => {
          clearArmedFolderSync()
          setHostPicker(null)
        }}
      />
      <WelcomeTour open={tourOpen} onClose={closeTour} ensureAiVisible={ensureAiVisible} />
      <HostKeyConfirmModal prompt={hostKeyPrompt} onRespond={(accept, alwaysTrust) => void respondHostKey(accept, alwaysTrust)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
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
          openToolTabRef.current('toolbox', sid)
        }}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={handleTitlebarMenuAction} aiReady={aiConfigured} />
      <WhatsNewModal
        open={whatsNewOpen}
        version={appVersion}
        onClose={() => setWhatsNewOpen(false)}
        onAction={handleTitlebarMenuAction}
      />
      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
      <UpdateModal
        open={updateModalOpen && Boolean(updateInfo)}
        version={updateInfo?.version ?? ''}
        notes={updateInfo?.notes}
        onDownload={() => {
          setUpdateModalOpen(false)
          if (updateInfo?.url) void window.aiss.app.openExternal(updateInfo.url)
        }}
        onLater={() => setUpdateModalOpen(false)}
        onSkip={() => {
          if (updateInfo) skipVersion(updateInfo.version)
          setUpdateModalOpen(false)
          setUpdateInfo(null)
        }}
      />
      {/* last so confirm/prompt dialogs stack above any open modal */}
      <ContextMenuHost />
      <DialogHost />
      <ToastHost />

      {sessionMenu && (() => {
        const p = sessionMenu.profile
        const multi = sessionMenu.multi
        const multiProfiles = multi ? profiles.filter((x) => multi.includes(x.id)) : []
        const item = (key: string, label: string, onClick: () => void, opts?: { hint?: string; danger?: boolean; disabled?: boolean }) => (
          <button
            key={key}
            type="button"
            role="menuitem"
            data-ctx={key}
            className={`session-context-menu-item${opts?.danger ? ' danger' : ''}`}
            disabled={opts?.disabled}
            onClick={onClick}
          >
            <span>{label}</span>
            {opts?.hint ? <span className="session-context-menu-hint">{opts.hint}</span> : null}
          </button>
        )
        const moveTo = (ids: string[], currentFolder?: string) => (
          <div className={`session-context-submenu-wrap${sessionMenu.x > window.innerWidth - 320 ? ' open-left' : ''}`}>
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
                disabled={ids.length === 1 && !currentFolder}
                onClick={() => moveProfileToFolder(ids, undefined)}
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
                    disabled={ids.length === 1 && currentFolder === f.id}
                    onClick={() => moveProfileToFolder(ids, f.id)}
                  >
                    {f.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )
        if (multi) {
          return (
            <div
              ref={sessionMenuRef}
              className="session-context-menu"
              style={{ left: sessionMenu.x, top: sessionMenu.y }}
              role="menu"
              data-testid="host-menu-multi"
            >
              {item('connectAll', tg('ctx.connectAll', { n: multi.length }), () => {
                setSessionMenu(null)
                for (const x of multiProfiles) openOrFocusProfile(x)
              })}
              {item('batch', tg('ctx.batch'), () => {
                setSessionMenu(null)
                void (async () => {
                  const sids: string[] = []
                  for (const x of multiProfiles) {
                    const sid = await ensureProfileSession(x)
                    if (sid) sids.push(sid)
                  }
                  openToolTabRef.current('batch', null, sids)
                })()
              })}
              {moveTo(multi)}
              <div className="session-context-menu-sep" />
              {item('delete', tg('ctx.deleteMany', { n: multi.length }), () => void deleteProfilesFn(multi), { danger: true, hint: 'Del' })}
            </div>
          )
        }
        const dockerBusy =
          (dockerTreeByProfileId[p.id]?.status === 'connecting' || dockerTreeByProfileId[p.id]?.status === 'loading') &&
          !expandedHosts[p.id]
        return (
          <div
            ref={sessionMenuRef}
            className="session-context-menu"
            style={{ left: sessionMenu.x, top: sessionMenu.y }}
            role="menu"
            data-testid="host-menu"
          >
            {item('connect', tg('app.connect'), () => {
              setSessionMenu(null)
              openOrFocusProfile(p)
            }, { hint: 'Enter' })}
            {item('connectNew', tg('ctx.connectNewTab'), () => {
              setSessionMenu(null)
              void connectProfile(p)
            })}
            <div className="session-context-menu-sep" />
            {item('sftp', tg('ctx.sftp'), () => runForProfile(p, (sid) => openSftpTransfer(sid)))}
            {item('monitor', tg('ctx.monitor'), () => void monitorProfile(p))}
            {item('toolbox', tg('ctx.toolbox'), () =>
              runForProfile(p, (sid) => {
                openToolTabRef.current('toolbox', sid)
              })
            )}
            {item('docker', expandedHosts[p.id] ? tg('app.collapseDocker') : tg('app.expandDocker'), () => {
              toggleHostExpanded(p)
              setSessionMenu(null)
            }, { disabled: dockerBusy || p.demo })}
            <div className="session-context-menu-sep" />
            {item('edit', tg('ctx.edit'), () => {
              openConnectionEditor(p)
              setSessionMenu(null)
            }, p.demo ? { disabled: true, hint: tg('g1.readOnly') } : undefined)}
            {item('rename', tg('ctx.rename'), () => void renameProfile(p), { hint: 'F2' })}
            {item('tags', tg('ctx.tags'), () => void editProfileTags(p.id))}
            {item('inventory', tg('app.inventory'), () => {
              openInventoryEditor({
                profileId: p.id,
                host: p.host,
                port: p.port,
                username: p.username,
                label: p.label,
                hostInventoryId: p.hostInventoryId
              })
              setSessionMenu(null)
            })}
            {moveTo([p.id], p.folderId)}
            {item('copyAddr', tg('ctx.copyAddr'), () => {
              setSessionMenu(null)
              const addr = `${p.username}@${p.host}${p.port && p.port !== 22 ? ` -p ${p.port}` : ''}`
              void navigator.clipboard.writeText(addr).then(() => showToast(tg('ctx.copied')))
            })}
            <div className="session-context-menu-sep" />
            {item('delete', tg('app.delete'), () => void deleteProfilesFn([p.id]), { danger: true, hint: 'Del' })}
          </div>
        )
      })()}

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
