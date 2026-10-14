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
import UpdateChannelPanel from './components/UpdateChannelPanel'
import ImportPreviewPanel from './components/ImportPreviewPanel'
import FileDiffView from './components/FileDiffView'
import RetentionTasks from './components/RetentionTasks'
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
import { loadUpdateChannelPrefs, rememberUpdateSource, sourceLabel } from '@shared/update-channel'
import { alertHostIds, ignoreAlert, locateTargetFor, reconcileAlerts } from '@shared/alert-locate'
import { buildAlertContext } from '@shared/alert-context'
import { COMPARE_BYTE_LIMIT } from '@shared/file-diff'
import { applyImportPolicy, buildImportPreview, type ImportPolicy, type ImportPreviewModel } from '@shared/import-preview'
import { completeTask, dismissTasksForever, loadTaskState, pendingTasks, reopenTasks, skipTask, TASK_IDS, type TaskId, type TaskState } from '@shared/retention-tasks'
import { loadSftpDensity, saveSftpDensity, SFTP_DENSITY_EVENT } from '@shared/sftp-density'
import type { ServerToolsTab } from './components/ServerToolsModal'
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
import { runGuardedCommand } from './lib/protection-gate'
import OpsHomeTab, { type HomeHost } from './components/OpsHomeTab'
import AlertWorkbenchTab from './components/AlertWorkbenchTab'
import AuditLogPanel from './components/AuditLogPanel'
import { PlaybookEditor, PlaybookList, PlaybookResult, PlaybookRun } from './components/PlaybookTabs'
import { SyncConflicts, SyncSettings, useSyncPhase } from './components/SyncCenter'
import { RecordingPlayer, RecordingsList } from './components/RecordingsTab'
import TerminalBlocks, { turnBlocks } from './components/TerminalBlocks'
import SyncPreviewTab, { type SyncPreviewPlan } from './components/SyncPreviewTab'
import { blocksEnabled } from '@shared/terminal-blocks'
import { chainFromProfile, hopToJump, parseHopFailure, parseProxyJump } from '@shared/jump-chain'
import type { JumpHop } from '@shared/jump-chain'
import { loadPlaybooks } from '@shared/playbook'
import { statusGlyph, type SyncPhase } from '@shared/sync-vault'
import { runCloudSync, syncIsConfigured } from './lib/cloud-sync'
import { runFolderSyncDurable } from './lib/folder-sync-run'
import { connectOptsFromProfile } from './lib/connect-opts'
import StartupSettingsModal from './components/StartupSettingsModal'
import ProtectionSection, { ProtectionLevelField } from './components/ProtectionSection'
import ScopePicker from './components/ScopePicker'
import { activeCount, loadBellPrefs, markHandled, saveBellPrefs, type AlertFilter, type BellPrefs } from '@shared/alert-workbench'
import { appendAudit, auditEnabled, loadAudit, setAuditEnabled, type AuditEvent } from '@shared/audit-log'
import { hostInScope, loadDashScope, saveDashScope, type DashScope } from '@shared/dashboard-scope'
import { assessCommandRisk } from '@shared/command-risk'
import { effectiveLevel, elevateUntil, hostNameMatches, isElevated, loadElevate, saveElevate, wantsProductionHint, type ElevateMap, type ProtectionLevel } from '@shared/protection'
import { loadLastWorkspace, loadStartupMode, saveLastWorkspace, saveStartupMode, type StartupMode } from '@shared/startup-pref'
import { DEMO_HOST, DEMO_PROFILE_ID, DEMO_USER, demoProfileLabel } from '@shared/demo-host'
import { SHARED_MENUS, menuLabel, type MenuAction } from '@shared/menus'
import { useI18n, tg, type MessageKey } from './lib/i18n'
import { askConfirm, askText, confirmDialog, promptDialog, DialogHost , isDialogOpen, toast} from './lib/dialogs'
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
  | 'updates'
  | 'import-preview'
  | 'file-diff'
  | 'home'
  | 'alert-workbench'
  | 'audit'
  | 'playbook-list'
  | 'playbook-edit'
  | 'playbook-run'
  | 'playbook-result'
  | 'sync-settings'
  | 'sync-conflicts'
  | 'recordings'
  | 'recording-play'
  | 'sync-preview'

type SettingsTabView = 'ai' | 'terminalPrefs' | 'uiTheme' | 'snippets' | 'mcpGuide' | 'updates'

