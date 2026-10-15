import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { moveById, normalizeTabTitle } from '@shared/workspace-features'
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
import { formatSftpTabTitle, planSftpOpen } from '@shared/sftp-host'
import { clearHostHistory, loadSmartPrefs, restoreSmartEntries, saveSmartPrefs, SMART_PREFS_EVENT } from './lib/smart-history'
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
import UpdateChannelPanel from './components/UpdateChannelPanel'
import ImportPreviewPanel from './components/ImportPreviewPanel'
import FileDiffView from './components/FileDiffView'
import MaintenanceTab from './components/MaintenanceTab'
import PostmortemAiTab from './components/PostmortemAiTab'
import FirstWeekChip from './components/FirstWeekChip'
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
import { friendlyError, friendlyErrorMessage, stripIpcPrefix } from './lib/friendly-error'
import { noticeHost, noticeKind, type NoticeKind } from '@shared/product-error'
import ErrorNotice from './components/ErrorNotice'
import ConnectTrouble from './components/ConnectTrouble'
import { placeMenu } from '@shared/menu-place'
import { hostMenuItems, tabMenuItems, type HostMenuCtx, type MenuEntry, type TabMenuCtx } from '@shared/inline-menus'
import { BuiltMenu } from './components/BuiltMenu'
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
import { closeControlTipKey } from '@shared/close-tab'
import { changelogFor } from '@shared/changelog'
import { tabLabel } from '@shared/tab-label'
import { HOST_PROBE_INTERVAL_MS, type HostProbeResult } from '@shared/host-status'
import BackupModal from './components/BackupModal'
import ServerToolsModal from './components/ServerToolsModal'
import RecentConnections from './components/RecentConnections'
import SessionCommandBar from './components/SessionCommandBar'
import EmptyState from './components/EmptyState'
import WelcomePanel from './components/WelcomePanel'
import Icon, { Twist } from './components/Icon'
import HostPicker from './components/HostPicker'
import WelcomeTour, { TOUR_DONE_KEY } from './components/WelcomeTour'
import AiAssistCard from './components/AiAssistCard'
import SelectionExplainCard from './components/SelectionExplainCard'
import {
  AI_EXPLAIN_EVENT,
  SELECTION_EXPLAIN_EVENT,
  aiHasKey,
  enterAiMode,
  fillCommandBar,
  flashAiConfig,
  lastErrorFor,
  lastErrorSessionId,
  requestAiExplain,
  requestSelectionExplain,
  type AiExplainDetail,
  type SelectionExplainDetail
} from './lib/ai-events'
import { currentTerminalSelection } from './lib/terminal-selection'
import { selectionRiskToAi } from '@shared/selection-explain'
import { confirmAndRunAiCommand } from './lib/ai-run'
import { runGuardedCommand } from './lib/protection-gate'
import OpsHomeTab, { type HomeHost } from './components/OpsHomeTab'
import AlertWorkbenchTab from './components/AlertWorkbenchTab'
import AuditLogPanel from './components/AuditLogPanel'
import AuditExportModal from './components/AuditExportModal'
import { PlaybookEditor, PlaybookList, PlaybookResult, PlaybookRun } from './components/PlaybookTabs'
import { PlaybookImportTab, stageShareImport } from './components/PlaybookShare'
import AlertRuleTemplatesTab from './components/AlertRuleTemplatesTab'
import GateTimelineTab from './components/GateTimelineTab'
import QuickStartWizard from './components/QuickStartWizard'
import FileHistoryTab from './components/FileHistoryTab'
import PostmortemTab from './components/PostmortemTab'
import { SyncConflicts, SyncSettings, useSyncPhase } from './components/SyncCenter'
import { RecordingPlayer, RecordingsList } from './components/RecordingsTab'
import TerminalBlocks, { turnBlocks } from './components/TerminalBlocks'
import SyncPreviewTab, { type SyncPreviewPlan } from './components/SyncPreviewTab'
import { blocksEnabled } from '@shared/terminal-blocks'
import { chainFromProfile, chainTooltip, hopToJump, parseHopFailure, parseProxyJump } from '@shared/jump-chain'
import { TAB_STRIP_NUDGE, disconnectedSessions, filterTabList, showTabSearch, tabOverflowMark, tabStripChrome, tabStripNudgePx, tabStripRevealDelta, tabStripWheelDelta } from '@shared/tab-overflow'
import { loadProbePrefs, probeExtrasOf, sanitizeProbeReason, saveProbePrefs, type ProbePrefs } from '@shared/health-probe'
import { bellShouldFlash, endingSoon, expireDue, formatRemaining, loadMaintenance, shouldNotify } from '@shared/maintenance'
import { planPostmortem } from '@shared/postmortem-ai'
import { markLoop } from '@shared/alert-loop'
import { arrangeTabs, closeOthers, closeRight } from '@shared/tab-actions'
import { collectReminderNotice, REMINDER_FILTER_EVENT, REMINDER_FOCUS_EVENT } from './lib/reminder-tick'
import { loadFirstWeekDismissed, saveFirstWeekDismissed } from '@shared/first-week'
import { decideQuickStart, loadFreshProfile, loadQuickDone, noteInstall, saveQuickDone } from '@shared/onboarding'
import { loadWelcomePrefs, saveWelcomeCompleted, saveWelcomeDismissed } from '@shared/welcome-prefs'
import { admitProductOverlay, escProductTarget, isHigherChromeOpen, pickProductOverlay, productBackdropCount, shouldOfferTourAfterWelcome } from '@shared/overlay-stack'
import { bindProductFocus } from './lib/focus-restore'
import {
  IMPORT_HINT_OFF_KEY,
  FIRST_CONNECT_OFF_KEY,
  FIRST_CONNECT_SEEN_KEY,
  decideFirstConnect,
  importedConnectIds,
  loadPrefFlag,
  pickValueMoment,
  savePrefFlag,
  shouldShowImportMoment,
  valueMomentBlockedByProduct,
  valueMomentDismissWrites
} from '@shared/value-moment'
import ValueMomentBar from './components/ValueMomentBar'
import { recentIdentity } from '@shared/recent-sidebar'
import type { JumpHop } from '@shared/jump-chain'
import { loadPlaybooks, savePlaybooks, upsertPlaybook } from '@shared/playbook'
import { type SyncPhase } from '@shared/sync-vault'
import { disconnectStatusSentence, statusBarSlots } from '@shared/status-bar'
import { trayHoverTitle } from '@shared/product'
import { showConnectionTrouble } from '@shared/connect-trouble'
import { runCloudSync, syncIsConfigured } from './lib/cloud-sync'
import { runFolderSyncDurable, type FolderSyncPlan } from './lib/folder-sync-run'
import { connectOptsFromProfile } from './lib/connect-opts'
import StartupSettingsModal from './components/StartupSettingsModal'
import ProtectionSection, { ProtectionLevelField } from './components/ProtectionSection'
import ScopePicker from './components/ScopePicker'
import { activeCount, loadBellPrefs, markHandled, saveBellPrefs, type AlertFilter, type BellPrefs } from '@shared/alert-workbench'
import { appendAudit, appendGate, auditEnabled, clearAudit, loadAudit, setAuditEnabled, type AuditEvent } from '@shared/audit-log'
import { peekAuditExportContext, type AuditExportSeed } from '@shared/audit-export'
import { hideFromDashboard, hostInScope, loadDashScope, restoreToDashboard, saveDashScope, type DashScope } from '@shared/dashboard-scope'
import { dropCenterSnippetTabs, redirectCenterSnippets, type RightPaneId } from '@shared/right-panel'
import { assessCommandRisk } from '@shared/command-risk'
import { effectiveLevel, elevateUntil, hostNameMatches, isElevated, loadElevate, saveElevate, wantsProductionHint, type ElevateMap, type ProtectionLevel } from '@shared/protection'
import {
  delayForAttempt,
  discardOnReconnect,
  loadReconnectPolicy,
  maxAttemptsFor,
  resumeStartHop,
  secondsRemaining,
  type ReconnectPolicy
} from '@shared/reconnect-policy'
import { gateTerminalChunk, readonlyActive, stricterLevel, writeToken } from '@shared/readonly-session'
import {
  BATCH_CONNECT_LIMIT,
  advanceHostKey,
  enqueueHostKey,
  focusTabId,
  hostsByIds,
  hostsInFolder,
  pickBatchTarget,
  planPaletteGroup,
  reconnectTabId,
  runBatchConnect,
  summarizeBatch,
  type BatchHost
} from '@shared/batch-connect'
import { loadLastWorkspace, loadRestoreLayout, loadStartupMode, saveLastWorkspace, saveRestoreLayout, saveStartupMode, type SavedWorkspaceTab, type StartupMode } from '@shared/startup-pref'
import { RESTORE_BIND_MS, snapshotWorkspace } from '@shared/session-restore'
import { coldStartShowsWelcome, planColdStart, restoreWatchIds, showsDroppedConnection, showsRestoreHold } from '@shared/cold-start'
import { isSettingsSection, loadSettingsSection, saveSettingsSection, sectionForAction, type SettingsSection } from '@shared/settings-nav'
import { editorOpenPlan, type EditorId } from '@shared/editor-surface'
import SettingsPanel from './components/SettingsPanel'
import DisconnectBanner from './components/DisconnectBanner'
import { DEMO_HOST, DEMO_PROFILE_ID, DEMO_USER, demoProfileLabel, profileDisplayLabel } from '@shared/demo-host'
import { findAlertDraft, playbookFromFixes, ruleShortName } from '@shared/playbook-draft'
import { appendTimeline, ensureFired, eventsFor, viewTimeline } from '@shared/timeline'
import { SHARED_MENUS, menuLabel, type MenuAction } from '@shared/menus'
import { useI18n, tg, type MessageKey } from './lib/i18n'
import { askConfirm, askText, DialogHost , isDialogOpen, promptDialog, toast, toastUndo} from './lib/dialogs'
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