const SETTINGS_TAB_TITLES: Record<SettingsTabView, MessageKey> = {
  ai: 'app.tab.ai',
  terminalPrefs: 'app.tab.terminalPrefs',
  uiTheme: 'app.tab.uiTheme',
  snippets: 'app.tab.snippets',
  mcpGuide: 'app.tab.mcpGuide',
  updates: 'app.tab.updates'
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
  'inspect-report',
  'updates',
  'import-preview',
  'file-diff',
  'home',
  'alert-workbench',
  'audit',
  'playbook-list',
  'playbook-edit',
  'playbook-run',
  'playbook-result',
  'sync-settings',
  'sync-conflicts',
  'recordings',
  'recording-play',
  'sync-preview'
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
  /** toolbox tab to focus (O4 locate) */
  toolboxTab?: ServerToolsTab
  /** L2 deep link */
  focusAlertId?: string
  alertFilter?: AlertFilter
  alertNonce?: number
  explainOnOpen?: boolean
  /** S1 host filter */
  auditHost?: string
  playbookId?: string
  recordingFile?: string
  syncPlan?: SyncPreviewPlan
  /** D5 compare payload */
  fileCompare?: {
    leftName: string
    rightName: string
    leftText: string
    rightText: string
    tooLarge: boolean
    remotePath?: string
    sessionId?: string
  }
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

function syncPhaseKey(phase: SyncPhase): MessageKey {
  if (phase === 'syncing') return 'm2.phase.syncing'
  if (phase === 'conflict') return 'm2.phase.conflict'
  if (phase === 'error') return 'm2.phase.error'
  return 'm2.phase.synced'
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
  const [bellPrefs, setBellPrefs] = useState<BellPrefs>(() => loadBellPrefs())
  const [dashScope, setDashScope] = useState<DashScope>(() => loadDashScope())
  const [startupMode, setStartupMode] = useState<StartupMode>(() => loadStartupMode())
  const [startupOpen, setStartupOpen] = useState(false)
  const [elevateMap, setElevateMap] = useState<ElevateMap>(() => loadElevate())
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      setElevateMap((prev) => {
        let changed = false
        const next: ElevateMap = {}
        for (const [k, until] of Object.entries(prev)) {
          if (until > now) next[k] = until
          else changed = true
        }
        if (!changed) return prev
        saveElevate(next)
        return next
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [])
  const [auditOn, setAuditOn] = useState(() => auditEnabled())
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() => loadAudit())
  const [guardCollapsed, setGuardCollapsed] = useState<Record<string, boolean>>({})
  const [protection, setProtection] = useState<ProtectionLevel>('normal')
  const [jumpChain, setJumpChain] = useState<JumpHop[]>([])
  const [connAuth, setConnAuth] = useState<'password' | 'key' | 'agent'>('password')
  const [certificatePath, setCertificatePath] = useState('')
  const [formAutoRecord, setFormAutoRecord] = useState(false)
  const [blocksOn, setBlocksOn] = useState(() => blocksEnabled())
  const [jumpFail, setJumpFail] = useState<{ hop: number; total: number; name: string; profileId?: string } | null>(null)
  const syncMeta = useSyncPhase()
  const [syncReady, setSyncReady] = useState(false)
  const [hasPlaybooks, setHasPlaybooks] = useState(() => loadPlaybooks().length > 0)
  useEffect(() => {
    const refreshSync = () => {
      void window.aiss?.sync
        ?.getConfig?.()
        .then((cfg) => setSyncReady(syncIsConfigured(cfg)))
        .catch(() => setSyncReady(false))
    }
    const refreshBooks = () => setHasPlaybooks(loadPlaybooks().length > 0)
    refreshSync()
    refreshBooks()
    window.addEventListener('aiss-sync-meta', refreshSync)
    window.addEventListener('aiss-playbooks', refreshBooks)
    return () => {
      window.removeEventListener('aiss-sync-meta', refreshSync)
      window.removeEventListener('aiss-playbooks', refreshBooks)
    }
  }, [])
  const [sessionsReady, setSessionsReady] = useState(false)
  const [inventoryScroll, setInventoryScroll] = useState(false)
  const breachingRef = useRef(new Set<string>())
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
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string; notes?: string; source?: string } | null>(null)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const checkingUpdateRef = useRef(false)
  const runUpdateCheck = useCallback(async (manual: boolean) => {
    if (checkingUpdateRef.current) return
    checkingUpdateRef.current = true
    if (manual) showToast(tg('upd.checking'))
    try {
      const prefs = loadUpdateChannelPrefs()
      const r = await window.aiss.app.checkUpdate({ channel: prefs.channel, customUrl: prefs.mirror })
      markChecked()
      if (r.source) rememberUpdateSource({ source: r.source, channel: prefs.channel, at: Date.now() })
      if (r.status === 'available' && r.latestVersion) {
        const info = {
          version: r.latestVersion,
          url: r.downloadUrl || r.releaseUrl || '',
          notes: r.notes,
          source: r.source ? sourceLabel(r.source, locale) : undefined
        }
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
  }, [locale])
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
    attempt?: number,
    toolboxTab?: ServerToolsTab
  ) => void>(() => undefined)
  const [taskState, setTaskState] = useState<TaskState>(() => loadTaskState())
  const [tasksOpen, setTasksOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreviewModel | null>(null)
  const [sftpComfort, setSftpComfort] = useState(() => loadSftpDensity() === 'comfort')
  const pendingLocateRef = useRef<ServerToolsTab | 'terminal' | null>(null)
  const [reconnectingTabId, setReconnectingTabId] = useState<string | null>(null)
  // G2 welcome tour, UX-09 host picker, A1 AI explain card, UX-10 indicators
  const [tourOpen, setTourOpen] = useState(false)
  const [hostPicker, setHostPicker] = useState<{ action: MenuAction; feature: string } | null>(null)
  const [aiExplain, setAiExplain] = useState<{ id: number; sessionId: string; text: string; host?: string; kind?: 'explainError' | 'explainAlert' } | null>(null)
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
        .map((tab) => {
          const prof = profiles.find((p) => p.id === tab.profileId)
          return {
            sessionId: tab.sessionId,
            title: tab.title,
            host: tab.connectOpts.host,
            port: tab.connectOpts.port || 22,
            username: tab.connectOpts.username,
            profileId: tab.profileId,
            folderId: prof?.folderId
          }
        }),
    [tabs, profiles]
  )
  const onlineSessionIds = useMemo(() => new Set(connectedSshSessions.map((s) => s.sessionId)), [connectedSshSessions])
  const homeHosts = useMemo<HomeHost[]>(() => {
    return profiles
      .filter((p) => hostInScope(dashScope, { profileId: p.id, folderId: p.folderId }))
      .map((p) => {
        const live = connectedSshSessions.find((s) => s.profileId === p.id)
        const probe = hostStatus[p.id]
        const title = p.label?.trim() || `${p.username}@${p.host}`
        const alerting = live
          ? activeAlertIds.has(live.sessionId)
          : alertHistory.some((a) => a.status === 'active' && (a.hostTitle === title || a.hostTitle === p.host))
        return {
          profileId: p.id,
          title,
          host: p.host,
          sessionId: live?.sessionId,
          online: Boolean(live) || (probe?.latencyMs != null),
          latencyMs: probe?.latencyMs,
          protection: effectiveLevel(p),
          demo: p.demo,
          alerting,
          folderId: p.folderId
        }
      })
  }, [profiles, dashScope, connectedSshSessions, hostStatus, activeAlertIds, alertHistory])
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
      .then((state) => {
        setSessionState(state)
        setSessionsReady(true)
      })
      .catch((e) => {
        console.error('[app] sessions.list failed', e)
        setError(e instanceof Error ? e.message : String(e))
        setSessionsReady(true)
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
        const prof = extra?.profileId ? profilesRef.current.find((p) => p.id === extra.profileId) : undefined
        if (prof?.autoRecord) {
          const path = await window.aiss.ssh.startRecording(sessionId, {
            auto: true,
            host: meta.host,
            cols: meta.termCols,
            rows: meta.termRows,
            title: meta.label
          })
          if (path) {
            setRecordingSessionId(sessionId)
            setRecordingStartedAt(Date.now())
          }
        }
        setJumpFail(null)
        return sessionId
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const hop = parseHopFailure(msg)
        setJumpFail(hop ? { hop: hop.hop, total: hop.total, name: hop.name, profileId: extra?.profileId } : null)
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
        ...(jumpChain.length ? { jumpChain, jumpHost: jump ?? hopToJump(jumpChain[0]!) } : {}),
        ...(connAuth ? { authMode: connAuth } : {}),
        ...(certificatePath.trim() ? { certificatePath: certificatePath.trim() } : {}),
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
    username,
    jumpChain,
    connAuth,
    certificatePath
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
      view === 'inspect-report' ||
      view === 'home' ||
      view === 'alert-workbench' ||
      view === 'audit' ||
      view === 'playbook-list' ||
      view === 'playbook-edit' ||
      view === 'playbook-run' ||
      view === 'playbook-result' ||
      view === 'sync-settings' ||
      view === 'sync-conflicts' ||
      view === 'recordings' ||
      view === 'recording-play' ||
      view === 'sync-preview' ||
      view === 'updates' ||
      view === 'import-preview' ||
      view === 'file-diff'
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
    const curTabs = tabsRef.current
    const idx = curTabs.findIndex((t) => t.tabId === tabId)
    const rest = curTabs.filter((t) => t.tabId !== tabId)
    const fallback = rest[Math.min(Math.max(idx, 0), Math.max(rest.length - 1, 0))]?.tabId ?? null
    setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
    setActiveTabId((cur) => (cur === tabId ? fallback : cur))
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
      ...(jumpChain.length ? { jumpChain, jumpHost: jump ?? hopToJump(jumpChain[0]!) } : {}),
      ...(connAuth ? { authMode: connAuth } : {}),
      ...(certificatePath.trim() ? { certificatePath: certificatePath.trim() } : {}),
      autoRecord: formAutoRecord,
      ...(forwards ? { forwards } : {}),
      protection
    }

    let nextProfiles: SavedSessionProfile[]
    if (editingSavedId) {
      const id = editingSavedId
      const prev = profiles.find((s) => s.id === id)
      const merged: SavedSessionProfile = { ...prev, ...base, id }
      const exists = profiles.some((s) => s.id === id)
      nextProfiles = exists ? profiles.map((s) => (s.id === id ? merged : s)) : [...profiles, merged]
    } else {
      const sameTarget = (s: SavedSessionProfile) => s.host === h && s.port === po && s.username === u
      const existing = profiles.find(sameTarget)
      const row: SavedSessionProfile = { ...existing, ...base, id: existing?.id ?? uuid() }
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
    protection,
    username,
    jumpChain,
    connAuth,
    certificatePath,
    formAutoRecord
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
    setProtection('normal')
    setJumpChain([])
    setConnAuth('password')
    setCertificatePath('')
    setFormAutoRecord(false)
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
    setProtection(effectiveLevel(profile))
    setJumpChain(chainFromProfile(profile))
    setConnAuth(profile.authMode ?? (profile.privateKeyPath ? 'key' : 'password'))
    setCertificatePath(profile.certificatePath ?? '')
    setFormAutoRecord(Boolean(profile.autoRecord))
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
    (link?: HostInventoryLink, scrollGuard = false) => {
      ensureMainVisible()
      setInventoryScroll(scrollGuard)
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
    (kind: 'monitor' | 'toolbox' | 'sftp' | 'forward' | 'batch', forSessionId?: string | null, preselect?: string[], attempt = 0, toolboxTab?: ServerToolsTab) => {
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
          window.setTimeout(() => openToolTabRef.current(kind, forSessionId, preselect, attempt + 1, toolboxTab), 150)
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
                  profileId: bound.profileId,
                  toolboxTab: toolboxTab ?? t.toolboxTab
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
          profileId: bound.profileId,
          toolboxTab
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

  const openHome = useCallback(() => {
    ensureMainVisible()
    const ex = tabsRef.current.find((t) => t.view === 'home')
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
        title: tg('l7.title'),
        connectOpts: PLACEHOLDER_CONNECT,
        status: 'connected',
        view: 'home'
      }
    ])
    setActiveTabId(tabId)
  }, [ensureMainVisible])
  const openHomeRef = useRef(openHome)
  openHomeRef.current = openHome

  const openWorkbench = useCallback((opts?: { alertId?: string; filter?: AlertFilter; explain?: boolean }) => {
    ensureMainVisible()
    const title = tg('l2.title')
    const ex = tabsRef.current.find((t) => t.view === 'alert-workbench')
    const nonce = Date.now()
    if (ex) {
      setTabs((prev) =>
        prev.map((t) =>
          t.tabId === ex.tabId
            ? {
                ...t,
                title,
                focusAlertId: opts?.alertId ?? t.focusAlertId,
                alertFilter: opts?.filter ?? t.alertFilter,
                alertNonce: opts ? nonce : t.alertNonce,
                explainOnOpen: opts?.explain ?? false
              }
            : t
        )
      )
      setActiveTabId(ex.tabId)
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
        view: 'alert-workbench',
        focusAlertId: opts?.alertId,
        alertFilter: opts?.filter,
        alertNonce: nonce,
        explainOnOpen: opts?.explain
      }
    ])
    setActiveTabId(tabId)
  }, [ensureMainVisible])
  const openWorkbenchRef = useRef(openWorkbench)
  openWorkbenchRef.current = openWorkbench

  const openAudit = useCallback((host?: string) => {
    ensureMainVisible()
    setAuditEvents(loadAudit())
    const title = host ? `${tg('l4.auditTitle')} · ${host}` : tg('l4.auditTitle')
    const ex = tabsRef.current.find((t) => t.view === 'audit')
    if (ex) {
      setTabs((prev) => prev.map((t) => (t.tabId === ex.tabId ? { ...t, title, auditHost: host } : t)))
      setActiveTabId(ex.tabId)
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
        view: 'audit',
        auditHost: host
      }
    ])
    setActiveTabId(tabId)
  }, [ensureMainVisible])

  const openM2 = useCallback((view: TabView, title: string, extra?: Partial<Tab>) => {
    ensureMainVisible()
    const ex = tabsRef.current.find(
      (t) =>
        t.view === view &&
        (extra?.playbookId ? t.playbookId === extra.playbookId : !t.playbookId || view === 'playbook-list' || view === 'playbook-result' || view === 'sync-settings' || view === 'sync-conflicts' || view === 'recordings' || view === 'sync-preview') &&
        (extra?.recordingFile ? t.recordingFile === extra.recordingFile : view !== 'recording-play')
    )
    if (ex && (view !== 'playbook-edit' || ex.playbookId === extra?.playbookId) && (view !== 'playbook-run' || ex.playbookId === extra?.playbookId)) {
      setTabs((prev) => prev.map((t) => (t.tabId === ex.tabId ? { ...t, title, ...extra } : t)))
      setActiveTabId(ex.tabId)
      return
    }
    const tabId = uuid()
    setTabs((prev) => [
      ...prev,
      { tabId, sessionId: '', title, connectOpts: PLACEHOLDER_CONNECT, status: 'connected', view, ...extra }
    ])
    setActiveTabId(tabId)
  }, [ensureMainVisible])

  const liveSessions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tabs) {
      if (t.profileId && t.sessionId && t.status === 'connected' && (!t.view || t.view === 'session')) map.set(t.profileId, t.sessionId)
    }
    return map
  }, [tabs])

  const setProfileProtection = useCallback((ids: string[], level: ProtectionLevel) => {
    const next = profilesRef.current.map((p) => (ids.includes(p.id) ? { ...p, protection: level } : p))
    void persistSessionState({ folders, profiles: next })
    for (const id of ids) {
      const p = profilesRef.current.find((x) => x.id === id)
      appendAudit({
        type: 'protection.change',
        host: p?.label || p?.host || id,
        profileId: id,
        source: 'user',
        outcome: 'allowed',
        detail: level
      })
    }
    setAuditEvents(loadAudit())
  }, [folders, persistSessionState])

  const profileForSession = useCallback((sessionId: string) => {
    const tab = tabsRef.current.find((t) => t.sessionId === sessionId && (!t.view || t.view === 'session'))
    if (!tab) return undefined
    return profilesRef.current.find((p) => p.id === tab.profileId) ?? profilesRef.current.find((p) => p.host === tab.connectOpts.host && p.username === tab.connectOpts.username)
  }, [])

  const guardForSession = useCallback((sessionId: string) => {
    const profile = profileForSession(sessionId)
    const level = effectiveLevel(profile)
    return {
      profile,
      level,
      elevated: isElevated(profile?.id, elevateMap),
      hostName: profile?.host || profile?.label || '',
      hostLabel: profile?.label || profile?.host || ''
    }
  }, [elevateMap, profileForSession])

  const refreshAlerts = useCallback((next: FiredAlert[]) => {
    saveAlertHistory(next)
    setAlertHistory(next)
    setActiveAlertIds(alertHostIds(next, breachingRef.current))
  }, [])

  const dismissAlert = useCallback((alert: FiredAlert) => {
    const prev = alertHistory
    refreshAlerts(ignoreAlert(prev, alert.id))
    showToast(tg('l7.dismissed'), { action: { label: tg('l7.undo'), run: () => refreshAlerts(prev) } })
  }, [alertHistory, refreshAlerts])

  const handleAlertDone = useCallback((alert: FiredAlert) => {
    refreshAlerts(markHandled(alertHistory, alert.id))
  }, [alertHistory, refreshAlerts])

  const muteAlerts = useCallback((ms = 60 * 60 * 1000) => {
    setAlertRules((prev) => {
      const next = { ...prev, mutedUntil: Date.now() + ms }
      saveAlertRules(next)
      showToast(tg('l2.mute1h'), {
        action: {
          label: tg('l7.undo'),
          run: () => {
            saveAlertRules(prev)
            setAlertRules(prev)
          }
        }
      })
      return next
    })
  }, [])

  const unmuteAlerts = useCallback(() => {
    setAlertRules((prev) => {
      const next = { ...prev, mutedUntil: null }
      saveAlertRules(next)
      return next
    })
  }, [])

  const elevateProfile = useCallback(async (p: SavedSessionProfile) => {
    const level = effectiveLevel(p)
    if (level === 'normal') return
    if (level === 'production') {
      const typed = await promptDialog({
        title: tg('l4.unlockTitle'),
        label: tg('l4.typeHost', { host: p.host }),
        validate: (v) => (hostNameMatches(v, [p.host, p.label]) ? null : tg('l4.hostMismatch'))
      })
      if (typed == null) return
    } else {
      const ok = await confirmDialog({ title: tg('l4.unlockTitle'), body: tg('l4.unlockReadonly'), confirmText: tg('l4.unlock') })
      if (!ok) return
    }
    const until = elevateUntil(p.id)
    const map = { ...loadElevate(), [p.id]: until }
    saveElevate(map)
    setElevateMap(map)
    showToast(tg('l4.unlocked'))
  }, [])

  const restoreProtection = useCallback((profileId: string) => {
    const map = { ...loadElevate() }
    delete map[profileId]
    saveElevate(map)
    setElevateMap(map)
    showToast(tg('l4.restored'))
  }, [])

  const buildAlertExplain = useCallback(async (alert: FiredAlert, includeLogs: boolean) => {
    const sid = alert.hostKey
    let snapshot: { cpuPercent?: number | null; memPercent?: number | null; disks?: Array<{ mount?: string; percent?: number }> } | null = null
    let journal = ''
    try {
      const snap = await window.aiss.workspace.resources(sid)
      snapshot = {
        cpuPercent: snap.cpuPercent,
        memPercent: snap.mem?.percent ?? null,
        disks: snap.disks?.map((d) => ({ mount: d.mount, percent: d.percent }))
      }
    } catch {
      snapshot = null
    }
    if (includeLogs) {
      try {
        const logs = await window.aiss.tools.logs(sid, { source: 'journal', lines: 80 })
        journal = logs.text
      } catch {
        journal = ''
      }
    }
    const text = buildAlertContext({
      host: alert.hostTitle,
      ruleId: alert.ruleId,
      value: alert.value,
      threshold: alert.threshold,
      snapshot,
      journal
    })
    if (loadBellPrefs().mirrorAi) {
      updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
      aiExplainSeqRef.current += 1
      setAiExplain({ id: aiExplainSeqRef.current, sessionId: sid, text, host: alert.hostTitle, kind: 'explainAlert' })
    }
    return text
  }, [updateLayout])

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
      const breaching = new Set<string>()
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
          newly.push(...fired)
          for (const r of alertRules.rules) {
            if (!r.enabled) continue
            const val = readings.find((x) => x.metric === r.id)?.value
            if (r.id === 'offline') continue
            if (val != null && val >= r.threshold) breaching.add(`${s.sessionId}:${r.id}`)
          }
        } catch {
          /* ignore single host */
        }
      }
      if (cancelled) return
      breachingRef.current = breaching
      setAlertHistory((prev) => {
        const ignored = new Set(prev.filter((a) => a.status === 'ignored').map((a) => `${a.hostKey}:${a.ruleId}`))
        const fresh = newly.filter((f) => !ignored.has(`${f.hostKey}:${f.ruleId}`))
        const merged = reconcileAlerts(fresh.length ? [...fresh, ...prev].slice(0, 200) : prev, breaching)
        saveAlertHistory(merged)
        setActiveAlertIds(alertHostIds(merged, breaching))
        return merged
      })
      const ignoredNow = new Set(loadAlertHistory().filter((a) => a.status === 'ignored').map((a) => `${a.hostKey}:${a.ruleId}`))
      const audible = newly.filter((f) => !muted && !ignoredNow.has(`${f.hostKey}:${f.ruleId}`))
      if (audible.length) {
        if (alertRules.notify.systemNotify && typeof Notification !== 'undefined') {
          try {
            if (Notification.permission === 'granted') {
              const f = audible[0]!
              const note = new Notification(`⚠ ${f.hostTitle}`, {
                body: `${f.ruleId} ${Math.round(f.value)}${f.ruleId === 'offline' ? '' : '%'} · ${new Date(f.at).toLocaleTimeString()}`
              })
              note.onclick = () => {
                void window.aiss.app.focus().catch(() => undefined)
                window.dispatchEvent(new CustomEvent('aiss-alert-open', { detail: f }))
              }
            } else if (Notification.permission === 'default') {
              void Notification.requestPermission()
            }
          } catch { /* */ }
        }
        showToast(tg('o2.fired', { n: audible.length }), {
          kind: 'error',
          action: { label: tg('l2.work'), run: () => openWorkbenchRef.current({ alertId: audible[0]!.id }) }
        })
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
          (await openSession(connectOptsFromProfile(profile), { profileId: profile.id, hostInventoryId: profile.hostInventoryId })) || undefined
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
      return openSession(connectOptsFromProfile(p), { profileId: p.id, hostInventoryId: p.hostInventoryId })
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
  // Home / workbench / audit titles are captured once. Refresh them when the UI language loads or changes.
  useEffect(() => {
    setTabs((prev) => {
      let changed = false
      const next = prev.map((t) => {
        const title =
          t.view === 'home'
            ? tr('l7.title')
            : t.view === 'alert-workbench'
              ? tr('l2.title')
              : t.view === 'audit'
                ? t.auditHost
                  ? `${tr('l4.auditTitle')} · ${t.auditHost}`
                  : tr('l4.auditTitle')
                : null
        if (!title || title === t.title) return t
        changed = true
        return { ...t, title }
      })
      return changed ? next : prev
    })
  }, [locale, tr])
  const bootedRef = useRef(false)
  useEffect(() => {
    if (!sessionsReady || bootedRef.current) return
    bootedRef.current = true
    const mode = loadStartupMode()
    if (mode === 'blank') return
    if (mode === 'last') {
      const ids = loadLastWorkspace().profileIds
      const rows = ids
        .map((id) => profilesRef.current.find((p) => p.id === id))
        .filter((p): p is SavedSessionProfile => Boolean(p))
      if (!rows.length) openHomeRef.current()
      else for (const p of rows) openOrFocusProfile(p)
      return
    }
    openHomeRef.current()
  }, [sessionsReady, openOrFocusProfile])
  useEffect(() => {
    if (!sessionsReady) return
    const ids = [...new Set(tabs.filter((t) => (!t.view || t.view === 'session') && t.profileId).map((t) => t.profileId!))]
    if (ids.length) saveLastWorkspace({ profileIds: ids })
  }, [tabs, sessionsReady])
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

  const openImportPreview = useCallback(
    (model: ImportPreviewModel) => {
      setImportPreview(model)
      ensureMainVisible()
      const existing = tabsRef.current.find((t) => t.view === 'import-preview')
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
          title: tg('n2.title'),
          connectOpts: PLACEHOLDER_CONNECT,
          status: 'connected',
          view: 'import-preview'
        }
      ])
      setActiveTabId(tabId)
    },
    [ensureMainVisible]
  )

  const importSessionsPick = useCallback(async () => {
    setError(null)
    setSideInfo(null)
    try {
      const res = await window.aiss.sessions.importPick()
      if (!res) return
      const model = buildImportPreview(res.items, profiles, res.notes)
      if (!model.rows.length) {
        setSideInfo(model.notes.join(' ') || tg('n2.empty'))
        return
      }
      openImportPreview(model)
    } catch (e) {
      setError(friendlyErrorMessage(e))
    }
  }, [openImportPreview, profiles])

  const applyImport = useCallback(
    (policy: ImportPolicy) => {
      if (!importPreview) return
      const applied = applyImportPolicy({
        model: importPreview,
        policy,
        profiles,
        folders,
        newId: uuid
      })
      void persistSessionState({ folders: applied.folders, profiles: applied.profiles })
      setSideInfo([tg('n2.added', { n: applied.added }), tg('n2.updated', { n: applied.updated }), tg('n2.skipped', { n: applied.skipped })].join(' · '))
      setImportPreview(null)
      setTabs((prev) => prev.filter((t) => t.view !== 'import-preview'))
    },
    [folders, importPreview, persistSessionState, profiles]
  )

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
        pendingLocateRef.current = null
        setHostPicker({ action, feature: featureLabel(action, locale) })
        return
      }
      if (action === 'tour') {
        setTourOpen(true)
        return
      }
      if (action === 'taskCards') {
        const next = reopenTasks()
        setTaskState(next)
        setTasksOpen(true)
        return
      }
      if (action === 'sftpComfort') {
        const next = sftpComfort ? 'auto' : 'comfort'
        saveSftpDensity(next)
        setSftpComfort(next === 'comfort')
        window.dispatchEvent(new CustomEvent(SFTP_DENSITY_EVENT))
        return
      }
      if (action === 'updateChannel') {
        openSettingsTab('updates')
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
      if (action === 'opsHome') {
        openHome()
        return
      }
      if (action === 'alertWorkbench') {
        openWorkbench()
        return
      }
      if (action === 'auditLog') {
        openAudit()
        return
      }
      if (action === 'playbooks') {
        openM2('playbook-list', tg('m2.playbooks'))
        return
      }
      if (action === 'runPlaybook') {
        const books = loadPlaybooks()
        if (!books.length) {
          showToast(tg('m2.noPlaybooks'))
          return
        }
        const latest = books.reduce((a, b) => ((b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a))
        openM2('playbook-run', tg('m2.run'), { playbookId: latest.id })
        return
      }
      if (action === 'cloudSync') {
        openM2('sync-settings', tg('m2.cloudSync'))
        return
      }
      if (action === 'syncNow') {
        void (async () => {
          const cfg = await window.aiss.sync.getConfig()
          if (!syncIsConfigured(cfg)) {
            showToast(tg('m2.syncNeedSetup'))
            return
          }
          const snippets = await window.aiss.snippets.list().catch(() => [])
          await runCloudSync(profilesRef.current, snippets, () => openM2('sync-conflicts', tg('m2.conflicts')))
        })()
        return
      }
      if (action === 'sessionRecordings') {
        openM2('recordings', tg('m2.recordings'))
        return
      }
      if (action === 'toggleBlocks') {
        setBlocksOn(turnBlocks(!blocksEnabled()))
        return
      }
      if (action === 'startupSettings') {
        setStartupOpen(true)
        return
      }
      if (action === 'alertRules') {
        setAlertModalTab('rules')
        setAlertModalOpen(true)
        return
      }
      if (action === 'alertHistory') {
        if (bellPrefs.mode === 'drawer') {
          setAlertModalTab('history')
          setAlertModalOpen(true)
        } else openWorkbench({ filter: 'all' })
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
      sftpComfort,
      reconnectTab,
      openSession,
      openHome,
      openWorkbench,
      openAudit,
      openM2,
      bellPrefs.mode
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
        const tab = pendingLocateRef.current
        pendingLocateRef.current = null
        openToolTabRef.current('toolbox', sid, undefined, 0, tab && tab !== 'terminal' ? tab : undefined)
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
  const closeTour = useCallback(() => {
    setTourOpen(false)
    const state = loadTaskState()
    setTaskState(state)
    if (!state.dismissedForever) setTasksOpen(true)
  }, [])

  const locateAlert = useCallback((alert: FiredAlert) => {
    const target = locateTargetFor(alert.ruleId)
    const live = tabsRef.current.find(
      (t) => t.sessionId === alert.hostKey && t.status === 'connected' && (!t.view || t.view === 'session')
    )
    if (live) {
      if (target.kind === 'toolbox') openToolTabRef.current('toolbox', live.sessionId, undefined, 0, target.tab)
      else setActiveTabId(live.tabId)
      const targetLabel =
        target.kind === 'toolbox'
          ? tg(target.tab === 'df' ? 'st.tab.df' : target.tab === 'processes' ? 'st.tab.processes' : 'st.tab.services')
          : tg('l2.openTerminal')
      showToast(tg('l2.opened', { target: `${targetLabel} · ${alert.hostTitle}` }))
      return
    }
    pendingLocateRef.current = target.kind === 'toolbox' ? target.tab : 'terminal'
    setHostPicker({ action: 'serverTools', feature: featureLabel('serverTools', locale) })
  }, [locale])

  const interpretAlert = useCallback(async (alert: FiredAlert) => {
    const ready = await aiHasKey()
    if (!ready) {
      flashAiConfig('alert')
      return
    }
    const sid = alert.hostKey
    let snapshot: { cpuPercent?: number | null; memPercent?: number | null; disks?: Array<{ mount?: string; percent?: number }> } | null = null
    let journal = ''
    try {
      const snap = await window.aiss.workspace.resources(sid)
      snapshot = {
        cpuPercent: snap.cpuPercent,
        memPercent: snap.mem?.percent ?? null,
        disks: snap.disks?.map((d) => ({ mount: d.mount, percent: d.percent }))
      }
    } catch {
      snapshot = null
    }
    try {
      const logs = await window.aiss.tools.logs(sid, { source: 'journal', lines: 80 })
      journal = logs.text
    } catch {
      journal = ''
    }
    const text = buildAlertContext({
      host: alert.hostTitle,
      ruleId: alert.ruleId,
      value: alert.value,
      threshold: alert.threshold,
      snapshot,
      journal
    })
    updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
    aiExplainSeqRef.current += 1
    setAiExplain({
      id: aiExplainSeqRef.current,
      sessionId: sid,
      text,
      host: alert.hostTitle,
      kind: 'explainAlert'
    })
  }, [updateLayout])

  useEffect(() => {
    const onLocate = (e: Event) => {
      const alert = (e as CustomEvent<FiredAlert>).detail
      if (alert?.hostKey) locateAlert(alert)
    }
    const onOpen = (e: Event) => {
      const alert = (e as CustomEvent<FiredAlert>).detail
      if (!alert?.id) return
      openWorkbenchRef.current({ alertId: alert.id })
      if (loadBellPrefs().autoLocate) locateAlert(alert)
    }
    window.addEventListener('aiss-alert-locate', onLocate)
    window.addEventListener('aiss-alert-open', onOpen)
    return () => {
      window.removeEventListener('aiss-alert-locate', onLocate)
      window.removeEventListener('aiss-alert-open', onOpen)
    }
  }, [locateAlert])

  const markTask = useCallback((id: TaskId) => {
    setTaskState((prev) => {
      if (prev.done[id]) return prev
      return completeTask(id)
    })
  }, [])

  useEffect(() => {
    const own = tabs.some(
      (t) =>
        (!t.view || t.view === 'session') &&
        t.kind !== 'local' &&
        t.status === 'connected' &&
        t.sessionId &&
        t.connectOpts.host !== DEMO_HOST &&
        !profiles.find((p) => p.id === t.profileId)?.demo
    )
    if (own) markTask('connect')
    if (tabs.some((t) => t.view === 'monitor')) markTask('monitor')
  }, [tabs, profiles, markTask])

  useEffect(() => {
    if (aiConfigured) markTask('ai')
  }, [aiConfigured, markTask])

  useEffect(() => {
    const onTransfer = () => markTask('transfer')
    window.addEventListener('aiss-task-transfer', onTransfer)
    return () => window.removeEventListener('aiss-task-transfer', onTransfer)
  }, [markTask])

  const openFileCompare = useCallback(
    async (info: { sessionId: string; localPath: string; remotePath: string; localName: string; remoteName: string; localSize: number; remoteSize: number }) => {
      ensureMainVisible()
      const tooLarge = info.localSize > COMPARE_BYTE_LIMIT || info.remoteSize > COMPARE_BYTE_LIMIT
      let leftText = ''
      let rightText = ''
      let large = tooLarge
      if (!tooLarge) {
        try {
          const [local, remote] = await Promise.all([
            window.aiss.localFs.readText(info.localPath, COMPARE_BYTE_LIMIT),
            window.aiss.sftp.readText(info.sessionId, info.remotePath, COMPARE_BYTE_LIMIT)
          ])
          leftText = local.content
          rightText = remote.content
          large = local.truncated || remote.truncated
        } catch (e) {
          showToast(friendlyErrorMessage(e), { kind: 'error' })
          return
        }
      }
      const fileCompare = {
        leftName: info.localName,
        rightName: info.remoteName,
        leftText,
        rightText,
        tooLarge: large,
        remotePath: info.remotePath,
        sessionId: info.sessionId
      }
      const tabId = uuid()
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title: `${tg('d5.title')} · ${info.remoteName}`.slice(0, 28),
          connectOpts: PLACEHOLDER_CONNECT,
          status: 'connected',
          view: 'file-diff',
          boundSessionId: info.sessionId,
          remotePath: info.remotePath,
          fileCompare
        }
      ])
      setActiveTabId(tabId)
    },
    [ensureMainVisible]
  )
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
          toggleBlocks: blocksOn,
          smartComplete: smartOn,
          sftpComfort
        }}
        disabled={{
          syncNow: !syncReady,
          runPlaybook: !hasPlaybooks
        }}
        hints={{
          syncNow: syncReady ? undefined : tg('m2.syncNeedSetup'),
          runPlaybook: hasPlaybooks ? undefined : tg('m2.noPlaybooks')
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
                      { label: tr('g1.try'), onClick: () => void addDemoHost(true), testId: 'empty-try-demo' },
                      { label: tr('l7.title'), onClick: () => openHome() }
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
            <button
              type="button"
              className={`alert-bell${alertRules.mutedUntil && alertRules.mutedUntil > Date.now() ? ' is-muted' : ''}`}
              data-testid="alert-bell"
              title={tg('l2.bellOpens')}
              onClick={() => {
                if (bellPrefs.mode === 'drawer') {
                  setAlertModalTab('history')
                  setAlertModalOpen(true)
                } else {
                  const first = alertHistory.find((a) => a.status === 'active')
                  openWorkbench(first ? { alertId: first.id } : undefined)
                }
              }}
            >
              {alertRules.mutedUntil && alertRules.mutedUntil > Date.now() ? '⊘' : '🔔'}
              {activeCount(alertHistory) > 0 ? <span className="alert-bell-count">{activeCount(alertHistory)}</span> : null}
            </button>
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
              const guardLevel = isSession ? effectiveLevel(profiles.find((p) => p.id === t.profileId)) : 'normal'
              const guardClass = guardLevel === 'production' ? 'tab-guard-prod' : guardLevel === 'readonly' ? 'tab-guard-ro' : ''
              return (
              <button
                key={t.tabId}
                type="button"
                title={guardLevel === 'normal' ? undefined : tg(guardLevel === 'production' ? 'l4.bannerProd' : 'l4.bannerRo')}
                className={`tab tab-kind-${t.view || 'session'} ${guardClass} ${t.tabId === activeTabId ? 'active' : ''} ${isSession && t.status === 'disconnected' ? 'tab--disconnected' : ''} ${isSession && t.status === 'connecting' ? 'tab--connecting' : ''} ${t.view && WORKSPACE_TAB_VIEWS.has(t.view) ? 'tab--workspace' : ''}`}
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
                      : t.view === 'home'
                        ? tr('l7.title')
                        : t.view === 'alert-workbench'
                          ? tr('l2.title')
                          : t.view === 'audit'
                            ? t.auditHost
                              ? `${tr('l4.auditTitle')} · ${t.auditHost}`
                              : tr('l4.auditTitle')
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
              sendGuard={(() => {
                const g = guardForSession(activeTab.sessionId)
                return { level: g.level, hostName: g.hostName || activeTab.connectOpts.host, elevated: g.elevated, profileId: g.profile?.id }
              })()}
              beforeSend={async (command, dangerous) => {
                const g = guardForSession(activeTab.sessionId)
                const risk = assessCommandRisk(command)
                return runGuardedCommand({
                  level: g.level,
                  hostName: g.hostName || activeTab.connectOpts.host,
                  hostLabel: g.hostLabel || activeTab.title,
                  elevated: g.elevated,
                  profileId: g.profile?.id,
                  channel: 'command',
                  dangerous,
                  dangerReason: risk ? tg(risk.reasonKey) : undefined,
                  command,
                  source: 'user'
                })
              }}
            />
          ) : null}

          <div className="terminal-stack">
            {activeIsSession && activeTab?.sessionId && activeTab.profileId
              ? (() => {
                  const g = guardForSession(activeTab.sessionId)
                  if (g.level === 'normal') return null
                  const pid = g.profile?.id
                  if (pid && guardCollapsed[pid] && !g.elevated) return null
                  const until = pid ? elevateMap[pid] : undefined
                  const paused = Boolean(until && until > Date.now())
                  const left = paused && until ? Math.max(0, until - Date.now()) : 0
                  const mm = String(Math.floor(left / 60000)).padStart(2, '0')
                  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
                  return (
                    <div
                      className={`term-guard-banner${paused ? ' is-paused' : g.level === 'readonly' ? ' is-ro' : ' is-prod'}`}
                      data-testid="term-guard-banner"
                      title={paused ? tg('l4.bannerPaused', { time: `${mm}:${ss}` }) : g.level === 'readonly' ? tg('l4.bannerRo') : tg('l4.bannerProd')}
                    >
                      <span>{paused ? tg('l4.bannerPaused', { time: `${mm}:${ss}` }) : g.level === 'readonly' ? tg('l4.bannerRo') : tg('l4.bannerProd')}</span>
                      {paused && pid ? (
                        <button type="button" onClick={() => restoreProtection(pid)}>
                          {tg('l4.restore')}
                        </button>
                      ) : (
                        <button type="button" className="banner-unlock" title={tg('l4.unlock')} onClick={() => g.profile && void elevateProfile(g.profile)}>
                          <span className="banner-lbl">{tg('l4.unlock')}</span>
                        </button>
                      )}
                      {pid ? (
                        <button type="button" aria-label={tg('l4.collapse')} onClick={() => setGuardCollapsed((m) => ({ ...m, [pid]: true }))}>
                          ×
                        </button>
                      ) : null}
                    </div>
                  )
                })()
              : null}
            {tasksOpen ? (
              <RetentionTasks
                state={taskState}
                onGo={(id) => {
                  if (id === 'connect') openConnectionEditor()
                  else if (id === 'monitor') handleTitlebarMenuAction('resourceMonitor')
                  else if (id === 'ai') openSettingsTab('ai')
                  else handleTitlebarMenuAction('sftp')
                }}
                onDismiss={(id) => setTaskState(skipTask(id))}
                onDismissAll={() => {
                  setTaskState(dismissTasksForever())
                  setTasksOpen(false)
                }}
              />
            ) : null}
            {tabs.length === 0 ? (
              <EmptyState
                testId="terminal-empty"
                icon="⌨"
                title={startupMode === 'blank' ? tr('l7.blankTitle') : tr('ux08.termTitle')}
                desc={startupMode === 'blank' ? tr('l7.blankDesc') : tr('ux08.termDesc')}
                primary={{ label: tr('l7.title'), onClick: () => openHome(), avoid: true }}
                secondary={[{ label: tr('ux08.newConnection'), onClick: () => openConnectionEditor() }, { label: tr('ux08.palette'), onClick: () => setPaletteOpen(true) }]}
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
                    protection={protection}
                    setProtection={setProtection}
                    authModeExternal={connAuth}
                    setAuthModeExternal={setConnAuth}
                    certificatePath={certificatePath}
                    setCertificatePath={setCertificatePath}
                    autoRecord={formAutoRecord}
                    setAutoRecord={setFormAutoRecord}
                    jumpChain={jumpChain}
                    setJumpChain={setJumpChain}
                    profiles={profiles}
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
                    protectionLevel={effectiveLevel(profiles.find((p) => p.id === inventoryLink?.profileId))}
                    auditOn={auditOn}
                    suggestProd={wantsProductionHint(profiles.find((p) => p.id === inventoryLink?.profileId))}
                    scrollToGuard={inventoryScroll}
                    onProtectionChange={(level) => {
                      const id = inventoryLink?.profileId
                      if (id) setProfileProtection([id], level)
                    }}
                    onAuditChange={(on) => {
                      setAuditEnabled(on)
                      setAuditOn(on)
                    }}
                    onOpenAudit={() => openAudit(inventoryLink?.host || inventoryLink?.label)}
                    onElevate={() => {
                      const p = profiles.find((x) => x.id === inventoryLink?.profileId)
                      if (p) void elevateProfile(p)
                    }}
                    autoRecord={Boolean(profiles.find((p) => p.id === inventoryLink?.profileId)?.autoRecord)}
                    onAutoRecord={(on) => {
                      const id = inventoryLink?.profileId
                      if (!id) return
                      const next = profiles.map((p) => (p.id === id ? { ...p, autoRecord: on } : p))
                      void persistSessionState({ folders, profiles: next })
                    }}
                    onRecordings={() => openM2('recordings', tg('m2.recordings'))}
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
                    initialTab={t.toolboxTab}
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
                ) : t.view === 'home' ? (
                  <OpsHomeTab
                    hosts={homeHosts}
                    alerts={alertHistory}
                    mutedUntil={alertRules.mutedUntil}
                    scope={dashScope}
                    folders={folders}
                    activeCount={activeCount(alertHistory)}
                    taskDone={TASK_IDS.length - pendingTasks(taskState).length}
                    taskTotal={TASK_IDS.length}
                    showTasks={!taskState.dismissedForever && pendingTasks(taskState).length > 0}
                    onScope={(s) => {
                      saveDashScope(s)
                      setDashScope(s)
                    }}
                    onNewConnection={() => openConnectionEditor()}
                    onOpenDashboard={() => openDashboard()}
                    onOpenWorkbench={(alertId) => openWorkbench(alertId ? { alertId, explain: false } : undefined)}
                    onOpenMonitor={(host) => {
                      if (host.sessionId) openToolTabRef.current('monitor', host.sessionId)
                      else {
                        const p = profiles.find((x) => x.id === host.profileId)
                        if (p) void monitorProfile(p)
                      }
                    }}
                    onConnect={(host) => {
                      const p = profiles.find((x) => x.id === host.profileId)
                      if (p) openOrFocusProfile(p)
                    }}
                    onLocate={(alert) => locateAlert(alert)}
                    onExplain={(alert) => openWorkbench({ alertId: alert.id, explain: true })}
                    onDismiss={dismissAlert}
                    onUnmute={unmuteAlerts}
                    onRules={() => {
                      setAlertModalTab('rules')
                      setAlertModalOpen(true)
                    }}
                    onInspect={() => setInspectOpen(true)}
                    onStartup={() => setStartupOpen(true)}
                    onImport={() => void importSessionsPick()}
                    onDemo={() => void addDemoHost(true)}
                    onTour={() => setTourOpen(true)}
                    onTasks={() => setTasksOpen(true)}
                    onGuard={(profileId) => {
                      const p = profiles.find((x) => x.id === profileId)
                      if (!p) return
                      openInventoryEditor({
                        profileId: p.id,
                        host: p.host,
                        port: p.port,
                        username: p.username,
                        label: p.label,
                        hostInventoryId: p.hostInventoryId
                      }, true)
                    }}
                    onCheckUpdate={() => handleTitlebarMenuAction('checkUpdate')}
                    onPlaybook={() => openM2('playbook-list', tg('m2.playbooks'))}
                    onRestoreSync={() => openM2('sync-settings', tg('m2.cloudSync'))}
                    recentPlaybooks={loadPlaybooks().slice(0, 3).map((p) => ({ id: p.id, name: p.name }))}
                    onOpenRecent={(id) => openM2('playbook-run', tg('m2.run'), { playbookId: id })}
                  />
                ) : t.view === 'alert-workbench' ? (
                  <AlertWorkbenchTab
                    alerts={alertHistory}
                    focusId={t.focusAlertId}
                    focusNonce={t.alertNonce}
                    initialFilter={t.alertFilter}
                    autoExplain={t.explainOnOpen}
                    mutedUntil={alertRules.mutedUntil}
                    onlineIds={onlineSessionIds}
                    aiConfigured={aiConfigured}
                    prefs={bellPrefs}
                    onPrefs={(p) => {
                      saveBellPrefs(p)
                      setBellPrefs(p)
                    }}
                    onRules={() => {
                      setAlertModalTab('rules')
                      setAlertModalOpen(true)
                    }}
                    onMute={() => muteAlerts()}
                    onUnmute={unmuteAlerts}
                    onDismiss={dismissAlert}
                    onHandled={handleAlertDone}
                    onLocate={(alert) => locateAlert(alert)}
                    onOpenTerminal={(alert) => {
                      const live = tabs.find((x) => x.sessionId === alert.hostKey && (!x.view || x.view === 'session'))
                      if (live) setActiveTabId(live.tabId)
                      else locateAlert(alert)
                    }}
                    onOpenMonitor={(alert) => openToolTabRef.current('monitor', alert.hostKey)}
                    onOpenToolbox={(alert) => openToolTabRef.current('toolbox', alert.hostKey)}
                    onOpenDashboard={() => openDashboard()}
                    onInsert={(sid, command) => {
                      const live = tabs.find((x) => x.sessionId === sid && (!x.view || x.view === 'session'))
                      if (live) setActiveTabId(live.tabId)
                      window.setTimeout(() => fillCommandBar(sid, command), 60)
                    }}
                    onRun={(alert, command) => {
                      const g = guardForSession(alert.hostKey)
                      void confirmAndRunAiCommand({
                        sessionId: alert.hostKey,
                        command,
                        host: alert.hostTitle,
                        protection: {
                          level: g.level,
                          hostName: g.hostName || alert.hostTitle,
                          elevated: g.elevated,
                          profileId: g.profile?.id,
                          channel: 'alert'
                        }
                      })
                    }}
                    buildContext={buildAlertExplain}
                    onOpenSettings={() => openSettingsTab('ai')}
                  />
                ) : t.view === 'playbook-list' ? (
                  <PlaybookList
                    profiles={profiles}
                    onEdit={(id) => openM2('playbook-edit', tg('m2.edit'), { playbookId: id })}
                    onRun={(id) => openM2('playbook-run', tg('m2.run'), { playbookId: id })}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'playbook-edit' && t.playbookId ? (
                  <PlaybookEditor
                    playbookId={t.playbookId}
                    onRun={(id) => openM2('playbook-run', tg('m2.run'), { playbookId: id })}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'playbook-run' && t.playbookId ? (
                  <PlaybookRun
                    playbookId={t.playbookId}
                    profiles={profiles}
                    live={liveSessions}
                    onResult={() => openM2('playbook-result', tg('m2.playbooks'))}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'playbook-result' ? (
                  <PlaybookResult onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'sync-settings' ? (
                  <SyncSettings
                    profiles={profiles}
                    snippets={[]}
                    onConflicts={() => openM2('sync-conflicts', tg('m2.conflicts'))}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'sync-conflicts' ? (
                  <SyncConflicts onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'recordings' ? (
                  <RecordingsList
                    onOpen={(file) => openM2('recording-play', tg('m2.play'), { recordingFile: file })}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'recording-play' && t.recordingFile ? (
                  <RecordingPlayer file={t.recordingFile} onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'sync-preview' && t.syncPlan ? (
                  <SyncPreviewTab
                    plan={t.syncPlan}
                    onStart={(plan) => {
                      const sid = plan.sessionId || t.boundSessionId
                      void runFolderSyncDurable({ ...plan, sessionId: sid }, async () => {
                        if (!sid) return false
                        const g = guardForSession(sid)
                        return runGuardedCommand({
                          level: g.level,
                          hostName: g.hostName || t.connectOpts.host,
                          hostLabel: g.hostLabel,
                          elevated: g.elevated,
                          profileId: g.profile?.id,
                          channel: 'sftp',
                          dangerous: false,
                          command: 'folder-sync',
                          source: 'user'
                        })
                      })
                    }}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'audit' ? (
                  <AuditLogPanel
                    events={auditEvents}
                    host={t.auditHost}
                    enabled={auditOn}
                    onToggle={(on) => {
                      setAuditEnabled(on)
                      setAuditOn(on)
                    }}
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
                    alerts={alertHistory}
                    onLocate={(alert) => locateAlert(alert)}
                    onInterpret={(alert) => void interpretAlert(alert)}
                    onOpenWorkbench={(alert) => openWorkbench({ alertId: alert.id })}
                    visibleSession={(sid) => {
                      const s = connectedSshSessions.find((x) => x.sessionId === sid)
                      if (!s?.profileId) return dashScope.mode === 'all'
                      return hostInScope(dashScope, { profileId: s.profileId, folderId: s.folderId })
                    }}
                    scopeSlot={
                      <ScopePicker
                        scope={dashScope}
                        folders={folders}
                        onChange={(s) => {
                          saveDashScope(s)
                          setDashScope(s)
                        }}
                      />
                    }
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
                    onCompare={(info) => {
                      if (!t.boundSessionId) return
                      void openFileCompare({ ...info, sessionId: t.boundSessionId })
                    }}
                    remoteWritesBlocked={(() => {
                      if (!t.boundSessionId) return false
                      const g = guardForSession(t.boundSessionId)
                      return g.level === 'readonly' && !g.elevated
                    })()}
                    onPinPreview={(plan) =>
                      openM2('sync-preview', tg('m2.syncPreview'), { syncPlan: { ...plan, sessionId: t.boundSessionId }, boundSessionId: t.boundSessionId })
                    }
                    beforeRemoteWrite={async () => {
                      if (!t.boundSessionId) return false
                      const g = guardForSession(t.boundSessionId)
                      return runGuardedCommand({
                        level: g.level,
                        hostName: g.hostName || t.connectOpts.host,
                        hostLabel: g.hostLabel,
                        elevated: g.elevated,
                        profileId: g.profile?.id,
                        channel: 'sftp',
                        dangerous: false,
                        command: 'sftp-write',
                        source: 'user'
                      })
                    }}
                  />
                ) : t.view === 'remote-file' && t.boundSessionId && t.remotePath ? (
                  <RemoteTextEditor
                    key={`${t.boundSessionId}:${t.remotePath}`}
                    tabId={t.tabId}
                    sessionId={t.boundSessionId}
                    remotePath={t.remotePath}
                    remoteWritesBlocked={(() => {
                      const g = guardForSession(t.boundSessionId)
                      return g.level === 'readonly' && !g.elevated
                    })()}
                    beforeRemoteWrite={async () => {
                      if (!t.boundSessionId) return false
                      const g = guardForSession(t.boundSessionId)
                      return runGuardedCommand({
                        level: g.level,
                        hostName: g.hostName || t.connectOpts.host,
                        hostLabel: g.hostLabel,
                        elevated: g.elevated,
                        profileId: g.profile?.id,
                        channel: 'sftp',
                        dangerous: false,
                        command: 'remote-edit',
                        source: 'user'
                      })
                    }}
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
                ) : t.view === 'updates' ? (
                  <UpdateChannelPanel onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'import-preview' && importPreview ? (
                  <ImportPreviewPanel
                    model={importPreview}
                    onClose={() => {
                      setImportPreview(null)
                      closeTab(t.tabId, t.sessionId, t.status, t.view)
                    }}
                    onApply={applyImport}
                  />
                ) : t.view === 'file-diff' && t.fileCompare ? (
                  <FileDiffView
                    leftName={t.fileCompare.leftName}
                    rightName={t.fileCompare.rightName}
                    leftText={t.fileCompare.leftText}
                    rightText={t.fileCompare.rightText}
                    tooLarge={t.fileCompare.tooLarge}
                    onOpenRemote={
                      t.fileCompare.sessionId && t.fileCompare.remotePath
                        ? () =>
                            openRemoteFileEditor({
                              sessionId: t.fileCompare!.sessionId!,
                              remotePath: t.fileCompare!.remotePath!,
                              name: t.fileCompare!.rightName,
                              connectOpts: t.connectOpts
                            })
                        : undefined
                    }
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
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
                      inputBlocked={(() => {
                        const g = guardForSession(t.sessionId)
                        return g.level === 'readonly' && !g.elevated
                      })()}
                      onInputBlocked={() => showToast(tg('l4.readonlyBlocked'))}
                      onSecondaryChange={setSplitSecondary}
                      peers={connectedSshSessions
                        .filter((x) => x.sessionId !== t.sessionId)
                        .map((x) => ({ sessionId: x.sessionId, title: x.title }))}
                    />
                  ) : (
                    <>
                    <TerminalPane
                      sessionId={t.sessionId}
                      active={t.tabId === activeTabId}
                      prefs={terminalPrefs}
                      hostKey={sessionHostKey(t)}
                      inputBlocked={(() => {
                        const g = guardForSession(t.sessionId)
                        return g.level === 'readonly' && !g.elevated
                      })()}
                      onInputBlocked={() => showToast(tg('l4.readonlyBlocked'))}
                      onUserData={
                        broadcastEnabled && broadcastSessions.length > 1
                          ? (data) => {
                              for (const sid of broadcastSessions) void window.aiss.ssh.write(sid, data)
                            }
                          : undefined
                      }
                    />
                    <TerminalBlocks sessionId={t.sessionId} />
                    </>
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
                  const g = guardForSession(sid)
                  window.setTimeout(() => void confirmAndRunAiCommand({
                    sessionId: sid,
                    command,
                    host: aiExplain.host,
                    protection: {
                      level: g.level,
                      hostName: g.hostName || aiExplain.host || '',
                      elevated: g.elevated,
                      profileId: g.profile?.id,
                      channel: aiExplain.kind === 'explainAlert' ? 'alert' : 'command'
                    }
                  }), 60)
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
      {jumpFail ? (
        <div className="sync-status" data-testid="jump-fail">
          <span>{tg('m2.jumpFail', { hop: jumpFail.hop, total: jumpFail.total, name: jumpFail.name })}</span>
          <button
            type="button"
            onClick={() => {
              const p = profiles.find((x) => x.id === jumpFail.profileId)
              if (p) openConnectionEditor(p)
            }}
          >
            {tg('ctx.edit')}
          </button>
        </div>
      ) : null}
      {syncMeta.enabled ? (
        <button type="button" className="sync-status" data-testid="sync-status" onClick={() => openM2(syncMeta.phase === 'conflict' ? 'sync-conflicts' : 'sync-settings', tg('m2.cloudSync'))}>
          <span className="sync-cloud" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path fill="currentColor" d="M12.5 13H4.2A3.2 3.2 0 0 1 4 6.6 4 4 0 0 1 11.7 5.2 2.8 2.8 0 0 1 12.5 13z" />
            </svg>
          </span>
          <span>{statusGlyph(syncMeta.phase) || '✓'}</span>
          <span>{tg(syncPhaseKey(syncMeta.phase))}</span>
        </button>
      ) : null}

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
      <StartupSettingsModal
        open={startupOpen}
        value={startupMode}
        onChange={(mode) => {
          saveStartupMode(mode)
          setStartupMode(mode)
        }}
        onClose={() => setStartupOpen(false)}
      />
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
      <AlertRulesModal
        open={alertModalOpen}
        initial={alertRules}
        history={alertHistory}
        initialTab={alertModalTab}
        onClose={() => setAlertModalOpen(false)}
        onSave={(next) => {
          setAlertRules(next)
          saveAlertRules(next)
        }}
        onClearHistory={() => {
          setAlertHistory([])
          saveAlertHistory([])
          setActiveAlertIds(new Set())
        }}
        onMute1h={() => {
          const next = { ...alertRules, mutedUntil: Date.now() + 60 * 60 * 1000 }
          setAlertRules(next)
          saveAlertRules(next)
          showToast(tg('o2.mute1h'))
        }}
        onLocate={(alert) => {
          setAlertModalOpen(false)
          locateAlert(alert)
        }}
        onInterpret={(alert) => {
          setAlertModalOpen(false)
          void interpretAlert(alert)
        }}
        onIgnore={(alert) => {
          setAlertHistory((prev) => {
            const next = ignoreAlert(prev, alert.id)
            saveAlertHistory(next)
            setActiveAlertIds((ids) => {
              const still = next.some((x) => x.hostKey === alert.hostKey && x.status === 'active')
              if (still) return ids
              const copy = new Set(ids)
              copy.delete(alert.hostKey)
              return copy
            })
            return next
          })
        }}
      />
      <UpdateModal
        open={updateModalOpen && Boolean(updateInfo)}
        version={updateInfo?.version ?? ''}
        notes={updateInfo?.notes}
        sourceLabel={updateInfo?.source}
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
              <div className={`session-context-submenu-wrap${sessionMenu.x > window.innerWidth - 320 ? ' open-left' : ''}`}>
                <button type="button" role="menuitem" className="session-context-menu-item session-context-menu-item--submenu">
                  <span>{tg('l4.setLevel')}</span>
                  <span className="session-context-menu-caret" aria-hidden>›</span>
                </button>
                <div className="session-context-submenu" role="menu">
                  {(['normal', 'production', 'readonly'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="menuitem"
                      className="session-context-menu-item"
                      onClick={() => {
                        setSessionMenu(null)
                        setProfileProtection(multi, level)
                      }}
                    >
                      {tg(level === 'normal' ? 'l4.normal' : level === 'production' ? 'l4.production' : 'l4.readonly')}
                    </button>
                  ))}
                </div>
              </div>
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
            {item('guard', tg('l4.menu'), () => {
              openInventoryEditor({
                profileId: p.id,
                host: p.host,
                port: p.port,
                username: p.username,
                label: p.label,
                hostInventoryId: p.hostInventoryId
              }, true)
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
          <button
            type="button"
            role="menuitem"
            className="session-context-menu-item"
            onClick={() => {
              const folderId = folderMenu.folderId
              setFolderMenu(null)
              void askText(tg('m2.proxyJump'), '').then((text) => {
                if (!text?.trim()) return
                const parsed = parseProxyJump(text)
                if (!parsed.hops.length) return
                const hop = hopToJump(parsed.hops[0]!)
                const next = profilesRef.current.map((p) => (p.folderId === folderId ? { ...p, jumpChain: parsed.hops, jumpHost: hop } : p))
                void persistSessionState({ folders, profiles: next })
              })
            }}
          >
            {tg('m2.groupJump')}
          </button>
        </div>
      )}
    </div>
  )
}