function profileSidebarLabel(p: SavedSessionProfile, locale: string): string {
  return profileDisplayLabel(p, locale === 'en' ? 'en' : 'zh-CN')
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
  | 'settings'
  | 'file-history'
  | 'postmortem'
  | 'alert-rules'
  | 'playbook-import'
  | 'gate-timeline'
  | 'alert-maintenance'
  | 'alert-postmortem-ai'

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
  'sync-preview',
  'settings',
  'file-history',
  'postmortem',
  'alert-rules',
  'playbook-import',
  'gate-timeline',
  'alert-maintenance',
  'alert-postmortem-ai'
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
  settingsSection?: SettingsSection
  rulesSeg?: 'mine' | 'templates'
  focusPackId?: string
  gateFocusId?: string
  gateHost?: string
  /** Restored tab that connects when it becomes active. */
  cold?: boolean
  /** UX-50b: auto-bind gave up; show the click-to-connect placeholder. */
  restoreFailed?: boolean
  /** PNG-4: reopened from the last layout and not connected this launch. */
  restored?: boolean
  /** D7: first open lists this session's cwd. Focusing an existing tab leaves the path alone. */
  sftpAlignCwd?: boolean
  /** D5 compare payload */
  fileCompare?: {
    leftName: string
    rightName: string
    leftText: string
    rightText: string
    tooLarge: boolean
    remotePath?: string
    sessionId?: string
    hostKey?: string
    hostTitle?: string
  }
  /** UX-59 */
  pinned?: boolean
  openSeq?: number
  /** L2d preset when the maintenance tab opens */
  maintHostKeys?: string[]
  /** PNG-5: raw connect failure, used for the troubleshooting checklist. */
  failRaw?: string
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
  const labelFor = (tab: Pick<Tab, 'title' | 'status' | 'view' | 'auditHost' | 'connectOpts'>) =>
    tabLabel(
      {
        title: tab.title,
        status: tab.status,
        view: tab.view,
        auditHost: tab.auditHost,
        hostLabel: tab.view === 'sftp' ? tab.connectOpts?.label?.trim() || tab.connectOpts?.host || '' : undefined
      },
      (key, vars) => tr(key as MessageKey, vars)
    )
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
  const [rulesDock, setRulesDock] = useState<{ nonce: number; tab: 'rules' | 'history' } | null>(null)
  const [bellPrefs, setBellPrefs] = useState<BellPrefs>(() => loadBellPrefs())
  const [dashScope, setDashScope] = useState<DashScope>(() => loadDashScope())
  const [startupMode, setStartupMode] = useState<StartupMode>(() => loadStartupMode())
  const [restoreLayout, setRestoreLayout] = useState(() => loadRestoreLayout())
  const [startupOpen, setStartupOpen] = useState(false)
  const [elevateMap, setElevateMap] = useState<ElevateMap>(() => loadElevate())
  const [sessionRo, setSessionRo] = useState<Record<string, boolean>>({})
  const sessionRoRef = useRef(sessionRo)
  sessionRoRef.current = sessionRo
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
  const [auditExport, setAuditExport] = useState<{ nonce: number; seed: AuditExportSeed } | null>(null)
  const auditExportNonce = useRef(0)
  const [guardCollapsed, setGuardCollapsed] = useState<Record<string, boolean>>({})
  const [protection, setProtection] = useState<ProtectionLevel>('normal')
  const [jumpChain, setJumpChain] = useState<JumpHop[]>([])
  const [connAuth, setConnAuth] = useState<'password' | 'key' | 'agent'>('password')
  const [certificatePath, setCertificatePath] = useState('')
  const [formAutoRecord, setFormAutoRecord] = useState(false)
  const [blocksOn, setBlocksOn] = useState(() => blocksEnabled())
  const [jumpFail, setJumpFail] = useState<{ hop: number; total: number; name: string; reason: string; profileId?: string } | null>(null)
  const [hopProgress, setHopProgress] = useState<{ hop: number; total: number; name: string } | null>(null)
  const [connFocus, setConnFocus] = useState<'jump' | 'cert' | null>(null)
  const [tabOverflowOpen, setTabOverflowOpen] = useState(false)
  const [tabOverflowPos, setTabOverflowPos] = useState<{ top: number; left: number } | null>(null)
  const [tabStripOverflowing, setTabStripOverflowing] = useState(false)
  const [tabHiddenCount, setTabHiddenCount] = useState(0)
  const [tabFade, setTabFade] = useState({ left: false, right: false })
  const tabChrome = tabStripChrome(tabStripOverflowing)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const tabOverflowBtnRef = useRef<HTMLButtonElement>(null)
  const tabOverflowMenuRef = useRef<HTMLDivElement>(null)
  const tabSearchRef = useRef<HTMLInputElement>(null)
  const tabOverflowFromRef = useRef<'chevron' | 'palette'>('chevron')
  const [tabQuery, setTabQuery] = useState('')
  const [tabListIndex, setTabListIndex] = useState(0)
  const [closingDisconnected, setClosingDisconnected] = useState(false)
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
  const [rightPane, setRightPane] = useState<RightPaneId>(() => loadLayoutPrefs().rightPane)
  const [snipLaunch, setSnipLaunch] = useState<{ n: number; focusSearch?: boolean; openForm?: boolean; seed?: string; previewBuiltin?: boolean }>({ n: 0 })
  const openRightPanel = useCallback((pane: RightPaneId, opts?: { focusSearch?: boolean; openForm?: boolean; seed?: string; previewBuiltin?: boolean }) => {
    setRightPane(pane)
    if (pane === 'snippets') {
      setSnipLaunch((s) => ({ n: s.n + 1, focusSearch: opts?.focusSearch, openForm: opts?.openForm, seed: opts?.seed, previewBuiltin: opts?.previewBuiltin }))
    }
    updateLayout((p) => {
      const base = p.showAi ? p : withPaneToggle(p, 'ai', true)
      return { ...base, rightPane: pane }
    })
  }, [updateLayout])
  const openRightPanelRef = useRef(openRightPanel)
  openRightPanelRef.current = openRightPanel

  useEffect(() => {
    const dropped = dropCenterSnippetTabs(tabs)
    if (!dropped.hadSnippets) return
    setTabs(dropped.tabs)
    openRightPanelRef.current('snippets')
  }, [tabs])

  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [errorRaw, setErrorRaw] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<NoticeKind>('generic')
  const failedProfileIdRef = useRef<string | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const openSettingsRef = useRef<(section: SettingsSection) => void>(() => undefined)
  const noteFailure = useCallback((raw: unknown, forced?: NoticeKind) => {
    const fe = friendlyError(raw, { locale })
    const blob = `${fe.message}\n${fe.detail ?? ''}\n${raw instanceof Error ? raw.message : String(raw ?? '')}`
    const kind = forced ?? noticeKind(blob)
    const detail = stripIpcPrefix(fe.detail || (raw instanceof Error ? raw.message : String(raw ?? '')))
    setErrorKind(kind)
    setErrorRaw(raw instanceof Error ? raw.message : String(raw ?? ''))
    setErrorDetail(detail && detail !== fe.message ? detail : null)
    if (kind === 'unreachable') {
      const host = noticeHost(blob)
      setError(tg('pf5.sshUnreachable', { host: host || tg('pf5.thisHost') }))
    } else if (kind === 'auth') setError(tg('pf5.auth'))
    else if (kind === 'dropped') setError(tg('pf5.dropped'))
    else if (kind === 'permission') setError(tg('pf5.sftpPerm'))
    else if (kind === 'import') setError(tg('pf5.importFail'))
    else setError(fe.message)
  }, [locale])

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
    entry: MenuEntry
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
  useLayoutEffect(() => {
    const el = folderMenuRef.current
    if (!el || !folderMenu) return
    const rect = el.getBoundingClientRect()
    const next = placeMenu(folderMenu.x, folderMenu.y, rect.width, rect.height, window.innerWidth, window.innerHeight)
    if (Math.abs(next.x - folderMenu.x) <= 1 && Math.abs(next.y - folderMenu.y) <= 1) return
    setFolderMenu({ ...folderMenu, x: next.x, y: next.y })
  }, [folderMenu])
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
  const hostKeyShownRef = useRef<SshHostKeyPromptEvent | null>(null)
  const hostKeyQueueRef = useRef<SshHostKeyPromptEvent[]>([])
  const [aboutOpen, setAboutOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number; entry: MenuEntry } | null>(null)
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
  useEffect(() => {
    const onRight = (ev: Event) => {
      const detail = (ev as CustomEvent<{ pane?: RightPaneId; focusSearch?: boolean; openForm?: boolean; seed?: string }>).detail
      openRightPanelRef.current(detail?.pane === 'ai' ? 'ai' : 'snippets', detail)
    }
    const onPalette = () => setPaletteOpen(true)
    window.addEventListener('aiss-open-right-panel', onRight)
    window.addEventListener('aiss-open-palette', onPalette)
    return () => {
      window.removeEventListener('aiss-open-right-panel', onRight)
      window.removeEventListener('aiss-open-palette', onPalette)
    }
  }, [])
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  useEffect(() => {
    document.title = trayHoverTitle()
  }, [])
  useEffect(() => {
    // "What's new" once after an upgrade (not on a fresh install)
    void window.aiss.app
      .getVersion()
      .then((v) => {
        setAppVersion(v)
        const last = localStorage.getItem('aiss.lastSeenVersion')
        const auto = localStorage.getItem(WHATS_NEW_AUTO_KEY) !== '0'
        noteInstall(Boolean(last))
        if (last && last !== v && auto && changelogFor(v).length) setWhatsNewOpen(true)
        localStorage.setItem('aiss.lastSeenVersion', v)
        setBootNoted(true)
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
    if (manual) {
      setUpdateChecking(true)
      showToast(tg('upd.checking'))
    }
    const failUpdate = () => {
      const prefs = loadUpdateChannelPrefs()
      showToast(tg('pf5.updateFail', { channel: sourceLabel(prefs.channel, locale) }), {
        kind: 'error',
        actions: [
          { label: tg('pf5.retry'), run: () => void runUpdateCheck(true) },
          { label: tg('pf5.changeSource'), run: () => openSettingsRef.current('about') }
        ]
      })
    }
    try {
      const prefs = loadUpdateChannelPrefs()
      const r = await window.aiss.app.checkUpdate({ channel: prefs.channel, customUrl: prefs.mirror })
      markChecked()
      if (r.source) rememberUpdateSource({ source: r.source, channel: prefs.channel, at: Date.now() })
      window.dispatchEvent(new Event('aiss-update-channel'))
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
      if (r.status === 'error') failUpdate()
      else showToast(tg('upd.upToDate', { version: r.currentVersion }))
    } catch {
      if (manual) failUpdate()
    } finally {
      checkingUpdateRef.current = false
      if (manual) setUpdateChecking(false)
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
  const multiSelectedRef = useRef<string[]>([])
  multiSelectedRef.current = multiSelected
  const [batchFails, setBatchFails] = useState<{ id: string; label: string; reason: string }[]>([])
  const [batchQueue, setBatchQueue] = useState<{ queued: number; total: number; started: number } | null>(null)
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
  const [tasksManual, setTasksManual] = useState(false)
  const [tipsSnooze, setTipsSnooze] = useState(false)
  const [tipsDismissed, setTipsDismissed] = useState(() => loadFirstWeekDismissed())
  const [probePrefs, setProbePrefs] = useState<ProbePrefs>(() => loadProbePrefs())
  const probePrefsRef = useRef(probePrefs)
  probePrefsRef.current = probePrefs
  const [probeNonce, setProbeNonce] = useState(0)
  const [recentRows, setRecentRows] = useState<RecentConnection[]>([])
  const [importPreview, setImportPreview] = useState<ImportPreviewModel | null>(null)
  const [sftpComfort, setSftpComfort] = useState(() => loadSftpDensity() === 'comfort')
  const pendingLocateRef = useRef<ServerToolsTab | 'terminal' | null>(null)
  const [reconnectingTabId, setReconnectingTabId] = useState<string | null>(null)
  // G2 welcome tour, UX-09 host picker, A1 AI explain card, UX-10 indicators
  const [tourOpen, setTourOpen] = useState(false)
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => loadWelcomePrefs().dismissed)
  const [welcomeCompleted, setWelcomeCompleted] = useState(() => loadWelcomePrefs().completed)
  const [welcomeReplay, setWelcomeReplay] = useState(false)
  const [welcomeNotesHeld, setWelcomeNotesHeld] = useState(false)
  const welcomeSeen = useRef(false)
  const [tourQueued, setTourQueued] = useState(false)
  const [tourExplicit, setTourExplicit] = useState(false)
  const [quickExplicit, setQuickExplicit] = useState(false)
  const [importMoment, setImportMoment] = useState<{ count: number; ids: string[] } | null>(null)
  const [firstConnectPending, setFirstConnectPending] = useState(false)
  const onFirstConnectRef = useRef<() => void>(() => {})
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickStep, setQuickStep] = useState(1)
  const [quickResume, setQuickResume] = useState(false)
  const [quickDone, setQuickDone] = useState(() => loadQuickDone())
  const [bootNoted, setBootNoted] = useState(false)
  const quickOpenRef = useRef(false)
  const probeFailCountRef = useRef(0)
  const [probeFailCount, setProbeFailCount] = useState(0)
  const [retryAllNonce, setRetryAllNonce] = useState(0)
  quickOpenRef.current = quickOpen
  probeFailCountRef.current = probeFailCount
  const [hostPicker, setHostPicker] = useState<{ action: MenuAction; feature: string } | null>(null)
  const [aiExplain, setAiExplain] = useState<{ id: number; sessionId: string; text: string; host?: string; kind?: 'explainError' | 'explainAlert'; alertId?: string } | null>(null)
  const aiExplainSeqRef = useRef(0)
  const [selectionExplain, setSelectionExplain] = useState<{ id: number; sessionId: string; text: string; host?: string } | null>(null)
  const selectionExplainSeqRef = useRef(0)
  const [splitSecondary, setSplitSecondary] = useState('')
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null)
  const [recentKeys, setRecentKeys] = useState<string[]>([])
  const lastConnectErrorRef = useRef<string | null>(null)
  /** 连接中关闭的 tab，避免连上后仍挂会话 */
  const cancelledConnectingTabsRef = useRef(new Set<string>())
  const batchBusyRef = useRef(false)
  const batchCancelRef = useRef(false)
  const batchQueuedRef = useRef(0)
  const connectManyRef = useRef<(hosts: BatchHost[]) => Promise<void>>(async () => {})

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
            folderId: prof?.folderId,
            readonly: stricterLevel(effectiveLevel(prof), Boolean(tab.profileId && sessionRo[tab.profileId])) === 'readonly' && !isElevated(prof?.id, elevateMap)
          }
        }),
    [tabs, profiles, sessionRo, elevateMap]
  )
  const onlineSessionIds = useMemo(() => new Set(connectedSshSessions.map((s) => s.sessionId)), [connectedSshSessions])
  const recentIdSet = useMemo(() => {
    const keys = new Set(recentRows.map((r) => recentIdentity(r)))
    return new Set(profiles.filter((p) => keys.has(recentIdentity(p))).map((p) => p.id))
  }, [profiles, recentRows])
  const pinnedIdSet = useMemo(() => {
    const keys = new Set(recentRows.filter((r) => r.pinned).map((r) => recentIdentity(r)))
    return new Set(profiles.filter((p) => keys.has(recentIdentity(p))).map((p) => p.id))
  }, [profiles, recentRows])
  const homeHosts = useMemo<HomeHost[]>(() => {
    return profiles
      .filter((p) => hostInScope(dashScope, { profileId: p.id, folderId: p.folderId }))
      .map((p) => {
        const live = connectedSshSessions.find((s) => s.profileId === p.id)
        const probe = hostStatus[p.id]
        const title = profileSidebarLabel(p, locale)
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
          tags: p.tags,
          demo: p.demo,
          alerting,
          folderId: p.folderId,
          via: chainTooltip(chainFromProfile(p)) || undefined,
          recent: recentIdSet.has(p.id),
          pinned: pinnedIdSet.has(p.id)
        }
      })
  }, [profiles, dashScope, connectedSshSessions, hostStatus, activeAlertIds, alertHistory, recentIdSet, pinnedIdSet, locale])
  useEffect(() => {
    let stop = false
    const pull = () => {
      void window.aiss.workspace.recent
        .list()
        .then((rows) => {
          if (!stop) setRecentRows(rows)
        })
        .catch(() => undefined)
    }
    pull()
    const id = window.setInterval(pull, 60_000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])
  const updateProbePrefs = useCallback((patch: Partial<ProbePrefs>) => {
    setProbePrefs((prev) => {
      const next = { ...prev, ...patch }
      saveProbePrefs(next)
      return next
    })
  }, [])
  const sampleHomeHost = useCallback(async (host: { profileId: string; sessionId?: string }) => {
    const p = profilesRef.current.find((x) => x.id === host.profileId)
    const empty = {
      profileId: host.profileId,
      ok: false as const,
      cpu: null,
      mem: null,
      disk: null,
      latencyMs: null,
      at: Date.now(),
      via: 'none' as const,
      kind: 'health-probe' as const,
      code: 'other' as const,
      error: 'missing'
    }
    if (!p || !window.aiss.workspace.healthProbe) return empty
    try {
      return await window.aiss.workspace.healthProbe({
        ...connectOptsFromProfile(p),
        profileId: p.id,
        reuseSessionId: host.sessionId,
        extras: probeExtrasOf(probePrefsRef.current)
      })
    } catch (e) {
      return { ...empty, error: sanitizeProbeReason(e instanceof Error ? e.message : String(e)) }
    }
  }, [])
  const sweepProbes = useCallback((idleMs: number) => {
    void window.aiss.workspace.healthProbeSweep?.(idleMs)
  }, [])
  const releaseProbes = useCallback(() => {
    void window.aiss.workspace.healthProbeRelease?.()
  }, [])
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
        noteFailure(e)
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
        noteFailure(st.message)
      }
      if (st.status === 'closed') {
        if (st.unexpected) {
          const tab = tabsRef.current.find((t) => t.sessionId === st.sessionId)
          if (tab && tab.kind !== 'local' && !haltedRef.current.has(tab.tabId)) scheduleAutoReconnectRef.current(tab.tabId)
        }
        setTabs((prev) =>
          prev.map((t) =>
            t.sessionId === st.sessionId ? { ...t, status: 'disconnected' as const, failRaw: st.message || 'disconnected' } : t
          )
        )
        setRecordingSessionId((cur) => (cur === st.sessionId ? null : cur))
        if (st.message) noteFailure(st.message, st.unexpected ? 'dropped' : undefined)
      }
    })
  }, [])

  useEffect(() => {
    return window.aiss.ssh.onHostKeyPrompt((payload) => {
      const next = enqueueHostKey(hostKeyShownRef.current, hostKeyQueueRef.current, payload)
      hostKeyShownRef.current = next.current
      hostKeyQueueRef.current = next.queue
      setHostKeyPrompt(next.current)
    })
  }, [])

  useEffect(() => {
    return window.aiss.ssh.onHop((payload) => {
      if (batchBusyRef.current) return
      setHopProgress(payload)
    })
  }, [])

  const respondHostKey = useCallback(async (accept: boolean, alwaysTrust: boolean) => {
    const prompt = hostKeyShownRef.current
    if (!prompt) return
    const advanced = advanceHostKey(hostKeyQueueRef.current)
    hostKeyShownRef.current = advanced.current
    hostKeyQueueRef.current = advanced.queue
    setHostKeyPrompt(advanced.current)
    await window.aiss.ssh.respondHostKey({
      requestId: prompt.requestId,
      accept,
      alwaysTrust
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

  const openSession = useCallback(
    async (
      opts: SshConnectOptions,
      extra?: {
        profileId?: string
        hostInventoryId?: string
        kind?: 'ssh' | 'local'
        /** L10: per-host failure stays on the tab. Do not replace the sidebar error. */
        quiet?: boolean
        focus?: boolean
        onError?: (message: string) => void
      }
    ): Promise<string | null> => {
      const quiet = Boolean(extra?.quiet)
      const focus = extra?.focus ?? !quiet
      if (!quiet) {
        setError(null)
        lastConnectErrorRef.current = null
        setConnecting(true)
      }
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
      if (focus) setActiveTabId(tabId)
      try {
        const policy = policyRef.current
        const { sessionId, meta } = await window.aiss.ssh.connect({
          ...opts,
          keepAliveSec: policy.keepAliveSec,
          jumpRetryFromFailedHop: policy.jumpRetryFromFailedHop
        })
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
                  kind: extra?.kind ?? meta.kind ?? 'ssh',
                  failRaw: undefined
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
        if (!quiet) {
          setJumpFail(null)
          setHopProgress(null)
        }
        if (quickOpenRef.current) setQuickStep(3)
        const kind = extra?.kind ?? meta.kind ?? 'ssh'
        if (!quiet && kind !== 'local') onFirstConnectRef.current()
        return sessionId
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e)
        const msg = stripIpcPrefix(raw)
        const hop = parseHopFailure(msg)
        const shown = hop
          ? tg('m2.hopReason', { i: hop.hop, name: hop.name, addr: hop.addr, reason: hop.reason })
          : friendlyErrorMessage(raw)
        if (!quiet) {
          setHopProgress(null)
          setJumpFail(hop ? { hop: hop.hop, total: hop.total, name: hop.name, reason: hop.reason, profileId: extra?.profileId } : null)
          failedProfileIdRef.current = extra?.profileId ?? null
          if (hop) {
            setErrorKind('generic')
            setErrorDetail(stripIpcPrefix(raw))
            setError(shown)
          } else noteFailure(raw)
          lastConnectErrorRef.current = shown
          setErrorRaw(raw)
        }
        setTabs((prev) =>
          prev.map((t) => (t.tabId === tabId ? { ...t, status: 'disconnected', failRaw: raw } : t))
        )
        extra?.onError?.(shown)
        return null
      } finally {
        if (!quiet) setConnecting(false)
      }
    },
    []
  )

  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)
  const revealTab = (tabId: string) => {
    const scroll = tabBarRef.current?.querySelector('.tab-bar-scroll')
    if (!(scroll instanceof HTMLElement) || !tabId) return
    const el = scroll.querySelector(`[data-tab-id="${CSS.escape(tabId)}"]`)
    if (!(el instanceof HTMLElement)) return
    const box = scroll.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const delta = tabStripRevealDelta({
      tabLeft: rect.left - box.left,
      tabRight: rect.right - box.left,
      clientWidth: box.width
    })
    if (delta) scroll.scrollLeft += delta
  }
  // TO-5: activating or opening a tab scrolls that tab into the strip, not the page.
  useEffect(() => {
    if (activeTabId && layout.showMain) revealTab(activeTabId)
  }, [activeTabId, tabs.length, layout.showMain])
  useEffect(() => {
    const bar = tabBarRef.current
    if (!bar) return
    const scroll = bar.querySelector('.tab-bar-scroll')
    if (!(scroll instanceof HTMLElement)) return
    const measure = () => {
      const box = scroll.getBoundingClientRect()
      let hidden = 0
      for (const node of scroll.querySelectorAll(':scope > .tab')) {
        if (!(node instanceof HTMLElement)) continue
        const r = node.getBoundingClientRect()
        if (r.width < 1) continue
        if (r.left < box.left - 1 || r.right > box.right + 1) hidden += 1
      }
      const overflowing = scroll.scrollWidth > scroll.clientWidth + 1
      setTabHiddenCount(hidden)
      setTabStripOverflowing(overflowing || hidden > 0)
      setTabFade({
        left: scroll.scrollLeft > 1,
        right: scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - 1
      })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    ro.observe(scroll)
    scroll.addEventListener('scroll', measure, { passive: true })
    const onWheel = (e: WheelEvent) => {
      if (scroll.scrollWidth <= scroll.clientWidth + 1) return
      const delta = tabStripWheelDelta(e.deltaX, e.deltaY, e.deltaMode, scroll.clientWidth)
      if (!delta) return
      e.preventDefault()
      scroll.scrollLeft += delta
    }
    bar.addEventListener('wheel', onWheel, { capture: true, passive: false })
    measure()
    return () => {
      ro.disconnect()
      scroll.removeEventListener('scroll', measure)
      bar.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [tabs.length, locale, layout.showMain])
  useEffect(() => {
    if (!tabOverflowOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const fromPalette = tabOverflowFromRef.current === 'palette'
      setTabOverflowOpen(false)
      if (fromPalette) setPaletteOpen(true)
      else tabOverflowBtnRef.current?.focus()
    }
    const onPointer = (e: MouseEvent) => {
      const node = e.target
      if (!(node instanceof Node)) return
      if (tabOverflowBtnRef.current?.contains(node)) return
      if (tabOverflowMenuRef.current?.contains(node)) return
      setTabOverflowOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [tabOverflowOpen])
  useEffect(() => {
    if (!tabStripOverflowing && tabOverflowOpen && tabOverflowFromRef.current !== 'palette') setTabOverflowOpen(false)
  }, [tabStripOverflowing, tabOverflowOpen])
  useEffect(() => {
    if (!tabOverflowOpen) return
    const id = window.setTimeout(() => {
      if (showTabSearch(tabsRef.current.length)) tabSearchRef.current?.focus()
      else tabOverflowMenuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus()
    }, 0)
    return () => window.clearTimeout(id)
  }, [tabOverflowOpen])
  tabsRef.current = tabs
  activeTabIdRef.current = activeTabId
  const autoRetryRef = useRef(new Map<string, { attempt: number; timer: ReturnType<typeof setTimeout> }>())
  const [autoRetry, setAutoRetry] = useState<{
    tabId: string
    attempt: number
    delayMs: number
    startedAt: number
    max: number
    phase: 'off' | 'countdown' | 'stopped' | 'exhausted'
  } | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [reconnectPolicy, setReconnectPolicy] = useState<ReconnectPolicy>(() => loadReconnectPolicy())
  const policyRef = useRef(reconnectPolicy)
  policyRef.current = reconnectPolicy
  const haltedRef = useRef(new Set<string>())
  const roBufRef = useRef(new Map<string, string>())
  const [roBlock, setRoBlock] = useState<{ sessionId: string; text: string; command: string } | null>(null)
  const [settingsAnchor, setSettingsAnchor] = useState<string | null>(null)
  const jumpFailRef = useRef(jumpFail)
  jumpFailRef.current = jumpFail
  const reconnectTabRef = useRef<(tabId: string, how?: { full?: boolean; quiet?: boolean; onError?: (message: string) => void }) => Promise<string | null>>(async () => null)
  const scheduleAutoReconnectRef = useRef<(tabId: string) => void>(() => {})

  const cancelAutoReconnect = useCallback((tabId: string) => {
    const cur = autoRetryRef.current.get(tabId)
    if (cur) clearTimeout(cur.timer)
    autoRetryRef.current.delete(tabId)
    haltedRef.current.delete(tabId)
    setAutoRetry((s) => (s?.tabId === tabId ? null : s))
  }, [])

  const noteReconnectAudit = useCallback((tabId: string, kind: 'session.reconnect.fail' | 'session.reconnect.stop') => {
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    appendAudit({
      type: kind,
      host: tab?.connectOpts.label?.trim() || tab?.connectOpts.host || tab?.title || tabId,
      profileId: tab?.profileId,
      source: 'user',
      outcome: 'blocked',
      detail: kind
    })
    setAuditEvents(loadAudit())
  }, [])

  scheduleAutoReconnectRef.current = (tabId: string) => {
    if (haltedRef.current.has(tabId)) {
      setAutoRetry((s) => (s?.tabId === tabId && s.phase === 'stopped' ? s : { tabId, attempt: 0, delayMs: 0, startedAt: 0, max: 0, phase: 'stopped' }))
      return
    }
    const policy = policyRef.current
    const prev = autoRetryRef.current.get(tabId)
    if (prev) clearTimeout(prev.timer)
    const max = maxAttemptsFor(policy)
    if (policy.mode === 'off') {
      autoRetryRef.current.delete(tabId)
      setAutoRetry({ tabId, attempt: 0, delayMs: 0, startedAt: 0, max: 0, phase: 'off' })
      return
    }
    const attempt = (prev?.attempt ?? 0) + 1
    const delayMs = delayForAttempt(policy, attempt)
    if (delayMs === null) {
      autoRetryRef.current.delete(tabId)
      setAutoRetry({ tabId, attempt: Math.max(1, attempt - 1), delayMs: 0, startedAt: 0, max, phase: 'exhausted' })
      noteReconnectAudit(tabId, 'session.reconnect.fail')
      return
    }
    const startedAt = Date.now()
    const timer = setTimeout(() => {
      void (async () => {
        if (!tabsRef.current.some((t) => t.tabId === tabId && t.status === 'disconnected')) {
          cancelAutoReconnect(tabId)
          return
        }
        const ok = await reconnectTabRef.current(tabId, { full: false })
        if (ok) cancelAutoReconnect(tabId)
        else if (autoRetryRef.current.has(tabId)) scheduleAutoReconnectRef.current(tabId)
      })()
    }, delayMs)
    autoRetryRef.current.set(tabId, { attempt, timer })
    setAutoRetry({ tabId, attempt, delayMs, startedAt, max, phase: 'countdown' })
  }

  useEffect(() => {
    const map = autoRetryRef.current
    return () => {
      for (const v of map.values()) clearTimeout(v.timer)
      map.clear()
    }
  }, [])
  useEffect(() => {
    if (autoRetry?.phase !== 'countdown') return
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [autoRetry?.phase, autoRetry?.tabId, autoRetry?.startedAt])
  useEffect(() => {
    const onPolicy = (e: Event) => {
      const detail = (e as CustomEvent<ReconnectPolicy>).detail
      if (!detail) return
      policyRef.current = detail
      setReconnectPolicy(detail)
    }
    window.addEventListener('aiss-reconnect-policy', onPolicy)
    return () => window.removeEventListener('aiss-reconnect-policy', onPolicy)
  }, [])
  useEffect(() => {
    if (!roBlock) return
    const id = window.setTimeout(() => setRoBlock(null), 3000)
    return () => window.clearTimeout(id)
  }, [roBlock])
  useEffect(() => {
    const live = new Set(tabs.filter((t) => (!t.view || t.view === 'session') && t.profileId).map((t) => t.profileId as string))
    setSessionRo((prev) => {
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (!live.has(id)) {
          delete next[id]
          changed = true
        }
      }
      if (!changed) return prev
      sessionRoRef.current = next
      return next
    })
  }, [tabs])

  const reconnectTab = useCallback(
    async (tabId: string, how?: { full?: boolean; quiet?: boolean; onError?: (message: string) => void }): Promise<string | null> => {
      const tab = tabsRef.current.find((t) => t.tabId === tabId)
      if (!tab || tab.status !== 'disconnected') return null
      const quiet = Boolean(how?.quiet)
      if (!quiet) setError(null)
      setReconnectingTabId(tabId)
      const policy = policyRef.current
      const hop = jumpFailRef.current
      const startHop = resumeStartHop(hop?.total ?? 0, hop && hop.profileId === tab.profileId ? hop.hop : null, policy.jumpRetryFromFailedHop, Boolean(how?.full))
      const resumeFromHop = how?.full ? undefined : startHop > 1 ? startHop : undefined
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
                    failRaw: undefined,
                    connectOpts: {
                      ...t.connectOpts,
                      termCols: meta.termCols,
                      termRows: meta.termRows
                    }
                  }
                : t
            )
          )
          discardOnReconnect()
          return sessionId
        }
        const { sessionId, meta } = await window.aiss.ssh.connect({
          ...tab.connectOpts,
          termCols: tab.connectOpts.termCols,
          termRows: tab.connectOpts.termRows,
          keepAliveSec: policy.keepAliveSec,
          jumpRetryFromFailedHop: policy.jumpRetryFromFailedHop,
          resumeFromHop
        })
        setTabs((prev) =>
          prev.map((t) =>
            t.tabId === tabId
              ? {
                  ...t,
                  sessionId,
                  title: t.customTitle ?? meta.label ?? t.title,
                  status: 'connected',
                  failRaw: undefined,
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
        if (!quiet) {
          setJumpFail(null)
          setHopProgress(null)
        }
        discardOnReconnect()
        return sessionId
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e)
        const msg = stripIpcPrefix(raw)
        const hop = parseHopFailure(msg)
        const shown = hop
          ? tg('m2.hopReason', { i: hop.hop, name: hop.name, addr: hop.addr, reason: hop.reason })
          : friendlyErrorMessage(raw)
        if (!quiet) {
          setHopProgress(null)
          setJumpFail(hop ? { hop: hop.hop, total: hop.total, name: hop.name, reason: hop.reason, profileId: tab.profileId } : null)
          setErrorRaw(raw)
          setError(shown)
        }
        setTabs((prev) => prev.map((t) => (t.tabId === tabId ? { ...t, failRaw: raw } : t)))
        how?.onError?.(shown)
        return null
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
  const liveCloseBypassRef = useRef(false)
  const closeTab = useCallback((tabId: string, sessionId: string, status: Tab['status'], view?: TabView) => {
    if (view === 'sftp' && !sftpBypassRef.current) {
      void askSftpClose(tabId).then((answer) => {
        if (answer === 'stay') return
        sftpBypassRef.current = true
        closeTabRef.current(tabId, sessionId, status, view)
        sftpBypassRef.current = false
      })
      return
    }
    if (!liveCloseBypassRef.current && (!view || view === 'session') && status === 'connected' && sessionId) {
      void askConfirm({
        id: 'confirm.closeLiveTerminal',
        title: tg('confirm.closeTerminal'),
        body: tg('confirm.closeTerminalBody'),
        confirmText: tg('confirm.closeTerminal'),
        danger: true
      }).then((ok) => {
        if (!ok) return
        liveCloseBypassRef.current = true
        closeTabRef.current(tabId, sessionId, status, view)
        liveCloseBypassRef.current = false
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
      view === 'file-diff' ||
      view === 'settings' ||
      view === 'alert-maintenance' ||
      view === 'alert-postmortem-ai'
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
        void askConfirm({
          id: 'confirm.quitWithDirty',
          title: tg('dlg.discard'),
          body: tg('app.unsavedClose'),
          confirmText: tg('dlg.discard'),
          danger: true
        }).then((ok) => ok && drop())
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
      const drop = tabsRef.current.filter((t, idx) => !keep(t, idx))
      const live = drop.filter((t) => (!t.view || t.view === 'session') && t.status === 'connected' && t.sessionId)
      const run = (bypass: boolean) => {
        if (bypass) liveCloseBypassRef.current = true
        for (const t of drop) closeTab(t.tabId, t.sessionId, t.status, t.view)
        if (bypass) liveCloseBypassRef.current = false
      }
      if (live.length > 1) {
        void askConfirm({
          id: 'confirm.closeLiveTerminal',
          title: tg('confirm.closeTerminalN', { n: live.length }),
          body: tg('confirm.closeTerminalBody'),
          confirmText: tg('confirm.closeTerminalN', { n: live.length }),
          danger: true
        }).then((ok) => {
          if (ok) run(true)
        })
        return
      }
      run(false)
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
    (profile?: SavedSessionProfile, focus?: 'jump' | 'cert' | null) => {
      ensureMainVisible()
      setConnFocus(focus ?? null)
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
      const title = profile ? tg('app.editProfile', { name: profileSidebarLabel(profile, locale) }) : tg('app.newConnection')
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

  const openSftpTransfer = useCallback((forSessionId?: string, opts?: { alignCwd?: boolean; profile?: SavedSessionProfile }): string | null => {
    ensureMainVisible()
    const tabsNow = tabsRef.current
    const alignCwd = opts?.alignCwd === true
    const profile = opts?.profile
    const isSsh = (t: Tab) => (!t.view || t.view === 'session') && t.kind !== 'local' && Boolean(t.sessionId)
    let bound: Tab | undefined
    if (forSessionId) {
      bound = tabsNow.find((t) => t.sessionId === forSessionId && isSsh(t))
      if (!bound) {
        setError(tg('app.needSshSftp'))
        return null
      }
    } else if (profile) {
      bound = tabsNow.find((t) => t.profileId === profile.id && isSsh(t) && t.status === 'connected')
    } else {
      const active = tabsNow.find((t) => t.tabId === activeTabId)
      if (active?.view === 'sftp') {
        setActiveTabId(active.tabId)
        showToast(tg('d8.focus'))
        return null
      }
      bound =
        tabsNow.find((t) => t.tabId === activeTabId && isSsh(t) && t.status === 'connected') ||
        tabsNow.find((t) => isSsh(t) && t.status === 'connected')
      if (!bound) {
        setError(tg('app.needSshSftp'))
        return null
      }
    }
    const hostRef = {
      profileId: bound?.profileId || profile?.id,
      host: bound?.connectOpts.host || profile?.host,
      port: bound?.connectOpts.port || profile?.port,
      username: bound?.connectOpts.username || profile?.username
    }
    const plan = planSftpOpen(
      tabsNow.map((t) => ({
        tabId: t.tabId,
        view: t.view,
        profileId: t.profileId,
        host: t.connectOpts.host,
        port: t.connectOpts.port,
        username: t.connectOpts.username
      })),
      hostRef
    )
    if (plan.action === 'focus') {
      const existing = tabsNow.find((t) => t.tabId === plan.tabId)
      if (existing && !existing.boundSessionId && bound?.sessionId && bound.status === 'connected') {
        setTabs((prev) =>
          prev.map((t) =>
            t.tabId === existing.tabId
              ? {
                  ...t,
                  boundSessionId: bound!.sessionId,
                  status: 'connected',
                  profileId: hostRef.profileId ?? t.profileId,
                  connectOpts: bound!.connectOpts
                }
              : t
          )
        )
      }
      setActiveTabId(plan.tabId)
      showToast(tg('d8.focus'))
      return null
    }
    setError(null)
    const hostName =
      bound?.connectOpts.label?.trim() ||
      bound?.customTitle?.trim() ||
      profile?.label?.trim() ||
      bound?.connectOpts.host ||
      profile?.host ||
      bound?.title ||
      ''
    const title = formatSftpTabTitle(hostName)
    const connectOpts = bound?.connectOpts || (profile ? connectOptsFromProfile(profile) : PLACEHOLDER_CONNECT)
    const ready = Boolean(bound?.sessionId && bound.status === 'connected')
    const tabId = uuid()
    const created: Tab = {
      tabId,
      sessionId: '',
      title,
      connectOpts,
      status: ready ? 'connected' : 'connecting',
      view: 'sftp',
      boundSessionId: ready ? bound!.sessionId : undefined,
      profileId: hostRef.profileId,
      sftpAlignCwd: alignCwd && ready
    }
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.tabId === activeTabId)
      const next = [...prev]
      next.splice(idx >= 0 ? idx + 1 : next.length, 0, created)
      return next
    })
    setActiveTabId(tabId)
    return tabId
  }, [activeTabId, ensureMainVisible])


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
    const ex = tabsRef.current.find((t) => {
      if (t.view !== view) return false
      if (view === 'file-history') return t.profileId === extra?.profileId && (t.remotePath || '') === (extra?.remotePath || '')
      if (view === 'postmortem' || view === 'alert-postmortem-ai') return t.focusAlertId === extra?.focusAlertId
      if (view === 'playbook-edit' || view === 'playbook-run') return t.playbookId === extra?.playbookId
      if (view === 'recording-play') return t.recordingFile === extra?.recordingFile
      if (extra?.playbookId) return t.playbookId === extra.playbookId
      return true
    })
    if (ex) {
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

  const createFixRef = useRef<(alert: FiredAlert, fixes: Array<{ command: string; note?: string }>, force?: boolean, kind?: 'alert' | 'error') => void>(() => undefined)
  const createFixPlaybook = useCallback((alert: FiredAlert, fixes: Array<{ command: string; note?: string }>, force = false, kind: 'alert' | 'error' = 'alert') => {
    const alertId = kind === 'alert' ? alert.id : undefined
    const existing = alertId ? findAlertDraft(loadPlaybooks(), alertId) : undefined
    if (existing && !force) {
      openM2('playbook-edit', existing.name.slice(0, 24), { playbookId: existing.id, focusAlertId: alert.id })
      showToast(tg('w1.openedExisting'), { action: { label: tg('w1.regen'), run: () => createFixRef.current(alert, fixes, true, kind) } })
      return
    }
    const owner = tabsRef.current.find((t) => t.sessionId === alert.hostKey && (!t.view || t.view === 'session'))
    const profile = profilesRef.current.find((p) => p.id === owner?.profileId) ?? profilesRef.current.find((p) => p.id === alert.hostKey)
    const lang = locale === 'en' ? 'en' : 'zh'
    const built = playbookFromFixes(
      fixes,
      { kind, alertId, hostKey: alert.hostKey, hostTitle: alert.hostTitle, ruleId: kind === 'alert' ? alert.ruleId : undefined, at: Date.now() },
      effectiveLevel(profile),
      { profileId: profile?.id, locale: lang, ruleLabel: kind === 'alert' ? ruleShortName(alert.ruleId, lang) : '' }
    )
    if (existing && force) built.playbook.id = existing.id
    try {
      savePlaybooks(upsertPlaybook(loadPlaybooks(), built.playbook))
    } catch (e) {
      showToast(tg('w1.saveFail', { reason: e instanceof Error ? e.message : String(e) }), { kind: 'error' })
      return
    }
    appendAudit({
      type: 'playbook.draft',
      host: alert.hostTitle,
      profileId: profile?.id,
      source: 'AI',
      outcome: 'allowed',
      detail: `${built.playbook.name} ← ${kind} ${kind === 'alert' ? alert.ruleId : 'error'}@${alert.hostTitle}`,
      alertId
    })
    setAuditEvents(loadAudit())
    if (alertId) {
      appendTimeline({ alertId, kind: 'playbook.draft', hostKey: alert.hostKey, summary: built.playbook.name })
      markLoop(alertId, 'playbook')
      window.dispatchEvent(new Event('aiss-loop-mark'))
    }
    openM2('playbook-edit', built.playbook.name.slice(0, 24), { playbookId: built.playbook.id, focusAlertId: alertId })
    showToast(tg('w1.created'))
    if (built.truncated > 0) showToast(tg('w1.truncated', { n: fixes.filter((f) => String(f.command || '').trim()).length }))
  }, [locale, openM2])
  createFixRef.current = createFixPlaybook

  const openFileHistory = useCallback((info: { profileId: string; path?: string; sessionId?: string; hostLabel: string; connectOpts?: SshConnectOptions }) => {
    const file = (info.path || '').split('/').filter(Boolean).pop() || ''
    const title = (file ? `${tg('w3.history')} · ${file}` : tg('w3.history')).slice(0, 24)
    openM2('file-history', title, {
      profileId: info.profileId,
      remotePath: info.path || '',
      boundSessionId: info.sessionId,
      connectOpts: info.connectOpts ?? PLACEHOLDER_CONNECT
    })
  }, [openM2])

  const openPostmortem = useCallback((alert: FiredAlert) => {
    ensureFired({
      id: alert.id,
      hostKey: alert.hostKey,
      hostTitle: alert.hostTitle,
      ruleId: alert.ruleId,
      value: alert.value,
      threshold: alert.threshold,
      at: alert.at,
      status: alert.status,
      recoveredAt: alert.recoveredAt,
      handledManually: alert.handledManually
    })
    openM2('postmortem', tg('w4.tab', { host: alert.hostTitle, rule: alert.ruleId }).slice(0, 24), { focusAlertId: alert.id })
  }, [openM2])

  const openMaintenance = useCallback((hostKeys?: string[]) => {
    openM2('alert-maintenance', tg('l2d.panelTitle'), { maintHostKeys: hostKeys, alertNonce: Date.now() })
  }, [openM2])

  const openPostmortemAi = useCallback((alert: FiredAlert) => {
    if (aiConfigured && planPostmortem(true, eventsFor(alert.id)) === 'empty') {
      showToast(tg('a5.emptyTl'))
      return
    }
    openM2('alert-postmortem-ai', tg('a5.tabTitle', { title: alert.hostTitle }).slice(0, 24), { focusAlertId: alert.id })
  }, [aiConfigured, openM2])

  const createDiffPlaybook = useCallback((info: { hostKey: string; hostTitle: string; path: string; fixes: Array<{ command: string; note?: string }> }) => {
    const owner = tabsRef.current.find((t) => (t.sessionId === info.hostKey || t.profileId === info.hostKey) && (!t.view || t.view === 'session'))
    const profile = profilesRef.current.find((p) => p.id === info.hostKey) ?? profilesRef.current.find((p) => p.id === owner?.profileId)
    const file = info.path.split('/').filter(Boolean).pop() || info.path
    const built = playbookFromFixes(
      info.fixes,
      { kind: 'diff', hostKey: info.hostKey, hostTitle: info.hostTitle, path: info.path, at: Date.now() },
      effectiveLevel(profile),
      { profileId: profile?.id, locale: locale === 'en' ? 'en' : 'zh', ruleLabel: file }
    )
    try {
      savePlaybooks(upsertPlaybook(loadPlaybooks(), built.playbook))
    } catch (e) {
      showToast(tg('w1.saveFail', { reason: e instanceof Error ? e.message : String(e) }), { kind: 'error' })
      return
    }
    appendAudit({
      type: 'playbook.draft',
      host: info.hostTitle,
      profileId: profile?.id,
      source: 'AI',
      outcome: 'allowed',
      detail: `${built.playbook.name} ← diff ${file}`
    })
    setAuditEvents(loadAudit())
    openM2('playbook-edit', built.playbook.name.slice(0, 24), { playbookId: built.playbook.id })
    showToast(tg('w1.created'))
  }, [locale, openM2])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ hostKeys?: string[] }>).detail
      openMaintenance(detail?.hostKeys)
    }
    window.addEventListener('aiss-maintenance-open', onOpen)
    return () => window.removeEventListener('aiss-maintenance-open', onOpen)
  }, [openMaintenance])

  useEffect(() => {
    const warned = new Set<string>()
    const tick = () => {
      const now = Date.now()
      const expired = expireDue(undefined, now)
      if (expired.length) {
        for (const rec of expired) {
          appendAudit({ type: 'alert.maintenance', host: rec.detail, source: 'user', outcome: 'allowed', detail: rec.detail })
        }
        setAuditEvents(loadAudit())
        showToast(tg('l2d.toastExpired'))
        window.dispatchEvent(new Event('aiss-maintenance-change'))
      }
      for (const row of endingSoon(loadMaintenance(), now)) {
        if (warned.has(row.id)) continue
        warned.add(row.id)
        showToast(tg('l2d.remaining', { t: formatRemaining(row.endsAt - now) }))
      }
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const tick = () => {
      const notice = collectReminderNotice()
      if (!notice || notice.executes) return
      const title = notice.playbookIds.length === 1
        ? tg('w6.notifOne', { name: notice.names[0] || notice.playbookIds[0] || '' })
        : tg('w6.notifMany', { n: notice.playbookIds.length })
      const open = () => {
        const only = notice.playbookIds.length === 1 ? notice.playbookIds[0] : ''
        if (only) {
          openM2('playbook-run', tg('m2.run'), { playbookId: only })
          window.setTimeout(() => window.dispatchEvent(new CustomEvent(REMINDER_FOCUS_EVENT, { detail: { playbookId: only } })), 80)
          return
        }
        openM2('playbook-list', tg('m2.playbooks'))
        window.dispatchEvent(new Event(REMINDER_FILTER_EVENT))
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const note = new Notification(title)
          note.onclick = () => {
            void window.aiss.app.focus().catch(() => undefined)
            open()
          }
        } catch {
          showToast(title, { action: { label: tg('w6.badge'), run: open } })
        }
      } else {
        showToast(title, { action: { label: tg('w6.badge'), run: open } })
      }
    }
    const first = window.setTimeout(tick, 1500)
    const id = window.setInterval(tick, 60_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [openM2])

  const liveSessions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tabs) {
      if (t.profileId && t.sessionId && t.status === 'connected' && (!t.view || t.view === 'session')) map.set(t.profileId, t.sessionId)
    }
    return map
  }, [tabs])

  const orderedTabs = useMemo(
    () => arrangeTabs(tabs.filter((t) => !redirectCenterSnippets(t.view)).map((t, i) => ({ ...t, id: t.tabId, seq: t.openSeq ?? i + 1, pinned: Boolean(t.pinned) }))),
    [tabs]
  )
  const maintSubjects = useMemo(
    () =>
      alertHistory
        .filter((a) => a.status === 'active')
        .map((a) => {
          const live = tabs.find((t) => t.sessionId === a.hostKey && (!t.view || t.view === 'session'))
          const profile = profiles.find((p) => p.id === (live?.profileId || a.hostKey))
          const keys = [a.hostKey, a.hostTitle, profile?.id, profile?.label, profile?.host, live?.title].filter((k): k is string => Boolean(k))
          return { keys, tags: profile?.tags ?? [] }
        }),
    [alertHistory, tabs, profiles]
  )

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
    const level = stricterLevel(effectiveLevel(profile), Boolean(profile?.id && sessionRo[profile.id]))
    return {
      profile,
      level,
      elevated: isElevated(profile?.id, elevateMap),
      hostName: profile?.host || profile?.label || '',
      hostLabel: profile?.label || profile?.host || ''
    }
  }, [elevateMap, profileForSession, sessionRo])

  useEffect(() => {
    const onRun = (e: Event) => {
      const plan = (e as CustomEvent<FolderSyncPlan>).detail
      if (!plan?.sessionId) return
      const sid = plan.sessionId
      void runFolderSyncDurable({ ...plan, sessionId: sid, profileId: plan.profileId || guardForSession(sid).profile?.id }, async () => {
        const g = guardForSession(sid)
        return runGuardedCommand({
          level: g.level,
          hostName: g.hostName,
          hostLabel: g.hostLabel,
          elevated: g.elevated,
          profileId: g.profile?.id,
          channel: 'sftp',
          dangerous: false,
          command: 'folder-sync',
          source: 'user'
        })
      })
    }
    window.addEventListener('aiss-run-sync', onRun)
    return () => window.removeEventListener('aiss-run-sync', onRun)
  }, [guardForSession])

  const refreshAlerts = useCallback((next: FiredAlert[]) => {
    saveAlertHistory(next)
    setAlertHistory(next)
    setActiveAlertIds(alertHostIds(next, breachingRef.current))
  }, [])

  const dismissAlert = useCallback((alert: FiredAlert) => {
    const prev = alertHistory
    refreshAlerts(ignoreAlert(prev, alert.id))
    toastUndo({ message: tg('l7.dismissed'), undo: () => refreshAlerts(prev) })
  }, [alertHistory, refreshAlerts])

  const handleAlertDone = useCallback((alert: FiredAlert) => {
    refreshAlerts(markHandled(alertHistory, alert.id))
  }, [alertHistory, refreshAlerts])

  const muteAlerts = useCallback((ms = 60 * 60 * 1000) => {
    setAlertRules((prev) => {
      const next = { ...prev, mutedUntil: Date.now() + ms }
      saveAlertRules(next)
      toastUndo({
        message: tg('l2.mute1h'),
        undo: () => {
          saveAlertRules(prev)
          setAlertRules(prev)
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
    const level = stricterLevel(effectiveLevel(p), Boolean(sessionRoRef.current[p.id]))
    if (level === 'normal') return
    if (level === 'production') {
      const typed = await promptDialog({
        title: tg('l4.unlockTitle'),
        label: tg('l4.typeHost', { host: p.host }),
        validate: (v) => (hostNameMatches(v, [p.host, p.label]) ? null : tg('l4.hostMismatch'))
      })
      if (typed == null) return
    } else {
      const ok = await askConfirm({
        id: 'confirm.prodGuardTempLift',
        title: tg('l4.unlockTitle'),
        body: tg('l4.unlockReadonly'),
        confirmText: tg('confirm.liftGuard'),
        danger: true
      })
      if (!ok) return
    }
    const until = elevateUntil(p.id)
    const map = { ...loadElevate(), [p.id]: until }
    saveElevate(map)
    setElevateMap(map)
    appendGate({
      host: p.label?.trim() || p.host,
      hostKey: p.id,
      protection: level,
      gateRule: level === 'production' ? 'prod' : 'readonlyWrite',
      gateResult: 'unlock',
      summary: tg('l4.unlocked'),
      demo: Boolean(p.demo)
    })
    showToast(tg('l4.unlocked'))
  }, [])

  const noteReadonlyAudit = useCallback((profile: SavedSessionProfile | undefined, on: boolean) => {
    const host = profile?.label?.trim() || profile?.host || 'session'
    const type = on ? 'session.readonly.on' : 'session.readonly.off'
    appendAudit({ type, host, profileId: profile?.id, source: 'user', outcome: 'allowed', detail: type })
    const alert = alertHistory.find((a) => a.status === 'active' && (a.hostKey === profile?.id || a.hostTitle === host))
    if (alert && profile?.id) {
      appendTimeline({ alertId: alert.id, kind: 'note', hostKey: profile.id, summary: type })
    }
    setAuditEvents(loadAudit())
  }, [alertHistory])

  const toggleSessionReadonly = useCallback((tab: Tab) => {
    const profile = profilesRef.current.find((p) => p.id === tab.profileId)
    const id = tab.profileId || tab.tabId
    const sessionOn = Boolean(sessionRoRef.current[id])
    const profileRo = effectiveLevel(profile) === 'readonly'
    if (sessionOn) {
      if (profileRo) {
        showToast(tg('s4.needProfile'), {
          action: profile ? { label: tg('s4.unlock'), run: () => void elevateProfile(profile) } : undefined
        })
        return
      }
      setSessionRo((prev) => {
        const next = { ...prev }
        delete next[id]
        sessionRoRef.current = next
        return next
      })
      noteReadonlyAudit(profile, false)
      return
    }
    if (profileRo) {
      showToast(tg('s4.needProfile'), {
        action: profile ? { label: tg('s4.unlock'), run: () => void elevateProfile(profile) } : undefined
      })
      return
    }
    setSessionRo((prev) => {
      const next = { ...prev, [id]: true }
      sessionRoRef.current = next
      return next
    })
    noteReadonlyAudit(profile, true)
  }, [elevateProfile, noteReadonlyAudit])

  const showRoBlock = useCallback((sessionId: string, block: { multiline: boolean; command: string; token: string }) => {
    const g = guardForSession(sessionId)
    const reason = block.multiline ? tg('s4.blockPaste') : tg('s4.reason', { token: block.token || writeToken(block.command) })
    const text = block.multiline ? tg('s4.blockPaste') : tg('s4.block', { reason })
    setRoBlock({ sessionId, text, command: block.command })
    appendGate({
      host: g.hostLabel || g.hostName || sessionId,
      hostKey: g.profile?.id,
      protection: 'readonly',
      gateRule: 'readonlyWrite',
      gateResult: 'blocked',
      summary: block.command.slice(0, 180),
      source: 'terminal',
      demo: Boolean(g.profile?.demo)
    })
    appendAudit({
      type: 'danger',
      host: g.hostLabel || g.hostName || sessionId,
      profileId: g.profile?.id,
      source: 'terminal',
      outcome: 'blocked',
      detail: block.command
    })
    setAuditEvents(loadAudit())
  }, [guardForSession])

  const writeGuarded = useCallback((sessionId: string, data: string) => {
    const g = guardForSession(sessionId)
    if (!readonlyActive(g.level, g.elevated)) {
      void window.aiss.ssh.write(sessionId, data)
      return
    }
    const prev = roBufRef.current.get(sessionId) ?? ''
    const gate = gateTerminalChunk(prev, data)
    roBufRef.current.set(sessionId, gate.buffer)
    if (gate.block) {
      showRoBlock(sessionId, gate.block)
      if (gate.clear) void window.aiss.ssh.write(sessionId, gate.clear)
      return
    }
    if (gate.send) void window.aiss.ssh.write(sessionId, gate.send)
  }, [guardForSession, showRoBlock])

  const handleTermInput = useCallback((origin: string, data: string) => {
    const fan = broadcastEnabled && broadcastSessions.includes(origin) && broadcastSessions.length > 1 ? broadcastSessions : [origin]
    const originRo = readonlyActive(guardForSession(origin).level, guardForSession(origin).elevated)
    if (originRo) {
      const prev = roBufRef.current.get(origin) ?? ''
      const gate = gateTerminalChunk(prev, data)
      roBufRef.current.set(origin, gate.buffer)
      if (gate.block) {
        showRoBlock(origin, gate.block)
        if (gate.clear) void window.aiss.ssh.write(origin, gate.clear)
        return
      }
      if (gate.send) void window.aiss.ssh.write(origin, gate.send)
      let skipped = 0
      for (const sid of fan) {
        if (sid === origin) continue
        if (readonlyActive(guardForSession(sid).level, guardForSession(sid).elevated)) {
          skipped += 1
          continue
        }
        void window.aiss.ssh.write(sid, gate.send)
      }
      if (skipped) showToast(tg('s4.skipped'))
      return
    }
    let skipped = 0
    for (const sid of fan) {
      if (readonlyActive(guardForSession(sid).level, guardForSession(sid).elevated)) {
        skipped += 1
        continue
      }
      void window.aiss.ssh.write(sid, data)
    }
    if (skipped) showToast(tg('s4.skipped'))
  }, [broadcastEnabled, broadcastSessions, guardForSession, showRoBlock])

  const restoreProtection = useCallback((profileId: string) => {
    const profile = profilesRef.current.find((row) => row.id === profileId)
    const map = { ...loadElevate() }
    delete map[profileId]
    saveElevate(map)
    setElevateMap(map)
    appendGate({
      host: profile?.label?.trim() || profile?.host || profileId,
      hostKey: profileId,
      protection: effectiveLevel(profile),
      gateRule: effectiveLevel(profile) === 'readonly' ? 'readonlyWrite' : 'prod',
      gateResult: 'restore',
      summary: tg('l4.restored'),
      demo: Boolean(profile?.demo)
    })
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
            profileId: s.profileId,
            folderId: profilesRef.current.find((p) => p.id === s.profileId)?.folderId,
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
      const maint = loadMaintenance()
      const audible = newly.filter((f) => {
        if (muted || ignoredNow.has(`${f.hostKey}:${f.ruleId}`)) return false
        const live = connectedSshSessionsRef.current.find((s) => s.sessionId === f.hostKey)
        const profile = profilesRef.current.find((p) => p.id === (live?.profileId || f.hostKey))
        const keys = [f.hostKey, f.hostTitle, profile?.id, profile?.label, profile?.host, live?.title].filter((k): k is string => Boolean(k))
        return shouldNotify(maint, { keys, tags: profile?.tags ?? [] })
      })
      if (audible.length) {
        if (alertRules.notify.systemNotify && typeof Notification !== 'undefined') {
          try {
            if (Notification.permission === 'granted') {
              const f = audible[0]!
              const note = new Notification(f.hostTitle, {
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
      if (redirectCenterSnippets(view)) {
        openRightPanelRef.current('snippets')
        return
      }
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

  const openUnifiedSettings = useCallback((section: SettingsSection = 'general', anchor?: string | null) => {
    ensureMainVisible()
    setSettingsAnchor(anchor ?? null)
    saveSettingsSection(section)
    const title = tg('settings.title')
    const existing = tabsRef.current.find((t) => t.view === 'settings')
    if (existing) {
      setTabs((prev) => prev.map((t) => (t.tabId === existing.tabId ? { ...t, settingsSection: section, title } : t)))
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
        view: 'settings',
        settingsSection: section
      }
    ])
    setActiveTabId(tabId)
  }, [ensureMainVisible])
  openSettingsRef.current = openUnifiedSettings

  /** IX-7: long editors dock on the workbench. Short confirms stay on App Modal. */
  const openClassifiedEditor = useCallback((id: Extract<EditorId, 'alert-rules' | 'alert-history'>) => {
    const plan = editorOpenPlan(id)
    if (plan.placement === 'app-modal') return
    if (plan.placement === 'settings-anchor') {
      if (isSettingsSection(plan.anchor)) openUnifiedSettings(plan.anchor)
      return
    }
    openWorkbench(id === 'alert-history' ? { filter: 'all' } : undefined)
    setRulesDock({ nonce: Date.now(), tab: id === 'alert-history' ? 'history' : 'rules' })
  }, [openUnifiedSettings, openWorkbench])

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
      const owner = tabsRef.current.find((t) => t.sessionId === info.sessionId && (!t.view || t.view === 'session'))
      const tabId = uuid()
      setTabs((prev) => [
        ...prev,
        {
          tabId,
          sessionId: '',
          title: info.name,
          connectOpts: info.connectOpts ?? owner?.connectOpts ?? PLACEHOLDER_CONNECT,
          status: 'connected',
          view: 'remote-file',
          boundSessionId: info.sessionId,
          remotePath: info.remotePath,
          profileId: owner?.profileId
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
                  kind: 'ssh' as const,
                  failRaw: undefined
                }
              : t
          )
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        setErrorRaw(msg)
        setTabs((prev) =>
          prev.map((t) => (t.tabId === tabId ? { ...t, status: 'disconnected' as const, failRaw: msg } : t))
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
        const demoTitle =
          (!t.view || t.view === 'session') && t.profileId === DEMO_PROFILE_ID && !t.customTitle
            ? profileSidebarLabel(
                profilesRef.current.find((p) => p.id === DEMO_PROFILE_ID) ?? {
                  id: DEMO_PROFILE_ID,
                  label: '',
                  host: DEMO_HOST,
                  port: 22,
                  username: DEMO_USER
                },
                locale
              )
            : null
        const title =
          demoTitle && !profilesRef.current.find((p) => p.id === DEMO_PROFILE_ID)?.demoRenamed
            ? demoTitle
            : t.view === 'home'
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
  const wakingRef = useRef<string | null>(null)
  useEffect(() => {
    if (!sessionsReady || bootedRef.current) return
    bootedRef.current = true
    // planColdStart applies workspaceRestoreRows, isExplicitEmptyWorkspace, and planRestore.
    // autoConnect is only the explicit 「上次会话」 path. The default layout restore does not SSH.
    const plan = planColdStart({
      mode: loadStartupMode(),
      restoreLayout: loadRestoreLayout(),
      saved: loadLastWorkspace(),
      knownProfileIds: new Set(profilesRef.current.map((p) => p.id)),
      titleFor: (id) => profilesRef.current.find((p) => p.id === id)?.label || id
    })
    if (plan.kind === 'blank') return
    if (plan.skipped) showToast(tg('restore.skipped', { n: plan.skipped }))
    if (plan.kind === 'home') {
      if (plan.empty) showToast(tg('restore.emptyWorkspace'))
      openHomeRef.current()
      return
    }
    const next: Tab[] = plan.tabs.map((row) => {
      const tabId = uuid()
      const profile = row.profileId ? profilesRef.current.find((p) => p.id === row.profileId) : undefined
      const needsSession = row.kind === 'terminal' || row.kind === 'monitor' || row.kind === 'toolbox' || row.kind === 'sftp'
      return {
        tabId,
        sessionId: '',
        title: row.title,
        connectOpts: profile ? connectOptsFromProfile(profile) : PLACEHOLDER_CONNECT,
        status: row.kind === 'terminal' ? 'disconnected' : 'connected',
        view: row.kind === 'terminal' ? undefined : (row.kind as TabView),
        profileId: row.profileId,
        hostInventoryId: profile?.hostInventoryId,
        toolboxTab: row.toolboxTab as ServerToolsTab | undefined,
        focusAlertId: row.focusAlertId,
        settingsSection: isSettingsSection(row.settingsSection) ? row.settingsSection : undefined,
        playbookId: row.playbookId,
        cold: plan.autoConnect && needsSession,
        restored: !plan.autoConnect && needsSession
      } satisfies Tab
    })
    setTabs(next)
    setActiveTabId(next[plan.activeIndex]!.tabId)
  }, [sessionsReady])
  const coldActiveId = tabs.find((t) => t.tabId === activeTabId && t.cold)?.tabId ?? null
  useEffect(() => {
    if (!sessionsReady || !activeTabId) return
    const tab = tabsRef.current.find((t) => t.tabId === activeTabId && t.cold)
    if (!tab || wakingRef.current === tab.tabId) return
    wakingRef.current = tab.tabId
    const clearCold = (patch?: Partial<Tab>) => {
      if (wakingRef.current === tab.tabId) wakingRef.current = null
      setTabs((prev) => prev.map((t) => (t.tabId === tab.tabId ? { ...t, cold: false, ...patch } : t)))
    }
    if (!tab.view || tab.view === 'session') {
      void reconnectTabRef.current(tab.tabId).finally(() => clearCold())
      return
    }
    if (tab.view === 'sftp' || tab.view === 'monitor' || tab.view === 'toolbox') {
      const live = tabsRef.current.find(
        (t) => t.profileId && t.profileId === tab.profileId && t.sessionId && t.status === 'connected' && (!t.view || t.view === 'session')
      )
      if (live?.sessionId) {
        clearCold({ boundSessionId: live.sessionId })
        return
      }
      const term = tabsRef.current.find(
        (t) => t.tabId !== tab.tabId && t.profileId === tab.profileId && (!t.view || t.view === 'session')
      )
      if (term) {
        void reconnectTabRef.current(term.tabId).then((sid) => {
          clearCold(sid ? { boundSessionId: sid, restoreFailed: false } : { restoreFailed: true })
        })
        return
      }
      const profile = tab.profileId ? profilesRef.current.find((p) => p.id === tab.profileId) : undefined
      if (!profile) {
        clearCold({ restoreFailed: true })
        return
      }
      void connectProfile(profile).then((sid) => {
        clearCold(sid ? { boundSessionId: sid, restoreFailed: false } : { restoreFailed: true })
        if (!sid) showToast(tg('restore.fail', { host: profile.host, reason: lastConnectErrorRef.current || '' }))
      })
      return
    }
    clearCold()
  }, [activeTabId, coldActiveId, sessionsReady, connectProfile])
  useEffect(() => {
    setTabs((prev) => {
      let changed = false
      const next = prev.map((t) => {
        if (t.view !== 'monitor' && t.view !== 'toolbox' && t.view !== 'sftp') return t
        if (t.boundSessionId || !t.profileId) return t
        const live = prev.find(
          (s) =>
            s.profileId === t.profileId &&
            s.sessionId &&
            s.status === 'connected' &&
            (!s.view || s.view === 'session')
        )
        if (!live?.sessionId) return t
        changed = true
        return { ...t, boundSessionId: live.sessionId, cold: false, restoreFailed: false }
      })
      return changed ? next : prev
    })
  }, [tabs])
  const restoreArmedAt = useRef(new Map<string, number>())
  const workspaceReady = useRef(false)
  useEffect(() => {
    const now = Date.now()
    const watching = restoreWatchIds(tabs, activeTabId)
    const ids = new Set(watching)
    for (const id of [...restoreArmedAt.current.keys()]) if (!ids.has(id)) restoreArmedAt.current.delete(id)
    for (const id of watching) if (!restoreArmedAt.current.has(id)) restoreArmedAt.current.set(id, now)
    const timer = window.setInterval(() => {
      const due = [...restoreArmedAt.current.entries()].filter(([, at]) => Date.now() - at >= RESTORE_BIND_MS).map(([id]) => id)
      if (!due.length) return
      for (const id of due) restoreArmedAt.current.delete(id)
      setTabs((prev) => prev.map((t) => (due.includes(t.tabId) && !t.boundSessionId ? { ...t, cold: false, restoreFailed: true } : t)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [tabs, activeTabId])
  useEffect(() => {
    if (!sessionsReady || !bootedRef.current) return
    if (!workspaceReady.current) {
      workspaceReady.current = true
      return
    }
    const snapshot = snapshotWorkspace(tabs, activeTabId)
    const ids = [...new Set(snapshot.filter((row) => row.kind === 'terminal' && row.profileId).map((row) => row.profileId!))]
    saveLastWorkspace({ profileIds: snapshot.length ? ids : [], tabs: snapshot })
  }, [tabs, sessionsReady, activeTabId])
  const renameProfile = useCallback(
    async (p: SavedSessionProfile) => {
      setSessionMenu(null)
      const next = await askText(tg('ctx.renameTitle'), p.label?.trim() || `${p.username}@${p.host}`)
      if (next == null || !next.trim()) return
      const renamed = next.trim()
      void persistSessionState({
        folders,
        profiles: profiles.map((x) =>
          x.id === p.id ? { ...x, label: renamed, ...(p.id === DEMO_PROFILE_ID ? { demoRenamed: true } : {}) } : x
        )
      })
      if (p.id === DEMO_PROFILE_ID) {
        setTabs((prev) => prev.map((t) => (t.profileId === DEMO_PROFILE_ID && !t.customTitle && (!t.view || t.view === 'session') ? { ...t, title: renamed } : t)))
      }
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
      profile={{ ...p, label: profileSidebarLabel(p, locale) }}
      sessionReadonly={Boolean(sessionRo[p.id])}
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
      onOpenMenu={(e, entry) => {
        e.preventDefault()
        const multi = multiSelected.length >= 2 && multiSelected.includes(p.id) ? multiSelected : undefined
        if (!multi) {
          setMultiSelected([])
          setSelectedProfileId(p.id)
        }
        const el = e.currentTarget instanceof HTMLElement ? e.currentTarget : null
        const rect = entry === 'overflow' && el ? el.getBoundingClientRect() : null
        setSessionMenu({
          x: rect ? rect.left : e.clientX,
          y: rect ? rect.bottom : e.clientY,
          profile: p,
          multi,
          entry
        })
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
      const folder = folders.find((f) => f.id === folderId)
      const name = folder?.name ?? ''
      void askConfirm({
        id: 'confirm.deleteGroups',
        title: tg('confirm.deleteGroupTitle', { name }),
        body: tg('confirm.deleteGroupBody'),
        confirmText: tg('confirm.deleteGroup', { name }),
        danger: true
      }).then((ok) => {
        if (!ok) {
          setFolderMenu(null)
          return
        }
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
      })
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
      noteFailure(e, 'import')
    }
  }, [openImportPreview, profiles, noteFailure])

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
      const count = applied.added + applied.updated
      const ids = importedConnectIds({
        beforeIds: profiles.map((p) => p.id),
        afterIds: applied.profiles.map((p) => p.id),
        policy,
        conflictIds: importPreview.rows.flatMap((row) => (row.conflict && row.existingId ? [row.existingId] : []))
      })
      if (shouldShowImportMoment({ count, off: loadPrefFlag(IMPORT_HINT_OFF_KEY) })) setImportMoment({ count, ids })
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

  // L10-CANCEL-QUEUE-START
  const cancelBatchQueue = useCallback(() => {
    const queued = batchQueuedRef.current
    if (batchCancelRef.current || queued <= 0) return
    batchCancelRef.current = true
    batchQueuedRef.current = 0
    setBatchQueue((cur) => (cur ? { ...cur, queued: 0 } : cur))
    showToast(tg('l10.queueCancelled', { n: queued }))
  }, [])
  // L10-CANCEL-QUEUE-END

  // L10-CONNECT-MANY-START
  const connectMany = useCallback(async (hosts: BatchHost[]) => {
    const list = hostsByIds(
      hosts.map((host) => ({ id: host.id, label: host.label, folderId: host.folderId })),
      hosts.map((host) => host.id)
    )
    if (!list.length) {
      showToast(tg('l10.none'))
      return
    }
    if (batchBusyRef.current) {
      showToast(tg('l10.busy'))
      return
    }
    batchBusyRef.current = true
    batchCancelRef.current = false
    batchQueuedRef.current = 0
    ensureMainVisible()
    const ids = new Set(list.map((host) => host.id))
    setBatchFails((prev) => prev.filter((row) => !ids.has(row.id)))
    let didFocus = false
    const noteFail = (id: string, label: string, reason: string) => {
      setBatchFails((prev) => [...prev.filter((row) => row.id !== id), { id, label, reason }])
      showToast(tg('l10.fail', { host: label, reason }), { kind: 'error' })
    }
    try {
      const results = await runBatchConnect(list, BATCH_CONNECT_LIMIT, async (host) => {
        const shouldFocus = !didFocus
        if (shouldFocus) didFocus = true
        const profile = profilesRef.current.find((row) => row.id === host.id)
        if (!profile) {
          const reason = tg('l10.missing')
          noteFail(host.id, host.label || host.id, reason)
          return { ok: false, error: reason }
        }
        const label = profile.label?.trim() || host.label || `${profile.username}@${profile.host}`
        const tabsNow = tabsRef.current
        const target = pickBatchTarget(tabsNow, profile.id)
        if (target !== 'open' && shouldFocus) {
          const focusId = focusTabId(tabsNow, profile.id)
          if (focusId) setActiveTabId(focusId)
        }
        if (target === 'reuse') {
          setBatchFails((prev) => prev.filter((row) => row.id !== profile.id))
          return { ok: true, reused: true }
        }
        let error = ''
        const onError = (message: string) => {
          error = message
        }
        if (target === 'reconnect') {
          const tabId = reconnectTabId(tabsNow, profile.id)
          if (!tabId) return { ok: false, error: tg('l10.missing') }
          const sid = await reconnectTabRef.current(tabId, { full: false, quiet: true, onError })
          if (sid) {
            setBatchFails((prev) => prev.filter((row) => row.id !== profile.id))
            return { ok: true }
          }
          if (!error) return { ok: true, skipped: true }
          noteFail(profile.id, label, error)
          return { ok: false, error }
        }
        const sid = await openSession(connectOptsFromProfile(profile), {
          profileId: profile.id,
          hostInventoryId: profile.hostInventoryId,
          quiet: true,
          focus: shouldFocus,
          onError
        })
        if (sid) {
          setBatchFails((prev) => prev.filter((row) => row.id !== profile.id))
          return { ok: true }
        }
        if (!error) return { ok: true, skipped: true }
        noteFail(profile.id, label, error)
        return { ok: false, error }
      }, {
        isCancelled: () => batchCancelRef.current,
        onProgress: (progress) => {
          batchQueuedRef.current = progress.queued
          setBatchQueue({ queued: progress.queued, total: progress.total, started: progress.started })
        }
      })
      const summary = summarizeBatch(results)
      if (summary.fail > 1) showToast(tg('l10.summary', { ok: summary.ok, fail: summary.fail }), { kind: 'error' })
      else if (summary.fail === 0 && summary.ok > 1) showToast(tg('l10.done', { n: summary.ok }))
      if (results.some((row) => row.ok && !row.reused && !row.skipped)) onFirstConnectRef.current()
    } finally {
      batchBusyRef.current = false
      batchCancelRef.current = false
      batchQueuedRef.current = 0
      setBatchQueue(null)
    }
  }, [ensureMainVisible, openSession])
  connectManyRef.current = connectMany
  // L10-CONNECT-MANY-END

  const handleTitlebarMenuAction = useCallback(
    (action: TitlebarMenuAction) => {
      if (action === 'explainSelection') {
        const sel = currentTerminalSelection()
        void requestSelectionExplain({ sessionId: sel?.sessionId ?? '', text: sel?.text ?? '' }).then((status) => {
          if (status === 'empty') showToast(tg('a6.needSelection'))
        })
        return
      }
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
      if (action === 'replayWelcome') {
        setTourOpen(false)
        setTourExplicit(false)
        setTourQueued(false)
        setQuickOpen(false)
        setQuickExplicit(false)
        setWelcomeReplay(true)
        setWelcomeDismissed(false)
        saveWelcomeDismissed(false)
        return
      }
      if (action === 'tour') {
        setQuickOpen(false)
        setQuickExplicit(false)
        setTourExplicit(true)
        setTourOpen(true)
        return
      }
      if (action === 'quickStart') {
        setTourOpen(false)
        setTourExplicit(false)
        setTourQueued(false)
        saveQuickDone(false)
        setQuickDone(false)
        const hasHost = profilesRef.current.length > 0
        setQuickResume(hasHost)
        setQuickStep(hasHost ? 2 : 1)
        setQuickExplicit(true)
        setQuickOpen(true)
        return
      }
      if (action === 'enableRuleTemplates') {
        openM2('alert-rules', tg('o2.rulesTitle'), { rulesSeg: 'templates' })
        return
      }
      if (action === 'retryFailedProbes') {
        if (!tabsRef.current.some((tab) => tab.view === 'home') || probeFailCountRef.current === 0) return
        setRetryAllNonce((n) => n + 1)
        return
      }
      if (action === 'exportPlaybookPack') {
        openM2('playbook-list', tg('m2.playbooks'))
        window.setTimeout(() => window.dispatchEvent(new Event('aiss-export-share')), 60)
        return
      }
      if (action === 'importPlaybookPack') {
        openM2('playbook-import', tg('w5.import'))
        return
      }
      if (action === 'gateTimeline') {
        openM2('gate-timeline', tg('s2b.tab'))
        return
      }
      if (action === 'maintOpen' || action === 'maintEnd') {
        openMaintenance()
        return
      }
      if (action === 'setDryRunReminder') {
        openM2('playbook-list', tg('m2.playbooks'))
        window.setTimeout(() => window.dispatchEvent(new Event(REMINDER_FILTER_EVENT)), 60)
        return
      }
      if (action === 'aiPostmortem') {
        const focus = tabsRef.current.find((t) => t.view === 'alert-workbench')?.focusAlertId
        const alert = (focus ? loadAlertHistory().find((a) => a.id === focus) : undefined) ?? loadAlertHistory().find((a) => a.status === 'active')
        if (!alert) {
          showToast(tg('w1.paletteNeedAlert'))
          return
        }
        openPostmortemAi(alert)
        return
      }
      if (action === 'explainDiff' || action === 'diffFixPlaybook') {
        const diff = tabsRef.current.find((t) => t.view === 'file-diff' && t.tabId === activeTabId) ?? tabsRef.current.find((t) => t.view === 'file-diff')
        if (!diff) {
          showToast(tg('l8b.needDiff'))
          return
        }
        setActiveTabId(diff.tabId)
        const name = action === 'explainDiff' ? 'aiss-diff-explain' : 'aiss-diff-create'
        window.setTimeout(() => window.dispatchEvent(new Event(name)), 60)
        return
      }
      if (action === 'taskCards') {
        const next = reopenTasks()
        setTaskState(next)
        setTasksManual(true)
        return
      }
      if (action === 'switchTab') {
        tabOverflowFromRef.current = 'palette'
        setTabQuery('')
        setTabListIndex(0)
        const width = 280
        setTabOverflowPos({ top: 40, left: Math.max(8, window.innerWidth - width - 16) })
        setTabOverflowOpen(true)
        return
      }
      if (action === 'refreshHomeHealth') {
        if (!tabsRef.current.some((t) => t.view === 'home')) return
        setProbeNonce((n) => n + 1)
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
        openUnifiedSettings('about')
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
        openSftpTransfer(undefined, { alignCwd: true })
        return
      }
      if (action === 'folderSync') {
        const armed = takeArmedFolderSync()
        requestFolderSync(armed.set ? armed.profileId : undefined)
        openSftpTransfer(undefined, { alignCwd: true })
        return
      }
      if (action === 'smartComplete') {
        const cur = loadSmartPrefs()
        const next = saveSmartPrefs({ ...cur, enabled: !cur.enabled })
        toastUndo({
          message: tg(next.enabled ? 'pref.turnedOn' : 'pref.turnedOff', { name: tg('menu.smartComplete') }),
          undo: () => {
            saveSmartPrefs(cur)
          }
        })
        return
      }
      if (action === 'clearHostHistory') {
        const tab =
          tabsRef.current.find((x) => x.tabId === activeTabId && (!x.view || x.view === 'session') && x.kind !== 'local') ||
          tabsRef.current.find((x) => (!x.view || x.view === 'session') && x.kind !== 'local' && x.status === 'connected')
        const hk = tab ? sessionHostKey(tab) : ''
        const { removed, dropped } = clearHostHistory(hk)
        toastUndo({
          message: tg('x1.cleared', { n: removed }),
          undo: () => restoreSmartEntries(dropped)
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
      if (action === 'exportAudit') {
        const ctx = peekAuditExportContext()
        const tab = tabsRef.current.find((t) => t.view === 'audit')
        setAuditEvents(loadAudit())
        auditExportNonce.current += 1
        setAuditExport({ nonce: auditExportNonce.current, seed: ctx ?? { range: '7d', host: tab?.auditHost || '' } })
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
        openUnifiedSettings('general')
        return
      }
      if (action === 'alertRules') {
        openClassifiedEditor('alert-rules')
        return
      }
      if (action === 'alertHistory') {
        if (bellPrefs.mode === 'drawer') openClassifiedEditor('alert-history')
        else openWorkbench({ filter: 'all' })
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
      if (action === 'batchConnect') {
        const ids = multiSelectedRef.current.length ? multiSelectedRef.current : selectedProfileId ? [selectedProfileId] : []
        const hosts = hostsByIds(profilesRef.current, ids)
        if (!hosts.length) {
          showToast(tg('l10.none'))
          return
        }
        void connectManyRef.current(hosts)
        return
      }
      if (action === 'batchConnectGroup') {
        const planned = planPaletteGroup(profilesRef.current, selectedProfileId)
        if (!planned.ok) {
          showToast(tg(planned.reason === 'ungrouped' ? 'l10.ungrouped' : 'l10.emptyGroup'))
          return
        }
        void connectManyRef.current(planned.hosts)
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
      if (action === 'openProdGuard') {
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
            : undefined,
          true
        )
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
        openUnifiedSettings('about')
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
        openUnifiedSettings('backup')
        return
      }
      if (action === 'serverTools') {
        openToolTabRef.current('toolbox')
        return
      }
      if (action === 'openDocker') {
        const sid = activeSessionIdRef.current
        if (!sid || connectedSshSessionsRef.current.length === 0) {
          pendingLocateRef.current = 'docker'
          setHostPicker({ action: 'serverTools', feature: 'Docker' })
          return
        }
        openToolTabRef.current('toolbox', sid, undefined, 0, 'docker')
        return
      }
      if (action === 'setJumpHosts' || action === 'checkCerts') {
        const tab = tabsRef.current.find((x) => x.tabId === activeTabId && (!x.view || x.view === 'session'))
        const profile = profilesRef.current.find((p) => p.id === tab?.profileId) ?? profilesRef.current.find((p) => p.id === selectedProfileId)
        openConnectionEditor(profile, action === 'setJumpHosts' ? 'jump' : 'cert')
        return
      }
      if (action === 'testJump') {
        const tab = tabsRef.current.find((x) => x.tabId === activeTabId)
        const profile = profilesRef.current.find((p) => p.id === tab?.profileId)
        const opts = profile ? connectOptsFromProfile(profile) : tab?.connectOpts
        if (!opts?.host) {
          showToast(tg('toolbar.needSession'))
          return
        }
        void window.aiss.ssh.probeJump(opts).then((rows) => {
          const bad = rows.find((r) => !r.ok)
          showToast(
            bad
              ? tg('m2.hopReason', { i: bad.hop, name: bad.name, addr: bad.addr, reason: bad.reason || '' })
              : tg('m2.hopOk', { n: rows.length, ms: rows[rows.length - 1]?.ms ?? 0 })
          )
        }).catch((e) => showToast(e instanceof Error ? e.message : String(e), { kind: 'error' }))
        return
      }
      if (action === 'syncConflicts') {
        openM2('sync-conflicts', tg('m2.conflicts'))
        return
      }
      if (action === 'syncPreview') {
        const ex = tabsRef.current.find((t) => t.view === 'sync-preview')
        if (ex) setActiveTabId(ex.tabId)
        else openM2('sync-settings', tg('m2.cloudSync'))
        return
      }
      if (action === 'settings') {
        openUnifiedSettings(sectionForAction('settings') ?? 'general')
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
        openRightPanelRef.current('ai')
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
      if (action === 'reconnectPolicy') {
        openUnifiedSettings('connections', 'l9-reconnect')
        return
      }
      if (action === 'reconnectNow') {
        const tab = tabs.find((x) => x.tabId === activeTabId)
        const subject = tab && tab.status === 'disconnected' && (!tab.view || tab.view === 'session')
          ? tab
          : tabs.find((x) => x.sessionId && x.sessionId === tab?.boundSessionId && x.status === 'disconnected')
        if (!subject) {
          showToast(tg('toolbar.needSession'))
          return
        }
        haltedRef.current.delete(subject.tabId)
        const cur = autoRetryRef.current.get(subject.tabId)
        if (cur) clearTimeout(cur.timer)
        autoRetryRef.current.delete(subject.tabId)
        void reconnectTab(subject.tabId, { full: false }).then((sid) => {
          if (sid) cancelAutoReconnect(subject.tabId)
          else if (policyRef.current.mode !== 'off') scheduleAutoReconnectRef.current(subject.tabId)
        })
        return
      }
      if (action === 'readonlyOn' || action === 'readonlyOff' || action === 'setProtection') {
        const tab = tabs.find((x) => x.tabId === activeTabId) ?? tabs.find((x) => x.profileId && (!x.view || x.view === 'session'))
        if (action === 'setProtection') {
          handleTitlebarMenuAction('openProdGuard')
          return
        }
        if (!tab) {
          showToast(tg('toolbar.needSession'))
          return
        }
        const id = tab.profileId || tab.tabId
        const on = Boolean(sessionRo[id]) || effectiveLevel(profiles.find((p) => p.id === tab.profileId)) === 'readonly'
        if (action === 'readonlyOn' && on) return
        if (action === 'readonlyOff' && !on && effectiveLevel(profiles.find((p) => p.id === tab.profileId)) !== 'readonly') return
        toggleSessionReadonly(tab)
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
      if (action === 'snippets') {
        openRightPanelRef.current('snippets')
        return
      }
      if (action === 'builtinSnippets') {
        openRightPanelRef.current('snippets', { previewBuiltin: true })
        return
      }
      if (action === 'builtinPlaybooks') {
        openM2('playbook-list', tg('m2.playbooks'))
        window.setTimeout(() => window.dispatchEvent(new Event('aiss-builtin-playbooks')), 60)
        return
      }
      if (action === 'fixPlaybook') {
        if (!tabsRef.current.some((t) => t.view === 'alert-workbench')) {
          showToast(tg('w1.paletteNeedAlert'))
          return
        }
        if (!aiConfigured) {
          showToast(tg('w1.needAi'), { action: { label: tg('w1.configure'), run: () => openUnifiedSettings('ai') } })
          return
        }
        const tab = tabsRef.current.find((t) => t.view === 'alert-workbench')
        if (tab) setActiveTabId(tab.tabId)
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('aiss-fix-playbook')), 0)
        return
      }
      if (action === 'exportPostmortem') {
        if (!tabsRef.current.some((t) => t.view === 'alert-workbench')) {
          showToast(tg('w1.paletteNeedAlert'))
          return
        }
        const tab = tabsRef.current.find((t) => t.view === 'alert-workbench')
        if (tab) setActiveTabId(tab.tabId)
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('aiss-export-postmortem')), 0)
        return
      }
      if (action === 'dryRunPlaybook') {
        const run = tabsRef.current.find((t) => t.view === 'playbook-run')
        if (!run) {
          const books = loadPlaybooks()
          if (!books.length) {
            showToast(tg('m2.noPlaybooks'))
            return
          }
          const latest = books.reduce((a, b) => ((b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a))
          openM2('playbook-run', tg('m2.run'), { playbookId: latest.id })
          return
        }
        setActiveTabId(run.tabId)
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('aiss-dry-run')), 0)
        return
      }
      if (action === 'fileSnapshots') {
        const active = tabsRef.current.find((t) => t.tabId === activeTabId)
        const file = active?.view === 'remote-file' || active?.view === 'file-history' ? active : tabsRef.current.find((t) => t.view === 'remote-file')
        const session = tabsRef.current.find((t) => (!t.view || t.view === 'session') && t.sessionId && t.tabId === activeTabId)
          ?? tabsRef.current.find((t) => (!t.view || t.view === 'session') && t.sessionId && t.status === 'connected')
        const profileId = file?.profileId || session?.profileId || ''
        if (!profileId) {
          showToast(tg('w3.empty'))
          return
        }
        openFileHistory({
          profileId,
          path: file?.remotePath,
          sessionId: file?.boundSessionId || session?.sessionId,
          hostLabel: session?.title || file?.title || '',
          connectOpts: file?.connectOpts.host ? file.connectOpts : session?.connectOpts
        })
        return
      }
      if (action === 'toggleBlockStrip') {
        window.dispatchEvent(new CustomEvent('aiss-toggle-block-strip'))
        return
      }
      if (action === 'ai' || action === 'terminalPrefs' || action === 'uiTheme' || action === 'mcpGuide') {
        openUnifiedSettings(sectionForAction(action) ?? 'general')
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
      openUnifiedSettings,
      selectedProfileId,
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
      cancelAutoReconnect,
      toggleSessionReadonly,
      profiles,
      sessionRo,
      openSession,
      openHome,
      openWorkbench,
      openClassifiedEditor,
      openAudit,
      openM2,
      bellPrefs.mode,
      aiConfigured,
      openFileHistory,
      openMaintenance,
      openPostmortemAi
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
  const openSftpFromHost = useCallback((p: SavedSessionProfile) => {
    setSessionMenu(null)
    const live = tabsRef.current.find(
      (x) => x.profileId === p.id && x.status === 'connected' && x.sessionId && (!x.view || x.view === 'session') && x.kind !== 'local'
    )
    if (live?.sessionId) {
      openSftpTransfer(live.sessionId, { alignCwd: false })
      return
    }
    const tabId = openSftpTransfer(undefined, { alignCwd: false, profile: p })
    if (!tabId) return
    void ensureProfileSession(p).then((sid) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.tabId === tabId
            ? {
                ...t,
                status: sid ? 'connected' : 'disconnected',
                boundSessionId: sid || undefined,
                restoreFailed: !sid
              }
            : t
        )
      )
      setActiveTabId(tabId)
      if (!sid) showToast(tg('ctx.connectFailed', { reason: tg('ctx.seeError') }), { kind: 'error' })
    })
    setActiveTabId(tabId)
  }, [ensureProfileSession, openSftpTransfer])

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
        { id: 'confirm.deleteConnections', danger: true, okLabel: ids.length > 1 ? tg('ctx.deleteMany', { n: ids.length }) : tg('app.delete') }
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

  const quickDecidedRef = useRef(false)
  useEffect(() => {
    if (!sessionsReady || !bootNoted || quickDecidedRef.current) return
    quickDecidedRef.current = true
    const decision = decideQuickStart({
      fresh: loadFreshProfile(),
      quickDone: loadQuickDone(),
      hostCount: profilesRef.current.length,
      whatsNewOpen
    })
    if (!decision.show) return
    const welcome = loadWelcomePrefs()
    if (profilesRef.current.length === 0 && !welcome.completed) return
    setQuickResume(decision.resume)
    setQuickStep(decision.resume ? 2 : 1)
    setQuickOpen(true)
  }, [sessionsReady, bootNoted, whatsNewOpen])

  useEffect(() => {
    if (whatsNewOpen) setWelcomeNotesHeld(true)
  }, [whatsNewOpen])

  useEffect(() => {
    if (!sessionsReady || profiles.length < 1 || welcomeCompleted) return
    const seen = welcomeSeen.current
    const replay = welcomeReplay
    saveWelcomeCompleted(true)
    setWelcomeCompleted(true)
    setWelcomeReplay(false)
    if (seen && !importMoment && !firstConnectPending) showToast(tg('pf1.ready'), { ms: 1500 })
    if (
      shouldOfferTourAfterWelcome({
        welcomeWasVisible: seen,
        completedNow: true,
        tourDone: localStorage.getItem(TOUR_DONE_KEY) === '1',
        replay
      })
    ) {
      setTourQueued(true)
    }
  }, [sessionsReady, profiles.length, welcomeCompleted, welcomeReplay, importMoment, firstConnectPending])

  const dismissWelcome = useCallback(() => {
    saveWelcomeDismissed(true)
    setWelcomeDismissed(true)
    setWelcomeReplay(false)
  }, [])

  useEffect(() => {
    if (!quickOpen || quickStep !== 1 || profiles.length === 0) return
    setQuickResume(true)
    setQuickStep(2)
  }, [profiles.length, quickOpen, quickStep])

  useEffect(() => {
    const onGate = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; hostKey?: string }>).detail
      openM2('gate-timeline', tg('s2b.tab'), { gateFocusId: detail?.id, gateHost: detail?.hostKey })
    }
    const onImport = () => openM2('playbook-import', tg('w5.import'))
    const onDrag = (event: DragEvent) => {
      const items = event.dataTransfer?.items
      if (!items) return
      for (const item of items) {
        if (item.kind === 'file') {
          event.preventDefault()
          return
        }
      }
    }
    const onDrop = (event: DragEvent) => {
      const file = Array.from(event.dataTransfer?.files ?? []).find((row) => row.name.endsWith('.aiss-playbooks'))
      if (!file) return
      event.preventDefault()
      void file.text().then((raw) => {
        stageShareImport({ name: file.name, raw })
        openM2('playbook-import', tg('w5.import'))
      })
    }
    window.addEventListener('aiss-open-gate', onGate)
    window.addEventListener('aiss-import-share', onImport)
    window.addEventListener('dragover', onDrag)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('aiss-open-gate', onGate)
      window.removeEventListener('aiss-import-share', onImport)
      window.removeEventListener('dragover', onDrag)
      window.removeEventListener('drop', onDrop)
    }
  }, [openM2])

  const finishQuick = useCallback((next?: 'home' | 'term') => {
    saveQuickDone(true)
    setQuickDone(true)
    setQuickOpen(false)
    setQuickExplicit(false)
    if (next === 'home') openHomeRef.current()
    else if (next === 'term') {
      const live = tabsRef.current.find((tab) => (!tab.view || tab.view === 'session') && tab.status === 'connected')
      if (live) setActiveTabId(live.tabId)
      else {
        const profile = profilesRef.current[0]
        if (profile) openOrFocusProfile(profile)
      }
    }
  }, [openOrFocusProfile])

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
      }       else if (action === 'aiCommand') window.setTimeout(() => enterAiMode(sid), 120)
      else if (action === 'toggleRecording') {
        void window.aiss.ssh.startRecording(sid).then((path) => {
          if (!path) return
          setRecordingSessionId(sid)
          setRecordingStartedAt(Date.now())
        }).catch(() => undefined)
      }
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
  useEffect(() => {
    const onSelection = (e: Event) => {
      const d = (e as CustomEvent<SelectionExplainDetail>).detail
      if (!d?.sessionId || !d.text) return
      const tab = tabsRef.current.find((x) => x.sessionId === d.sessionId)
      selectionExplainSeqRef.current += 1
      setSelectionExplain({
        id: selectionExplainSeqRef.current,
        sessionId: d.sessionId,
        text: d.text,
        host: tab ? tab.connectOpts.label?.trim() || tab.title : undefined
      })
    }
    window.addEventListener(SELECTION_EXPLAIN_EVENT, onSelection)
    return () => window.removeEventListener(SELECTION_EXPLAIN_EVENT, onSelection)
  }, [])
  const ensureAiVisible = useCallback(() => {
    updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
  }, [updateLayout])
  const closeTour = useCallback(() => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1')
    } catch {
      /* ignore */
    }
    setTourOpen(false)
    setTourExplicit(false)
    const state = loadTaskState()
    setTaskState(state)
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
      const owner = tabsRef.current.find((t) => t.sessionId === info.sessionId && (!t.view || t.view === 'session'))
      const profile = profilesRef.current.find((p) => p.id === owner?.profileId)
      const fileCompare = {
        leftName: info.localName,
        rightName: info.remoteName,
        leftText,
        rightText,
        tooLarge: large,
        remotePath: info.remotePath,
        sessionId: info.sessionId,
        hostKey: profile?.id || owner?.profileId || info.sessionId,
        hostTitle: owner?.title || profile?.label || profile?.host || ''
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

  // IX-6: close-control tooltip follows whether a terminal currently has keyboard focus.
  const [terminalFocused, setTerminalFocused] = useState(false)
  useEffect(() => {
    const sync = () => {
      const el = document.activeElement
      const next = Boolean(el instanceof Element && el.closest('.xterm'))
      setTerminalFocused((prev) => (prev === next ? prev : next))
    }
    const onBlur = () => setTerminalFocused(false)
    document.addEventListener('focusin', sync, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('focusin', sync, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // UX-01/UX-02: every shortcut comes from the keymap registry; plain Ctrl+letter stays with a focused terminal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const inTerminal = Boolean(el?.closest('.xterm'))
      const scopes: Array<'alertWorkbench' | 'playbookRun' | 'fileHistory' | 'blocks'> = []
      if (!inTerminal) {
        const view = tabsRef.current.find((t) => t.tabId === activeTabIdRef.current)?.view
        if (view === 'alert-workbench') scopes.push('alertWorkbench')
        if (view === 'playbook-run') scopes.push('playbookRun')
        if (view === 'file-history' || view === 'remote-file') scopes.push('fileHistory')
      }
      if (el?.closest('.term-blocks')) scopes.push('blocks')
      const action = matchKeymap(e, inTerminal, scopes)
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      // IX-6: Ctrl+W closes outside a terminal. Inside one, only Ctrl+Shift+W matches.
      // A dialog that is already open is not a close, so the chord cannot kill a tab underneath it.
      if (action === 'closeTab') {
        if (isDialogOpen()) return
        const tab = tabsRef.current.find((t) => t.tabId === activeTabIdRef.current)
        if (tab) closeTabRef.current(tab.tabId, tab.sessionId, tab.status, tab.view)
        return
      }
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

  const welcomeBlocked = tabs.some((t) => t.view === 'connection' || t.view === 'import-preview')
  const welcomeEligible = coldStartShowsWelcome({
    sessionsReady,
    bootNoted,
    hostCount: profiles.length,
    dismissed: welcomeDismissed,
    completed: welcomeCompleted,
    releaseNotesOpen: whatsNewOpen,
    notesHeld: welcomeNotesHeld,
    replay: welcomeReplay,
    workspaceBlocked: welcomeBlocked,
    tourOpen: false,
    quickOpen: false
  })
  const tasksEligible =
    tasksManual ||
    ((quickDone || localStorage.getItem(TOUR_DONE_KEY) === '1') &&
      !tipsSnooze &&
      !tipsDismissed &&
      !taskState.dismissedForever &&
      pendingTasks(taskState).length > 0)
  const updateRequested = updateModalOpen && Boolean(updateInfo)
  const product = pickProductOverlay({
    systemUpdate: updateRequested,
    releaseNotes: whatsNewOpen,
    welcome: welcomeEligible,
    tour: tourOpen,
    tourExplicit,
    quickStart: quickOpen,
    quickExplicit,
    tasks: tasksEligible
  })
  const productDimmers = productBackdropCount(product)
  const showWelcome = product === 'welcome'
  if (showWelcome) welcomeSeen.current = true
  const valueKind = pickValueMoment({
    importCount: importMoment?.count ?? null,
    firstConnect: firstConnectPending,
    blocked: valueMomentBlockedByProduct(product)
  })
  onFirstConnectRef.current = () => {
    let versionKnown = true
    try {
      versionKnown = localStorage.getItem('aiss.lastSeenVersion') != null
    } catch {
      versionKnown = true
    }
    const decision = decideFirstConnect({
      fresh: loadFreshProfile() || !versionKnown,
      off: loadPrefFlag(FIRST_CONNECT_OFF_KEY),
      seen: loadPrefFlag(FIRST_CONNECT_SEEN_KEY)
    })
    if (decision === 'stamp') savePrefFlag(FIRST_CONNECT_SEEN_KEY, true)
    if (decision === 'show') setFirstConnectPending(true)
  }

  useEffect(() => {
    if (!tourQueued || tourOpen) return
    if (product === 'welcome' || product === 'releaseNotes' || product === 'quickStart' || product === 'systemUpdate') return
    if (valueKind) return
    if (admitProductOverlay(product, 'tour') === 'refuse') return
    setTourQueued(false)
    setTourExplicit(false)
    setTourOpen(true)
  }, [tourQueued, tourOpen, product, valueKind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const target = escProductTarget({
        product,
        higherChrome: isHigherChromeOpen(document),
        modalBackdrops: document.querySelectorAll('.modal-backdrop').length
      })
      if (!target || target === 'releaseNotes' || target === 'systemUpdate') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (target === 'welcome') dismissWelcome()
      else if (target === 'tour') closeTour()
      else if (target === 'quickStart') finishQuick()
      else if (target === 'tasks') {
        setTipsSnooze(true)
        setTasksManual(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [product, dismissWelcome, closeTour, finishQuick])

  const productLayerOpen = product != null
  const productFocusRef = useRef<ReturnType<typeof bindProductFocus> | null>(null)
  if (!productFocusRef.current) productFocusRef.current = bindProductFocus()
  useLayoutEffect(() => {
    if (!productLayerOpen) return
    return productFocusRef.current?.activate()
  }, [productLayerOpen])

  const closeTip = tr(closeControlTipKey(terminalFocused))

  return (
    <div className="app-root" data-product-layer={product ?? 'none'} data-product-dimmers={productDimmers}>
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
      {valueKind ? (
        <ValueMomentBar
          kind={valueKind}
          importCount={importMoment?.count ?? 0}
          onConnectAll={() => {
            const ids = importMoment?.ids ?? []
            setImportMoment(null)
            void (async () => {
              for (const id of ids) {
                const row = profilesRef.current.find((p) => p.id === id)
                if (row) await connectProfile(row)
              }
            })()
          }}
          onView={() => {
            const id = importMoment?.ids[0]
            setImportMoment(null)
            updateLayout((prev) => ({ ...prev, showSidebar: true }))
            setSessionSearch('')
            if (id) setSelectedProfileId(id)
          }}
          onOpenHome={() => {
            for (const write of valueMomentDismissWrites('firstConnect', 'later')) savePrefFlag(write.key, write.on)
            setFirstConnectPending(false)
            openHome()
          }}
          onOpenSftp={() => {
            for (const write of valueMomentDismissWrites('firstConnect', 'later')) savePrefFlag(write.key, write.on)
            setFirstConnectPending(false)
            handleTitlebarMenuAction('sftp')
          }}
          onNever={() => {
            if (!valueKind) return
            for (const write of valueMomentDismissWrites(valueKind, 'never')) savePrefFlag(write.key, write.on)
            if (valueKind === 'import') setImportMoment(null)
            else setFirstConnectPending(false)
          }}
          onDismiss={() => {
            if (!valueKind) return
            for (const write of valueMomentDismissWrites(valueKind, 'later')) savePrefFlag(write.key, write.on)
            if (valueKind === 'import') setImportMoment(null)
            else setFirstConnectPending(false)
          }}
        />
      ) : null}

      <div className="app-shell">
        {layout.showSidebar ? (
          <>
            <aside className="sidebar" style={{ width: layout.sidebarWidth, minWidth: layout.sidebarWidth }}>
              <div className="sidebar-header">
                <h3>{tr('sidebar.saved')}</h3>
                <SessionSearchBar value={sessionSearch} onChange={setSessionSearch} />
              </div>
              <div className="sidebar-scroll" tabIndex={0} onKeyDown={onSidebarKeyDown}>
                <RecentConnections
                  hideWhenEmpty={profiles.length === 0}
                  onQuickConnect={quickConnectRecent}
                  savedKeys={profiles.map((p) => `${p.username}@${p.host}:${p.port || 22}`)}
                  demoRenamed={profiles.some((p) => p.id === DEMO_PROFILE_ID && p.demoRenamed)}
                />
                {error && activeTab?.view !== 'connection' && (
                  <>
                  <ErrorNotice
                    message={error}
                    detail={errorKind === 'unreachable' ? [tg('pf5.sshWhy'), errorDetail].filter(Boolean).join('\n') : errorDetail}
                    actions={
                      <>
                        {errorKind === 'import' ? (
                          <>
                            <button type="button" onClick={() => void importSessionsPick()}>{tg('pf5.reselect')}</button>
                            <button type="button" onClick={() => showToast(tg('pf5.formatList'))}>{tg('pf5.formats')}</button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const id = failedProfileIdRef.current || selectedProfileId
                                const tab = tabs.find((x) => x.profileId === id && (!x.view || x.view === 'session') && x.status !== 'connected')
                                if (tab) void reconnectTab(tab.tabId)
                                else {
                                  const row = profiles.find((p) => p.id === id)
                                  if (row) void connectProfile(row)
                                }
                                setError(null)
                              }}
                            >
                              {errorKind === 'dropped' ? tg('pf5.reconnect') : tg('pf5.retry')}
                            </button>
                            {errorKind === 'auth' ? (
                              <button
                                type="button"
                                onClick={() => openConnectionEditor(profiles.find((p) => p.id === (failedProfileIdRef.current || selectedProfileId)))}
                              >
                                {tg('pf5.openKeys')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                if (errorKind === 'dropped') {
                                  setError(null)
                                  return
                                }
                                openConnectionEditor(profiles.find((p) => p.id === (failedProfileIdRef.current || selectedProfileId)))
                              }}
                            >
                              {errorKind === 'dropped' ? tg('pf5.later') : tg('pf5.editConn')}
                            </button>
                          </>
                        )}
                      </>
                    }
                  />
                  {errorRaw && showConnectionTrouble(errorKind, errorRaw) ? <ConnectTrouble raw={errorRaw} /> : null}
                  </>
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
                    icon="host"
                    title={tr('ux08.sidebarTitle')}
                    desc={tr('pf4.hostsDesc')}
                    primary={{ label: tr('pf1.new'), onClick: () => openConnectionEditor(), testId: 'empty-new-connection', tour: 'new-connection', command: 'connection' }}
                    secondary={[
                      { label: tr('pf1.import'), onClick: () => void importSessionsPick(), testId: 'empty-import', command: 'importSessions' },
                      { label: tr('pf4.tryDemo'), onClick: () => void addDemoHost(true), testId: 'empty-try-demo', command: 'demoHost' }
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
                          <Twist open={expanded} />
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
          <div className="tab-bar" ref={tabBarRef}>
            <button
              type="button"
              className={`alert-bell${alertRules.mutedUntil && alertRules.mutedUntil > Date.now() ? ' is-muted' : ''}`}
              data-testid="alert-bell"
              data-flash={bellShouldFlash(maintSubjects, loadMaintenance()) ? '1' : '0'}
              title={tg('l2.bellOpens')}
              onClick={() => {
                if (bellPrefs.mode === 'drawer') {
                  openClassifiedEditor('alert-history')
                } else {
                  const first = alertHistory.find((a) => a.status === 'active')
                  openWorkbench(first ? { alertId: first.id } : undefined)
                }
              }}
            >
              <Icon name="bell" size={16} />
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
            {tabChrome.arrows ? (
              <button
                type="button"
                className="tab-scroll-btn"
                data-testid="tab-scroll-left"
                aria-label={tr('tab.scrollLeft')}
                title={tr('tab.scrollLeft')}
                disabled={!tabFade.left}
                onClick={() => {
                  const el = tabBarRef.current?.querySelector('.tab-bar-scroll')
                  if (el instanceof HTMLElement) el.scrollLeft -= tabStripNudgePx(el.clientWidth, TAB_STRIP_NUDGE)
                }}
              >
                ←
              </button>
            ) : null}
            <div
              className={`tab-bar-scroll${tabFade.left ? ' fade-left' : ''}${tabFade.right ? ' fade-right' : ''}`}
              data-testid="tab-bar-scroll"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.preventDefault()
                e.currentTarget.scrollLeft += e.key === 'ArrowRight' ? 80 : -80
              }}
            >
            {orderedTabs.map((t) => {
              const isSession = !t.view || t.view === 'session'
              const profileForTab = profiles.find((p) => p.id === t.profileId)
              const guardLevel = stricterLevel(effectiveLevel(profileForTab), Boolean(t.profileId && sessionRo[t.profileId]))
              const guardElevated = isElevated(profileForTab?.id, elevateMap)
              const showRo = guardLevel === 'readonly' && !guardElevated
              const guardClass = !showRo && guardLevel === 'production' ? 'tab-guard-prod' : showRo ? 'tab-guard-ro' : ''
              const sftpAddr = t.view === 'sftp' && t.connectOpts.host
                ? `${t.connectOpts.username}@${t.connectOpts.host}:${t.connectOpts.port || 22}`
                : ''
              const guardTip = showRo ? tg('s4.tip') : guardLevel === 'production' ? tg('l4.bannerProd') : ''
              return (
              <button
                key={t.tabId}
                type="button"
                title={[sftpAddr, guardTip].filter(Boolean).join(' · ') || undefined}
                data-tab-id={t.tabId}
                className={`tab tab-kind-${t.view || 'session'} ${guardClass} ${t.pinned ? 'is-pinned' : ''} ${t.tabId === activeTabId ? 'active' : ''} ${isSession && t.status === 'disconnected' ? 'tab--disconnected' : ''} ${(isSession || t.view === 'sftp') && t.status === 'connecting' ? 'tab--connecting' : ''} ${t.view && WORKSPACE_TAB_VIEWS.has(t.view) ? 'tab--workspace' : ''}`}
                onClick={() => setActiveTabId(t.tabId)}
                onDoubleClick={() => startRename(t.tabId)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setActiveTabId(t.tabId)
                  setTabMenu({ tabId: t.tabId, x: e.clientX, y: e.clientY, entry: 'context' })
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
                  setTabs((prev) => {
                    const ordered = arrangeTabs(prev.map((tab, i) => ({ ...tab, id: tab.tabId, seq: tab.openSeq ?? i + 1, pinned: Boolean(tab.pinned) })))
                    const moved = moveById(ordered, (x) => x.tabId, from, t.tabId)
                    return moved.map((tab, i) => ({ ...tab, openSeq: (i + 1) * 10 }))
                  })
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
                {t.pinned ? <Icon name="pin" size={12} /> : null}
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
                <span className="tab-title">{labelFor(t)}</span>
                {showRo ? <span className="prot-badge prot-badge--readonly" data-testid="s4-tab-badge">{tg('s4.badge')}</span> : null}
                </>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  className="tab-more"
                  data-testid="tab-row-more"
                  title={tr('toolbar.more')}
                  aria-label={tr('toolbar.more')}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setActiveTabId(t.tabId)
                    const rect = e.currentTarget.getBoundingClientRect()
                    setTabMenu({ tabId: t.tabId, x: rect.left, y: rect.bottom, entry: 'overflow' })
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    e.stopPropagation()
                    setActiveTabId(t.tabId)
                    const rect = e.currentTarget.getBoundingClientRect()
                    setTabMenu({ tabId: t.tabId, x: rect.left, y: rect.bottom, entry: 'overflow' })
                  }}
                >
                  ⋯
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="tab-close"
                  title={closeTip}
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
            {tabChrome.arrows ? (
              <button
                type="button"
                className="tab-scroll-btn"
                data-testid="tab-scroll-right"
                aria-label={tr('tab.scrollRight')}
                title={tr('tab.scrollRight')}
                disabled={!tabFade.right}
                onClick={() => {
                  const el = tabBarRef.current?.querySelector('.tab-bar-scroll')
                  if (el instanceof HTMLElement) el.scrollLeft += tabStripNudgePx(el.clientWidth, TAB_STRIP_NUDGE)
                }}
              >
                →
              </button>
            ) : null}
            {tabChrome.menu ? (
              <button
                ref={tabOverflowBtnRef}
                type="button"
                className="tab-overflow-btn"
                data-testid="tab-overflow"
                data-hidden={tabHiddenCount}
                aria-expanded={tabOverflowOpen}
                aria-haspopup="menu"
                aria-label={tr('tab.overflow', { n: tabs.length, hidden: tabHiddenCount })}
                title={tr('tab.overflow', { n: tabs.length, hidden: tabHiddenCount })}
                onClick={() => {
                  const btn = tabOverflowBtnRef.current
                  if (btn) {
                    const r = btn.getBoundingClientRect()
                    const width = 280
                    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
                    setTabOverflowPos({ top: Math.round(r.bottom + 4), left: Math.round(left) })
                  }
                  tabOverflowFromRef.current = 'chevron'
                  setTabQuery('')
                  setTabListIndex(0)
                  setTabOverflowOpen((v) => !v)
                }}
              >
                <span className="tab-overflow-mark" aria-hidden>{tabOverflowMark(tabHiddenCount)}</span>
              </button>
            ) : null}
            {tabOverflowOpen && tabOverflowPos
              ? createPortal(
                  <div
                    ref={tabOverflowMenuRef}
                    className="tab-overflow-menu"
                    data-testid="tab-overflow-menu"
                    role="menu"
                    aria-label={tr('tab.list.title', { n: tabs.length })}
                    style={{ top: tabOverflowPos.top, left: tabOverflowPos.left }}
                    onKeyDown={(e) => {
                      const rows = filterTabList(
                        orderedTabs.map((t) => ({ ...t, host: t.connectOpts?.host, username: t.connectOpts?.username })),
                        tabQuery
                      )
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setTabListIndex((i) => Math.min(rows.length - 1, i + 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setTabListIndex((i) => Math.max(0, i - 1))
                      } else if (e.key === 'Enter') {
                        const hit = rows[tabListIndex]
                        if (!hit) return
                        e.preventDefault()
                        setActiveTabId(hit.tabId)
                        revealTab(hit.tabId)
                        setTabOverflowOpen(false)
                      } else if (e.key === 'Delete' || e.key === 'Backspace') {
                        const hit = rows[tabListIndex]
                        if (!hit || (e.target instanceof HTMLInputElement && e.key === 'Backspace')) return
                        e.preventDefault()
                        closeTab(hit.tabId, hit.sessionId, hit.status, hit.view)
                      }
                    }}
                  >
                    <div className="tab-overflow-title">{tr('tab.list.title', { n: tabs.length })}</div>
                    {showTabSearch(tabs.length) ? (
                      <input
                        ref={tabSearchRef}
                        className="tab-overflow-search"
                        data-testid="tab-list-search"
                        placeholder={tr('tab.list.search')}
                        aria-label={tr('tab.list.search')}
                        value={tabQuery}
                        onChange={(e) => {
                          setTabQuery(e.target.value)
                          setTabListIndex(0)
                        }}
                      />
                    ) : null}
                    {(() => {
                      const rows = filterTabList(
                        orderedTabs.map((t) => ({ ...t, host: t.connectOpts?.host, username: t.connectOpts?.username })),
                        tabQuery
                      )
                      if (!rows.length) return <div className="tab-overflow-empty">{tr('tab.list.empty')}</div>
                      return rows.map((t, i) => {
                        const current = t.tabId === activeTabId
                        return (
                          <button
                            key={t.tabId}
                            type="button"
                            role="menuitem"
                            className={`tab-overflow-row${current ? ' is-current' : ''}${i === tabListIndex ? ' is-hot' : ''}`}
                            aria-current={current ? 'true' : undefined}
                            onMouseEnter={() => setTabListIndex(i)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              setTabOverflowOpen(false)
                              setTabMenu({ tabId: t.tabId, x: e.clientX, y: e.clientY, entry: 'context' })
                            }}
                            onClick={() => {
                              setActiveTabId(t.tabId)
                              revealTab(t.tabId)
                              setTabOverflowOpen(false)
                            }}
                          >
                            {t.pinned ? <Icon name="pin" size={12} /> : null}
                            <span className="tab-overflow-label">{labelFor(t)}</span>
                            <span
                              role="button"
                              className="tab-overflow-x"
                              title={closeTip}
                              aria-label={tr('tab.close')}
                              onClick={(e) => {
                                e.stopPropagation()
                                closeTab(t.tabId, t.sessionId, t.status, t.view)
                              }}
                            >
                              ×
                            </span>
                            {current ? (
                              <span className="tab-overflow-check" aria-label={tr('tab.list.current')}>
                                <Icon name="check" size={14} />
                              </span>
                            ) : null}
                          </button>
                        )
                      })
                    })()}
                    {disconnectedSessions(tabs).length > 0 ? (
                      <div className="tab-overflow-foot">
                        <button
                          type="button"
                          data-testid="tab-close-disconnected"
                          disabled={closingDisconnected}
                          onClick={() => {
                            const gone = disconnectedSessions(tabs)
                            if (!gone.length) return
                            const snapshots = gone.map((t) => ({ ...t }))
                            setClosingDisconnected(true)
                            for (const t of gone) closeTab(t.tabId, t.sessionId, t.status, t.view)
                            window.setTimeout(() => setClosingDisconnected(false), 400)
                            showToast(tr('tab.list.closedToast', { n: snapshots.length }), {
                              ms: 2000,
                              action: {
                                label: tr('tab.list.undo'),
                                run: () => {
                                  setTabs((prev) => {
                                    const ids = new Set(prev.map((t) => t.tabId))
                                    return [...prev, ...snapshots.filter((t) => !ids.has(t.tabId))]
                                  })
                                }
                              }
                            })
                          }}
                        >
                          {tr('tab.list.closeDisconnected', { n: disconnectedSessions(tabs).length })}
                        </button>
                      </div>
                    ) : null}
                  </div>,
                  document.body
                )
              : null}
          </div>
          {broadcastSessions.length ? <div className="broadcast-bar" data-testid="broadcast-bar" aria-hidden /> : null}
          {tabMenu
            ? (() => {
                const tab = orderedTabs.find((x) => x.tabId === tabMenu.tabId)
                if (!tab) return null
                const canDuplicate = (!tab.view || tab.view === 'session') && tab.kind !== 'local' && Boolean(tab.connectOpts?.host)
                const sessionTools = Boolean(tab.status === 'connected' && tab.sessionId && tab.kind !== 'local' && (!tab.view || tab.view === 'session'))
                const canForward = Boolean(tab.status === 'connected' && tab.sessionId && tab.kind !== 'local')
                const others = closeOthers(orderedTabs, tab.tabId)
                const right = closeRight(orderedTabs, tab.tabId)
                const readOnlyOn =
                  Boolean(tab.profileId && sessionRo[tab.profileId]) ||
                  effectiveLevel(profiles.find((p) => p.id === tab.profileId)) === 'readonly'
                const ctx: TabMenuCtx = {
                  pinned: Boolean(tab.pinned),
                  readOnlyOn,
                  canDuplicate,
                  canSessionTools: sessionTools,
                  canForward,
                  closeOthersDisabled: others.length === 0,
                  closeRightDisabled: right.disabled
                }
                const closeIds = (ids: string[]) => {
                  const want = new Set(ids)
                  closeTabsWhere((row) => !want.has(row.tabId))
                }
                return (
                  <BuiltMenu
                    variant="tab"
                    testId="ux59-menu"
                    nodes={tabMenuItems(ctx, tabMenu.entry)}
                    anchorX={tabMenu.x}
                    anchorY={tabMenu.y}
                    t={(key, vars) => tr(key as MessageKey, vars)}
                    onPick={(id) => {
                      setTabMenu(null)
                      if (id === 'readonly') toggleSessionReadonly(tab)
                      else if (id === 'pin') {
                        const wasPinned = Boolean(tab.pinned)
                        setTabs((prev) => prev.map((row, i) => (row.tabId === tab.tabId ? { ...row, pinned: !row.pinned, openSeq: row.openSeq ?? i + 1 } : row)))
                        if (wasPinned) {
                          toastUndo({
                            message: tg('tab.unpinned'),
                            undo: () => setTabs((prev) => prev.map((row) => (row.tabId === tab.tabId ? { ...row, pinned: true } : row)))
                          })
                        }
                      } else if (id === 'rename') startRename(tab.tabId)
                      else if (id === 'duplicate') {
                        void openSession(tab.connectOpts, { profileId: tab.profileId, hostInventoryId: tab.hostInventoryId, kind: 'ssh' })
                      } else if (id === 'sftp' && tab.sessionId) openSftpTransfer(tab.sessionId, { alignCwd: true })
                      else if (id === 'monitor') openMonitorForSession(tab.sessionId ?? null)
                      else if (id === 'forward' && tab.sessionId) openToolTabRef.current('forward', tab.sessionId)
                      else if (id === 'closeOthers') closeIds(others)
                      else if (id === 'closeRight') closeIds(right.close)
                      else if (id === 'close') closeTab(tab.tabId, tab.sessionId, tab.status, tab.view)
                    }}
                  />
                )
              })()
            : null}

          {batchQueue ? (
            <div className="l10-queue" role="status" data-testid="l10-queue">
              <span>{tg('l10.queue', { started: batchQueue.started, total: batchQueue.total, n: batchQueue.queued })}</span>
              <button
                type="button"
                data-testid="l10-cancel-queue"
                disabled={batchQueue.queued <= 0}
                onClick={cancelBatchQueue}
              >
                {tg('l10.cancelQueue')}
              </button>
            </div>
          ) : null}

          {batchFails.length ? (
            <div className="l10-errors" role="status" data-testid="l10-errors">
              <div className="l10-error">
                <span>{tg('l10.cardTitle', { n: batchFails.length })}</span>
                <button type="button" onClick={() => setBatchFails([])}>{tg('g3.gotIt')}</button>
              </div>
              {batchFails.map((row) => (
                <div key={row.id} className="l10-error" data-testid="l10-error">
                  <span title={tg('l10.fail', { host: row.label, reason: row.reason })}>
                    {tg('l10.fail', { host: row.label, reason: row.reason })}
                  </span>
                  <button type="button" onClick={() => void connectManyRef.current([{ id: row.id, label: row.label }])}>
                    {tg('upd.retry')}
                  </button>
                  <button type="button" onClick={() => setBatchFails((prev) => prev.filter((item) => item.id !== row.id))}>
                    {tg('g3.gotIt')}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {activeIsSession && activeTab?.status === 'connecting' && (
            <div className="session-disconnect-banner session-connecting-banner" role="status">
              <span>
                {tr('banner.connecting', {
                  target: `${activeTab.connectOpts.username}@${activeTab.connectOpts.host}:${activeTab.connectOpts.port}`
                })}
              </span>
            </div>
          )}

          {(() => {
            const toolOwner = activeTab?.boundSessionId
              ? tabs.find((t) => t.sessionId === activeTab.boundSessionId && (!t.view || t.view === 'session') && t.status === 'disconnected')
              : undefined
            const bannerCandidate = activeIsSession && showsDroppedConnection(activeTab) ? activeTab : toolOwner
            const bannerTab = showsDroppedConnection(bannerCandidate) ? bannerCandidate : null
            if (!bannerTab) return null
            const retry = autoRetry?.tabId === bannerTab.tabId ? autoRetry : null
            const phase = retry?.phase ?? (reconnectPolicy.mode === 'off' ? 'off' : 'stopped')
            const hop = jumpFail && jumpFail.profileId === bannerTab.profileId ? jumpFail : null
            const manual = (full: boolean) => {
              haltedRef.current.delete(bannerTab.tabId)
              const cur = autoRetryRef.current.get(bannerTab.tabId)
              if (cur) clearTimeout(cur.timer)
              autoRetryRef.current.delete(bannerTab.tabId)
              void reconnectTab(bannerTab.tabId, { full }).then((sid) => {
                if (sid) cancelAutoReconnect(bannerTab.tabId)
                else if (policyRef.current.mode !== 'off') scheduleAutoReconnectRef.current(bannerTab.tabId)
              })
            }
            return (
              <DisconnectBanner
                model={{
                  phase,
                  seconds: retry ? secondsRemaining(retry.delayMs, retry.startedAt, nowTick) : 0,
                  attempt: retry?.attempt ?? 1,
                  max: retry?.max || maxAttemptsFor(reconnectPolicy),
                  host: bannerTab.connectOpts.label?.trim() || bannerTab.connectOpts.host || bannerTab.title,
                  reason: bannerTab.failRaw ? friendlyErrorMessage(bannerTab.failRaw) : '',
                  jumpHop: hop?.hop ?? null,
                  jumpReason: hop?.reason || hop?.name || '',
                  busy: reconnectingTabId === bannerTab.tabId,
                  showEdit: !bannerTab.view || bannerTab.view === 'session'
                }}
                onNow={() => manual(false)}
                onHop={() => manual(false)}
                onFull={() => manual(true)}
                onStop={() => {
                  const cur = autoRetryRef.current.get(bannerTab.tabId)
                  if (cur) clearTimeout(cur.timer)
                  autoRetryRef.current.delete(bannerTab.tabId)
                  haltedRef.current.add(bannerTab.tabId)
                  setAutoRetry({ tabId: bannerTab.tabId, attempt: retry?.attempt ?? 0, delayMs: 0, startedAt: 0, max: retry?.max ?? 0, phase: 'stopped' })
                  noteReconnectAudit(bannerTab.tabId, 'session.reconnect.stop')
                }}
                onClose={() => closeTab(bannerTab.tabId, bannerTab.sessionId, bannerTab.status, bannerTab.view)}
                onEdit={() => {
                  const p = profiles.find((x) => x.id === bannerTab.profileId)
                  openConnectionEditor(p)
                }}
              />
            )
          })()}

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
              onOpenAiSettings={() => openUnifiedSettings('ai')}
              sendGuard={(() => {
                const g = guardForSession(activeTab.sessionId)
                return { level: g.level, hostName: g.hostName || activeTab.connectOpts.host, elevated: g.elevated, profileId: g.profile?.id }
              })()}
              beforeSend={async (command, dangerous) => {
                const g = guardForSession(activeTab.sessionId)
                if (readonlyActive(g.level, g.elevated)) {
                  const gate = gateTerminalChunk('', command.endsWith('\n') ? command : `${command}\n`)
                  if (gate.block) {
                    showRoBlock(activeTab.sessionId, gate.block)
                    return false
                  }
                  return true
                }
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
            {showWelcome ? (
              <WelcomePanel
                onImport={() => void importSessionsPick()}
                onNew={() => openConnectionEditor()}
                onDemo={() => void addDemoHost(true)}
                onDismiss={dismissWelcome}
              />
            ) : null}
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
                      title={paused ? tg('l4.bannerPaused', { time: `${mm}:${ss}` }) : g.level === 'readonly' ? tg('s4.banner') : tg('l4.bannerProd')}
                    >
                      <span className="s4-banner-long">{paused ? tg('l4.bannerPaused', { time: `${mm}:${ss}` }) : g.level === 'readonly' ? tg('s4.banner') : tg('l4.bannerProd')}</span>
                      <span className="s4-banner-short">{paused ? `${mm}:${ss}` : g.level === 'readonly' ? tg('s4.bannerShort') : tg('l4.bannerProd')}</span>
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
            {roBlock && activeTab?.sessionId === roBlock.sessionId ? (
              <div className="s4-block" role="status" data-testid="s4-block">
                <span>{roBlock.text}</span>
                <button
                  type="button"
                  data-testid="s4-copy"
                  onClick={() => void navigator.clipboard.writeText(roBlock.command)}
                >
                  {tg('s4.copyCmd')}
                </button>
                <button
                  type="button"
                  data-testid="s4-unlock"
                  onClick={() => {
                    const g = guardForSession(roBlock.sessionId)
                    if (g.profile) void elevateProfile(g.profile)
                  }}
                >
                  {tg('s4.unlock')}
                </button>
              </div>
            ) : null}
            {tabs.length === 0 && !showWelcome ? (
              <EmptyState
                testId="terminal-empty"
                icon={<Icon name="keyboard" size={32} />}
                title={startupMode === 'blank' ? tr('l7.blankTitle') : tr('ux08.termTitle')}
                desc={startupMode === 'blank' ? tr('l7.blankDesc') : tr('ux08.termDesc')}
                primary={{ label: tr('l7.title'), onClick: () => openHome(), avoid: true }}
                secondary={[{ label: tr('ux08.newConnection'), onClick: () => openConnectionEditor() }, { label: tr('ux08.palette'), onClick: () => setPaletteOpen(true) }]}
              >
                <RecentConnections variant="welcome" limit={5} hideWhenEmpty onQuickConnect={quickConnectRecent} demoRenamed={profiles.some((p) => p.id === DEMO_PROFILE_ID && p.demoRenamed)} />
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
                    focusSection={connFocus}
                    onTestJump={async () => {
                      const jump = buildJumpHost()
                      return window.aiss.ssh.probeJump({
                        host: host.trim(),
                        port: Number(port) || 22,
                        username: username.trim(),
                        password: password || undefined,
                        privateKeyPath: privateKeyPath.trim() || undefined,
                        passphrase: passphrase || undefined,
                        ...(jump ? { jumpHost: jump } : {}),
                        ...(jumpChain.length ? { jumpChain, jumpHost: jump ?? hopToJump(jumpChain[0]!) } : {}),
                        ...(connAuth ? { authMode: connAuth } : {}),
                        ...(certificatePath.trim() ? { certificatePath: certificatePath.trim() } : {})
                      })
                    }}
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
                    onOpenGate={() => {
                      const hostName = inventoryLink?.host || profiles.find((x) => x.id === inventoryLink?.profileId)?.host
                      openM2('gate-timeline', tg('s2b.tab'), { gateHost: hostName })
                    }}
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
                ) : showsRestoreHold(t) ? (
                  <div className="workspace-panel restore-connecting" data-testid="restore-connecting" data-restore={t.restoreFailed ? 'failed' : t.cold ? 'pending' : 'idle'}>
                    <EmptyState
                      icon={<Icon name="refresh-cw" size={32} />}
                      title={t.restoreFailed ? tg('restore.failed') : t.cold ? tg('restore.reconnecting') : tg('restore.click')}
                      primary={{
                        label: tg('restore.click'),
                        testId: 'restore-click',
                        onClick: () => {
                          restoreArmedAt.current.delete(t.tabId)
                          wakingRef.current = null
                          setTabs((prev) => prev.map((x) => (x.tabId === t.tabId ? { ...x, cold: true, restoreFailed: false } : x)))
                        }
                      }}
                    />
                  </div>
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
                    writesDisabled={readonlyActive(guardForSession(t.boundSessionId).level, guardForSession(t.boundSessionId).elevated)}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'forward' ? (
                  <PortForwardModal
                    open
                    embedded
                    sessions={connectedSshSessions}
                    activeSessionId={t.boundSessionId ?? activeSessionId ?? null}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    onPickHost={() => setHostPicker({ action: 'portForward', feature: tg('pf4.pickHost') })}
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
                    aiConfigured={aiConfigured}
                    onCreateFix={(alert, fixes) => createFixPlaybook(alert, fixes)}
                    onDismiss={dismissAlert}
                    onUnmute={unmuteAlerts}
                    onRules={() => openM2('alert-rules', tg('o2.rulesTitle'), { rulesSeg: 'templates' })}
                    onInspect={() => setInspectOpen(true)}
                    onStartup={() => openUnifiedSettings('general')}
                    onOpenSftp={() => handleTitlebarMenuAction('sftp')}
                    onSyncFolder={() => handleTitlebarMenuAction('folderSync')}
                    onImport={() => void importSessionsPick()}
                    onDemo={() => void addDemoHost(true)}
                    onTour={() => {
                      setQuickOpen(false)
                      setQuickExplicit(false)
                      setTourExplicit(true)
                      setTourOpen(true)
                    }}
                    onTasks={() => setTasksManual(true)}
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
                    probePrefs={probePrefs}
                    onProbePrefs={updateProbePrefs}
                    probeGrouped={dashScope.mode === 'group'}
                    probeActive={activeTab?.view === 'home'}
                    probeNonce={probeNonce}
                    retryAllNonce={retryAllNonce}
                    onFailCount={setProbeFailCount}
                    onSample={sampleHomeHost}
                    onSweep={sweepProbes}
                    onRelease={releaseProbes}
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
                    onRules={() => openClassifiedEditor('alert-rules')}
                    onTemplates={() => openM2('alert-rules', tg('o2.rulesTitle'), { rulesSeg: 'templates' })}
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
                    onOpenHome={() => openHome()}
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
                    onOpenSettings={() => openUnifiedSettings('ai')}
                    onCreatePlaybook={(alert, fixes) => createFixPlaybook(alert, fixes)}
                    onNeedAi={() => showToast(tg('w1.needAi'), { action: { label: tg('w1.configure'), run: () => openUnifiedSettings('ai') } })}
                    onExportPostmortem={(alert) => openPostmortem(alert)}
                    onOpenMaintenance={(hostKeys) => openMaintenance(hostKeys)}
                    onAiPostmortem={(alert) => openPostmortemAi(alert)}
                    onOpenSftp={(alert) => openToolTabRef.current('sftp', alert.hostKey)}
                    rulesDock={rulesDock}
                    ruleState={alertRules}
                    onSaveRules={(next) => {
                      setAlertRules(next)
                      saveAlertRules(next)
                    }}
                    onClearHistory={() => {
                      setAlertHistory([])
                      saveAlertHistory([])
                      setActiveAlertIds(new Set())
                    }}
                    catalog={profiles.map((p) => ({
                      id: p.id,
                      title: p.label || p.host,
                      tags: p.tags,
                      sessionId: tabs.find((x) => x.profileId === p.id && x.sessionId && (!x.view || x.view === 'session'))?.sessionId
                    }))}
                  />
                ) : t.view === 'file-history' ? (
                  <FileHistoryTab
                    profileId={t.profileId || ''}
                    hostLabel={profiles.find((p) => p.id === t.profileId)?.label || t.title}
                    path={t.remotePath || ''}
                    level={stricterLevel(effectiveLevel(profiles.find((p) => p.id === t.profileId)), Boolean(t.profileId && sessionRo[t.profileId]))}
                    sessionId={t.boundSessionId}
                    onOpenFile={(path) => {
                      if (!t.boundSessionId) return
                      openRemoteFileEditor({
                        sessionId: t.boundSessionId,
                        remotePath: path,
                        name: path.split('/').pop() || path,
                        connectOpts: t.connectOpts
                      })
                    }}
                    beforeWrite={async () => {
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
                        command: 'snapshot-rollback',
                        source: 'user'
                      })
                    }}
                  />
                ) : t.view === 'postmortem' && t.focusAlertId ? (
                  (() => {
                    const alert = alertHistory.find((a) => a.id === t.focusAlertId)
                    if (!alert) return <div className="workspace-panel" data-testid="postmortem" />
                    const tl = {
                      id: alert.id,
                      hostKey: alert.hostKey,
                      hostTitle: alert.hostTitle,
                      ruleId: alert.ruleId,
                      value: alert.value,
                      threshold: alert.threshold,
                      at: alert.at,
                      status: alert.status,
                      recoveredAt: alert.recoveredAt,
                      handledManually: alert.handledManually
                    }
                    return <PostmortemTab alert={tl} events={viewTimeline(tl, eventsFor(alert.id), auditEvents)} version={appVersion || '0.4.4'} />
                  })()
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
                    sessionReadonly={sessionRo}
                    onResult={() => openM2('playbook-result', tg('m2.playbooks'))}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'playbook-result' ? (
                  <PlaybookResult onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'alert-rules' ? (
                  <AlertRuleTemplatesTab
                    state={alertRules}
                    hosts={profiles.map((p) => ({ id: p.id, title: profileSidebarLabel(p, locale) }))}
                    folderId={dashScope.mode === 'group' ? dashScope.folderId : undefined}
                    initialSegment={t.rulesSeg}
                    focusPackId={t.focusPackId}
                    onChange={(next) => {
                      setAlertRules(next)
                      saveAlertRules(next)
                    }}
                    onOpenWorkbench={() => openWorkbench()}
                  />
                ) : t.view === 'playbook-import' ? (
                  <PlaybookImportTab appVersion={appVersion || '0.4.4'} onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'gate-timeline' ? (
                  <GateTimelineTab
                    focusId={t.gateFocusId}
                    hostKey={t.gateHost}
                    onEditProtection={(profileId) => {
                      const profile = profiles.find((p) => p.id === profileId)
                      if (!profile) return
                      openInventoryEditor({
                        profileId: profile.id,
                        host: profile.host,
                        port: profile.port,
                        username: profile.username,
                        label: profile.label,
                        hostInventoryId: profile.hostInventoryId
                      }, true)
                    }}
                    onOpenAudit={() => openAudit(t.gateHost)}
                  />
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
                    hasSession={connectedSshSessions.length > 0}
                    onStart={() => void startRecording()}
                    onPickHost={() => setHostPicker({ action: 'toggleRecording', feature: tg('pf4.pickHost') })}
                  />
                ) : t.view === 'recording-play' && t.recordingFile ? (
                  <RecordingPlayer file={t.recordingFile} onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
                ) : t.view === 'sync-preview' && t.syncPlan ? (
                  <SyncPreviewTab
                    plan={t.syncPlan}
                    onStart={(plan) => {
                      const sid = plan.sessionId || t.boundSessionId
                      void runFolderSyncDurable({ ...plan, sessionId: sid, profileId: plan.profileId || t.profileId || (sid ? guardForSession(sid).profile?.id : undefined) }, async () => {
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
                    onClear={() => {
                      void askConfirm({
                        id: 'confirm.clearAudit',
                        title: tg('audit.clear'),
                        body: tg('audit.clearBody'),
                        confirmText: tg('audit.clear'),
                        danger: true
                      }).then((ok) => {
                        if (!ok) return
                        clearAudit()
                        setAuditEvents(loadAudit())
                      })
                    }}
                    onExport={(seed) => {
                      setAuditEvents(loadAudit())
                      auditExportNonce.current += 1
                      setAuditExport({ nonce: auditExportNonce.current, seed })
                    }}
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
                    onOpenAlertRules={() => openClassifiedEditor('alert-rules')}
                    onOpenInspect={() => setInspectOpen(true)}
                    alerts={alertHistory}
                    onLocate={(alert) => locateAlert(alert)}
                    onInterpret={(alert) => void interpretAlert(alert)}
                    onOpenWorkbench={(alert) => openWorkbench({ alertId: alert.id })}
                    onHide={(sid) => {
                      const host = connectedSshSessions.find((x) => x.sessionId === sid)
                      const profileId = host?.profileId
                      if (!profileId) return
                      const prev = dashScope
                      const next = hideFromDashboard(prev, profileId)
                      saveDashScope(next)
                      setDashScope(next)
                      toastUndo({
                        message: tg('dash.removed'),
                        undo: () => {
                          saveDashScope(prev)
                          setDashScope(prev)
                        }
                      })
                    }}
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
                    key={t.tabId}
                    tabId={t.tabId}
                    sessionId={t.boundSessionId || null}
                    alignSessionCwd={t.sftpAlignCwd === true}
                    pendingConnect={!t.boundSessionId && !t.restoreFailed}
                    sessionTitle={t.title.replace(/^[^·]+ · /, '')}
                    hostKey={sessionHostKey(t)}
                    hostLabel={t.connectOpts.label?.trim() || t.connectOpts.host || t.title}
                    hostName={t.connectOpts.host}
                    tags={profiles.find((p) => p.id === t.profileId)?.tags}
                    connected={tabs.some((x) => x.sessionId === t.boundSessionId && x.status === 'connected')}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                    onPickHost={() => setHostPicker({ action: 'sftp', feature: tg('pf4.pickHost') })}
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
                    profileId={t.profileId}
                    onOpenHistory={(path) => {
                      if (!t.profileId) return
                      openFileHistory({
                        profileId: t.profileId,
                        path,
                        sessionId: t.boundSessionId,
                        hostLabel: t.title,
                        connectOpts: t.connectOpts
                      })
                    }}
                    onPinPreview={(plan) =>
                      openM2('sync-preview', tg('m2.syncPreview'), { syncPlan: { ...plan, sessionId: t.boundSessionId, profileId: t.profileId }, boundSessionId: t.boundSessionId, profileId: t.profileId })
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
                    profileId={t.profileId || tabs.find((x) => x.sessionId === t.boundSessionId && (!x.view || x.view === 'session'))?.profileId}
                    onOpenHistory={() => {
                      const profileId = t.profileId || tabs.find((x) => x.sessionId === t.boundSessionId && (!x.view || x.view === 'session'))?.profileId
                      if (!profileId || !t.remotePath) return
                      openFileHistory({
                        profileId,
                        path: t.remotePath,
                        sessionId: t.boundSessionId,
                        hostLabel: t.title,
                        connectOpts: t.connectOpts
                      })
                    }}
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
                ) : t.view === 'settings' ? (
                  <SettingsPanel
                    section={isSettingsSection(t.settingsSection) ? t.settingsSection : loadSettingsSection()}
                    onSection={(section) => {
                      saveSettingsSection(section)
                      setTabs((prev) => prev.map((x) => (x.tabId === t.tabId ? { ...x, settingsSection: section } : x)))
                    }}
                    startupMode={startupMode}
                    onStartupMode={(mode) => {
                      saveStartupMode(mode)
                      setStartupMode(mode)
                    }}
                    restoreLayout={restoreLayout}
                    onRestoreLayout={(on) => {
                      saveRestoreLayout(on)
                      setRestoreLayout(on)
                    }}
                    showHostStatus={showHostStatus}
                    onShowHostStatus={(on) => {
                      localStorage.setItem('aiss.showHostStatus', on ? '1' : '0')
                      setShowHostStatus(on)
                    }}
                    auditOn={auditOn}
                    onAudit={(on) => {
                      setAuditEnabled(on)
                      setAuditOn(on)
                    }}
                    version={appVersion}
                    onBackup={() => setBackupOpen(true)}
                    onCloudSync={() => openM2('sync-settings', tg('m2.cloudSync'))}
                    onCheckUpdate={() => void runUpdateCheck(true)}
                    onWhatsNew={() => setWhatsNewOpen(true)}
                    checkingUpdate={updateChecking}
                    isDev={import.meta.env.DEV}
                    onGithub={() => void window.aiss.app.openGithub().catch(() => undefined)}
                    onOpenMcp={() => openSettingsTab('mcpGuide')}
                    onOpenUpdates={() => openUnifiedSettings('about')}
                    onTerminalSaved={setTerminalPrefs}
                    probePrefs={probePrefs}
                    onProbePrefs={updateProbePrefs}
                    tagOptions={[...new Set(profiles.flatMap((p) => p.tags ?? []))]}
                    onOpenTemplates={() => openM2('alert-rules', tg('o2.rulesTitle'), { rulesSeg: 'templates' })}
                    onOpenGate={() => openM2('gate-timeline', tg('s2b.tab'))}
                    settingsAnchor={settingsAnchor}
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
                ) : t.view === 'snippets' ? null : t.view === 'mcpGuide' ? (
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
                    aiConfigured={aiConfigured}
                    hostKey={t.fileCompare.hostKey}
                    hostTitle={t.fileCompare.hostTitle}
                    remotePath={t.fileCompare.remotePath}
                    armed={t.tabId === activeTabId}
                    onOpenSettings={() => openUnifiedSettings('ai')}
                    onDraft={(info) => createDiffPlaybook(info)}
                    onFocusDraft={(id) => openM2('playbook-edit', tg('m2.edit'), { playbookId: id })}
                  />
                ) : t.view === 'alert-maintenance' ? (
                  <MaintenanceTab
                    key={String(t.alertNonce ?? 0)}
                    hosts={profiles.map((p) => ({
                      id: p.id,
                      title: p.label || p.host,
                      tags: p.tags ?? [],
                      sessionId: tabs.find((x) => x.profileId === p.id && x.sessionId && (!x.view || x.view === 'session'))?.sessionId
                    }))}
                    presetHostKeys={t.maintHostKeys}
                    alerts={alertHistory.map((a) => ({ id: a.id, hostKey: a.hostKey, hostTitle: a.hostTitle }))}
                    onChanged={() => setAuditEvents(loadAudit())}
                  />
                ) : t.view === 'alert-postmortem-ai' && t.focusAlertId ? (
                  (() => {
                    const alert = alertHistory.find((a) => a.id === t.focusAlertId)
                    if (!alert) return <div className="workspace-panel" data-testid="a5-missing" />
                    return (
                      <PostmortemAiTab
                        alert={{
                          id: alert.id,
                          hostKey: alert.hostKey,
                          hostTitle: alert.hostTitle,
                          ruleId: alert.ruleId,
                          value: alert.value,
                          threshold: alert.threshold,
                          at: alert.at,
                          status: alert.status,
                          recoveredAt: alert.recoveredAt,
                          handledManually: alert.handledManually
                        }}
                        events={eventsFor(alert.id)}
                        aiConfigured={aiConfigured}
                        onOpenSettings={() => openUnifiedSettings('ai')}
                        onOpenTimeline={() => openPostmortem(alert)}
                      />
                    )
                  })()
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
                      onGateInput={handleTermInput}
                      onOpenSftp={(sid) => openSftpTransfer(sid, { alignCwd: true })}
                      onSecondaryChange={setSplitSecondary}
                      primaryTitle={labelFor(t)}
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
                      onOpenSftp={(sid) => openSftpTransfer(sid, { alignCwd: true })}
                      onUserData={(data) => handleTermInput(t.sessionId, data)}
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
          <div className="ai-panel-shell" style={{ width: layout.aiWidth, minWidth: layout.aiWidth }} data-testid="right-panel" data-pane={rightPane}>
            <div className="right-pane-tabs" role="tablist" data-testid="right-pane-tabs">
              <button
                type="button"
                role="tab"
                className="right-pane-tab"
                data-pane="snippets"
                aria-selected={rightPane === 'snippets'}
                title={tg('right.snippetsTip')}
                onClick={() => openRightPanel('snippets')}
              >
                <Icon name="clipboard-list" size={16} />
                <span className="right-pane-label">{tg('right.snippets')}</span>
              </button>
              <button
                type="button"
                role="tab"
                className="right-pane-tab"
                data-pane="ai"
                aria-selected={rightPane === 'ai'}
                title={tg('right.aiTip')}
                onClick={() => openRightPanel('ai')}
              >
                <Icon name="sparkles" size={16} />
                <span className="right-pane-label">{tg('right.ai')}</span>
              </button>
            </div>
            {rightPane === 'snippets' ? (
              <SnippetsPanel variant="rail" activeSessionId={activeSessionId} launch={snipLaunch} />
            ) : null}
            {rightPane === 'ai' && aiExplain ? (
              <AiAssistCard
                key={aiExplain.id}
                request={aiExplain}
                onClose={() => setAiExplain(null)}
                onOpenSettings={() => openUnifiedSettings('ai')}
                onCreatePlaybook={(fixes) => {
                  const sid = aiExplain.sessionId
                  const owner = tabsRef.current.find((t) => t.sessionId === sid && (!t.view || t.view === 'session'))
                  createFixPlaybook(
                    {
                      id: aiExplain.alertId || `err-${sid}`,
                      hostKey: sid,
                      hostTitle: aiExplain.host || owner?.title || sid,
                      ruleId: 'cpu',
                      value: 0,
                      threshold: 0,
                      at: Date.now(),
                      status: 'active'
                    },
                    fixes,
                    false,
                    aiExplain.alertId ? 'alert' : 'error'
                  )
                }}
                onInsert={(sid, command) => {
                  focusSessionTab(sid)
                  window.setTimeout(() => fillCommandBar(sid, command), 60)
                }}
                onRun={(sid, command) => {
                  focusSessionTab(sid)
                  const g = guardForSession(sid)
                  if (readonlyActive(g.level, g.elevated)) {
                    void navigator.clipboard.writeText(command)
                    showToast(tg('s4.block', { reason: tg('s4.reason', { token: writeToken(command) }) }))
                    return
                  }
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
            {rightPane === 'ai' && selectionExplain ? (
              <SelectionExplainCard
                key={selectionExplain.id}
                request={selectionExplain}
                onClose={() => setSelectionExplain(null)}
                onOpenSettings={() => openUnifiedSettings('ai')}
                onAgree={async (command, risk) => {
                  const sid = selectionExplain.sessionId
                  focusSessionTab(sid)
                  const g = guardForSession(sid)
                  if (readonlyActive(g.level, g.elevated)) {
                    showToast(tg('s4.block', { reason: tg('s4.reason', { token: writeToken(command) }) }))
                    return false
                  }
                  return confirmAndRunAiCommand({
                    sessionId: sid,
                    command,
                    host: selectionExplain.host,
                    aiRisk: selectionRiskToAi(risk),
                    protection: {
                      level: g.level,
                      hostName: g.hostName || selectionExplain.host || '',
                      elevated: g.elevated,
                      profileId: g.profile?.id,
                      channel: 'command'
                    }
                  })
                }}
              />
            ) : null}
            {rightPane === 'ai' ? (
            <AIPanel
              onOpenSettings={() => openUnifiedSettings('ai')}
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
            ) : null}
          </div>
        ) : null}
      </div>
      {hopProgress && !jumpFail ? (
        <div className="jump-fail-banner" data-testid="jump-hop">
          <span>{tg('m2.connectingHop', { i: hopProgress.hop, n: hopProgress.total, name: hopProgress.name })}</span>
        </div>
      ) : null}
      {jumpFail ? (
        <div className="jump-fail-banner" data-testid="jump-fail">
          <span>{tg('m2.jumpFailedTitle')} · {tg('m2.jumpFail', { hop: jumpFail.hop, total: jumpFail.total, name: jumpFail.name })}</span>
          <button
            type="button"
            data-testid="jump-fail-edit"
            onClick={() => {
              const p = profiles.find((x) => x.id === jumpFail.profileId)
              openConnectionEditor(p, 'jump')
            }}
          >
            {tg('m2.editJumps')}
          </button>
          <button
            type="button"
            data-testid="jump-fail-retry"
            onClick={() => {
              const tab = tabs.find((t) => t.profileId === jumpFail.profileId && (!t.view || t.view === 'session') && t.status !== 'connected')
              if (tab) void reconnectTab(tab.tabId)
              else {
                const p = profiles.find((x) => x.id === jumpFail.profileId)
                if (p) void connectProfile(p)
              }
            }}
          >
            {tg('banner.reconnect')}
          </button>
          <details className="jump-fail-more">
            <summary aria-label={tg('l7.shortcut.more')}>⋯</summary>
            <button
              type="button"
              data-testid="jump-fail-certs"
              onClick={() => {
                const p = profiles.find((x) => x.id === jumpFail.profileId)
                openConnectionEditor(p, 'cert')
              }}
            >
              {tg('m2.checkCerts')}
            </button>
          </details>
        </div>
      ) : null}
      <footer className="app-statusbar" data-testid="app-statusbar">
        {(() => {
          const g = activeSessionId ? guardForSession(activeSessionId) : null
          const ro = g && readonlyActive(g.level, g.elevated)
            ? <span className="prot-badge prot-badge--readonly s4-status-badge" data-testid="s4-status-badge">{tg('s4.badge')}</span>
            : null
          const toolOwner = activeTab?.boundSessionId
            ? tabs.find((t) => t.sessionId === activeTab.boundSessionId && (!t.view || t.view === 'session') && t.status === 'disconnected')
            : undefined
          const bannerCandidate = activeIsSession && showsDroppedConnection(activeTab) ? activeTab : toolOwner
          const bannerTab = showsDroppedConnection(bannerCandidate) ? bannerCandidate : null
          const slots = statusBarSlots({
            syncEnabled: syncMeta.enabled,
            phase: syncMeta.phase,
            recording: Boolean(recordingSessionId),
            broadcastCount: broadcastSessions.length,
            disconnected: Boolean(bannerTab),
            host: bannerTab ? (bannerTab.connectOpts.label?.trim() || bannerTab.connectOpts.host || bannerTab.title) : '',
            tabId: bannerTab?.tabId
          }).slots
          return (
            <>
              {ro}
              {slots.map((slot) => {
                if (slot.id === 'disconnect') {
                  return (
                    <span key={slot.id} className="statusbar-slot statusbar-slot--disconnect" data-testid="statusbar-disconnect" role="status">
                      <span className="statusbar-label">{disconnectStatusSentence(slot.host ?? '', locale === 'en' ? 'en' : 'zh-CN')}</span>
                      <button
                        type="button"
                        className="statusbar-reconnect"
                        data-testid="statusbar-reconnect"
                        onClick={() => {
                          const tabId = slot.tabId
                          if (!tabId) return
                          haltedRef.current.delete(tabId)
                          const cur = autoRetryRef.current.get(tabId)
                          if (cur) clearTimeout(cur.timer)
                          autoRetryRef.current.delete(tabId)
                          void reconnectTab(tabId, { full: true }).then((sid) => {
                            if (sid) cancelAutoReconnect(tabId)
                            else if (policyRef.current.mode !== 'off') scheduleAutoReconnectRef.current(tabId)
                          })
                        }}
                      >
                        {tg('pf5.reconnect')}
                      </button>
                    </span>
                  )
                }
                if (slot.id === 'broadcast') {
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className="statusbar-slot"
                      data-testid="statusbar-broadcast"
                      title={tg('ux10.broadcastOff')}
                      onClick={() => setBroadcastEnabled(false)}
                    >
                      <span className="statusbar-glyph" aria-hidden>{slot.glyph}</span>
                      <span className="statusbar-label">{tg('sb.broadcast', { n: slot.count ?? 0 })}</span>
                    </button>
                  )
                }
                if (slot.id === 'record') {
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className="statusbar-slot"
                      data-testid="statusbar-record"
                      title={tg('ux10.recFor', { time: formatDuration(Date.now() - (recordingStartedAt ?? Date.now())) })}
                      onClick={() => openM2('recordings', tg('m2.recordings'))}
                    >
                      <span className="statusbar-glyph" aria-hidden>{slot.glyph}</span>
                      <span className="statusbar-label">{tg('sb.recording')}</span>
                    </button>
                  )
                }
                const phase = slot.phase ?? 'synced'
                return (
                  <button
                    key={slot.id}
                    type="button"
                    className="statusbar-slot"
                    data-testid="sync-status"
                    title={tg(syncPhaseKey(phase))}
                    onClick={() => openM2(syncMeta.phase === 'conflict' ? 'sync-conflicts' : 'sync-settings', tg('m2.cloudSync'))}
                  >
                    <span className="statusbar-glyph" aria-hidden>{slot.glyph}</span>
                    <span className="statusbar-label">{tg(syncPhaseKey(phase))}</span>
                  </button>
                )
              })}
            </>
          )
        })()}
      </footer>

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
      <WelcomeTour open={product === 'tour'} onClose={closeTour} ensureAiVisible={ensureAiVisible} />
      <StartupSettingsModal
        open={startupOpen}
        value={startupMode}
        onChange={(mode) => {
          saveStartupMode(mode)
          setStartupMode(mode)
        }}
        restoreLayout={restoreLayout}
        onRestoreLayout={(on) => {
          saveRestoreLayout(on)
          setRestoreLayout(on)
        }}
        onClose={() => setStartupOpen(false)}
      />
      <HostKeyConfirmModal prompt={hostKeyPrompt} onRespond={(accept, alwaysTrust) => void respondHostKey(accept, alwaysTrust)} />
      <AboutModal
        open={aboutOpen}
        version={appVersion}
        isDev={import.meta.env.DEV}
        checking={updateChecking}
        onClose={() => setAboutOpen(false)}
        onCheckUpdate={() => void runUpdateCheck(true)}
        onWhatsNew={() => setWhatsNewOpen(true)}
      />
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        onOpenSettings={() => openUnifiedSettings('shortcuts')}
        onOpenPalette={() => {
          setShortcutsOpen(false)
          setPaletteOpen(true)
        }}
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
          openToolTabRef.current('toolbox', sid)
        }}
      />
      {auditExport ? (
        <AuditExportModal
          key={auditExport.nonce}
          open
          events={auditEvents}
          seed={auditExport.seed}
          onClose={() => setAuditExport(null)}
        />
      ) : null}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAction={handleTitlebarMenuAction}
        aiReady={aiConfigured}
        notes={{
          ...(syncReady ? {} : { syncNow: tg('m2.syncNeedSetup') }),
          ...(hasPlaybooks ? {} : { runPlaybook: tg('m2.noPlaybooks') }),
          ...(tabs.some((tab) => tab.view === 'alert-workbench')
            ? aiConfigured
              ? {}
              : { fixPlaybook: tg('w1.needAi') }
            : { fixPlaybook: tg('w1.paletteNeedAlert'), exportPostmortem: tg('w1.paletteNeedAlert') }),
          ...(tabs.some((t) => t.view === 'home')
            ? probeFailCount === 0
              ? { retryFailedProbes: tg('l7c.noFails') }
              : {}
            : { refreshHomeHealth: tg('l7b.needHome'), retryFailedProbes: tg('l7b.needHome') }),
          ...(tabs.some((tab) => tab.view === 'alert-workbench') ? {} : { aiPostmortem: tg('w1.paletteNeedAlert') }),
          ...(tabs.some((tab) => tab.view === 'file-diff') ? {} : { explainDiff: tg('l8b.needDiff'), diffFixPlaybook: tg('l8b.needDiff') })
        }}
      />
      <QuickStartWizard
        open={product === 'quickStart'}
        step={quickStep}
        resume={quickResume}
        failReason={quickStep === 2 ? error ?? undefined : undefined}
        onNew={() => openConnectionEditor()}
        onDemo={() => void addDemoHost(true)}
        onImport={() => void importSessionsPick()}
        onConnect={() => {
          const profile = profilesRef.current[profilesRef.current.length - 1]
          if (profile) openOrFocusProfile(profile)
        }}
        onLater={() => {
          setQuickOpen(false)
          setQuickExplicit(false)
        }}
        onHome={() => finishQuick('home')}
        onTerm={() => finishQuick('term')}
        onSkip={() => finishQuick()}
        onEdit={() => {
          const profile = profilesRef.current[profilesRef.current.length - 1]
          if (profile) openConnectionEditor(profile)
        }}
        onDone={() => finishQuick()}
      />
      {product === 'tasks' ? (
        <FirstWeekChip
          state={taskState}
          mode={tasksManual ? 'panel' : 'chip'}
          onGotIt={() => {
            setTipsSnooze(true)
            setTasksManual(false)
          }}
          onNever={() => {
            saveFirstWeekDismissed(true)
            setTipsDismissed(true)
            setTaskState(dismissTasksForever())
            setTipsSnooze(true)
            setTasksManual(false)
          }}
          onGo={(id) => {
            if (id === 'connect') openConnectionEditor()
            else if (id === 'monitor') handleTitlebarMenuAction('resourceMonitor')
            else if (id === 'ai') openUnifiedSettings('ai')
            else handleTitlebarMenuAction('sftp')
            setTasksManual(false)
          }}
          onDismiss={(id) => setTaskState(skipTask(id))}
        />
      ) : null}
      <WhatsNewModal
        open={product === 'releaseNotes'}
        version={appVersion}
        onClose={() => setWhatsNewOpen(false)}
        onAction={handleTitlebarMenuAction}
      />
      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
      <UpdateModal
        open={product === 'systemUpdate'}
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
        const ctx: HostMenuCtx = multi
          ? { selection: 'multi', count: multi.length, folders: folders.map((f) => ({ id: f.id, name: f.name })) }
          : {
              selection: 'single',
              count: 1,
              demo: Boolean(p.demo),
              currentFolderId: p.folderId,
              folders: folders.map((f) => ({ id: f.id, name: f.name }))
            }
        const pick = (id: string) => {
          if (id.startsWith('move-to:')) {
            const target = id.slice('move-to:'.length)
            moveProfileToFolder(multi ?? [p.id], target === 'ungrouped' ? undefined : target)
            return
          }
          if (id.startsWith('set-level:')) {
            const level = id.slice('set-level:'.length) as 'normal' | 'production' | 'readonly'
            setSessionMenu(null)
            setProfileProtection(multi ?? [p.id], level)
            return
          }
          if (id === 'connect') {
            setSessionMenu(null)
            openOrFocusProfile(p)
            return
          }
          if (id === 'connectNew') {
            setSessionMenu(null)
            void connectProfile(p)
            return
          }
          if (id === 'connectAll') {
            setSessionMenu(null)
            void connectManyRef.current(hostsByIds(profilesRef.current, multi ?? []))
            return
          }
          if (id === 'maint') {
            setSessionMenu(null)
            openMaintenance(multi ?? [p.id])
            return
          }
          if (id === 'batch') {
            setSessionMenu(null)
            void (async () => {
              const sids: string[] = []
              for (const x of multiProfiles) {
                const sid = await ensureProfileSession(x)
                if (sid) sids.push(sid)
              }
              openToolTabRef.current('batch', null, sids)
            })()
            return
          }
          if (id === 'monitorBoard') {
            setSessionMenu(null)
            openDashboard()
            return
          }
          if (id === 'sftp') {
            openSftpFromHost(p)
            return
          }
          if (id === 'monitor') {
            void monitorProfile(p)
            return
          }
          if (id === 'toolbox') {
            runForProfile(p, (sid) => {
              openToolTabRef.current('toolbox', sid)
            })
            return
          }
          if (id === 'edit') {
            openConnectionEditor(p)
            setSessionMenu(null)
            return
          }
          if (id === 'profile') {
            openInventoryEditor({
              profileId: p.id,
              host: p.host,
              port: p.port,
              username: p.username,
              label: p.label,
              hostInventoryId: p.hostInventoryId
            })
            setSessionMenu(null)
            return
          }
          if (id === 'rename') {
            void renameProfile(p)
            return
          }
          if (id === 'copyAddr') {
            setSessionMenu(null)
            const addr = `${p.username}@${p.host}${p.port && p.port !== 22 ? ` -p ${p.port}` : ''}`
            void navigator.clipboard.writeText(addr).then(() => showToast(tg('ctx.copied')))
            return
          }
          if (id === 'delete') void deleteProfilesFn(multi ?? [p.id])
        }
        return (
          <BuiltMenu
            ref={sessionMenuRef}
            variant="host"
            testId={multi ? 'host-menu-multi' : 'host-menu'}
            nodes={hostMenuItems(ctx, sessionMenu.entry)}
            anchorX={sessionMenu.x}
            anchorY={sessionMenu.y}
            t={(key, vars) => tg(key as MessageKey, vars)}
            onPick={pick}
          />
        )
      })()}

      {folderMenu && (
        <div
          ref={folderMenuRef}
          className="session-context-menu"
          style={{ left: folderMenu.x, top: folderMenu.y }}
          role="menu"
          data-testid="folder-menu"
        >
          <button
            type="button"
            role="menuitem"
            data-ctx="connectGroup"
            className="session-context-menu-item"
            disabled={hostsInFolder(profiles, folderMenu.folderId).length === 0}
            onClick={() => {
              const hosts = hostsInFolder(profilesRef.current, folderMenu.folderId)
              setFolderMenu(null)
              void connectManyRef.current(hosts)
            }}
          >
            {tg('l10.connectGroup', { n: hostsInFolder(profiles, folderMenu.folderId).length })}
          </button>
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
              void (async () => {
                const text = await askText(tg('m2.proxyJump'), '')
                if (!text?.trim()) return
                const parsed = parseProxyJump(text)
                if (!parsed.hops.length) return
                const targets = profilesRef.current.filter((p) => p.folderId === folderId)
                const ok = await askConfirm(tg('m2.groupJump'), tg('m2.groupJumpConfirm', { n: targets.length }), {
                  id: 'confirm.batchJumpOverride',
                  danger: true,
                  okLabel: tg('m2.groupJumpOk', { n: targets.length })
                })
                if (!ok) return
                const hop = hopToJump(parsed.hops[0]!)
                const next = profilesRef.current.map((p) => (p.folderId === folderId ? { ...p, jumpChain: parsed.hops, jumpHost: hop } : p))
                await persistSessionState({ folders, profiles: next })
                showToast(tg('m2.groupJumpOk', { n: targets.length }))
              })()
            }}
          >
            {tg('m2.groupJump')}
          </button>
        </div>
      )}
    </div>
  )
}
