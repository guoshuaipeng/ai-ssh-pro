import { agentForwardAuditDetail } from '@shared/agent-forward'
import { requestSftpGoto } from './lib/sftp-goto'
import { applyMonitorAction, cleanIpcError, auditDetailForAction, buildProfileFromAction, buildSnippetFromAction, findProfileForAction, forwardRequestFromAction, pickHistoryForAction, resolveTargets, sftpPathOk, type ActionResult } from '@shared/ai-actions'
import { hasUsableKey } from '@shared/ai-presets'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  archiveTitle,
  assignConversationOrdinals,
  conversationGroup,
  conversationKey,
  conversationLabel,
  GENERAL_CONVERSATION_KEY
} from '@shared/ai-conversation'
import { globalAiPolicy, hasLegacyHostPolicies, migrateLegacyHostPolicies, resolveAiPolicy, type AiPolicy, type AiPolicySettings } from '@shared/ai-policy'
import { OPEN_AI_POLICY_EVENT, prodAutoHint } from '@shared/prod-auto-hint'
import { createPortal } from 'react-dom'
import { moveById, normalizeTabTitle, LATENCY_POLL_MS, classifyLatency } from '@shared/workspace-features'
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
import { bumpTerminalFontSize, resetTerminalFontSize } from '@shared/terminal-zoom'
import { normalizeSessionNote, sessionNotePreview } from '@shared/session-note'
import { formatConnectionString, formatSshCommand, statusHostChipLabel } from '@shared/connection-string'
import TerminalPane from './components/TerminalPane'
import SplitTerminalView from './components/SplitTerminalView'
import AIPanel, { type AiPendingInfo } from './components/AIPanel'
import AppToolbar from './components/AppToolbar'
import type { TitlebarMenuAction } from './components/TitlebarMenus'
import AiConfigModal from './components/AiConfigModal'
import ConnectionConfigModal from './components/ConnectionConfigModal'
import QuickPick from './components/QuickPick'
import { AI_ASK_CONTEXT_EVENT, setAiPrefill } from './lib/ai-prefill'
import { fenceSelection } from '@shared/ask-context'
import type { CommandSnippet } from '@shared/ipc'
import { loadSmartHistory } from './lib/smart-history'
import { loadHostOnly, mruOrder, mruTouch, rankHistoryPick, rankSwitchPick, saveHostOnly, type PickItem } from '@shared/quick-pick'
import { cdCommandFor } from '@shared/session-cwd'
import { getSessionCwd, setSessionCwd } from './lib/session-cwd-store'
import AboutModal from './components/AboutModal'
import ShortcutsModal from './components/ShortcutsModal'
import { askAboutHistoryFailure, lastRunFor } from './lib/failed-output'
import SearchAllTermsModal from './components/SearchAllTermsModal'
import ConnectingElapsed from './components/ConnectingElapsed'
import { stageTarget, type ConnectStageEvent } from '@shared/connect-stage'
import { buildConnectDiag } from '@shared/connect-diag'
import { decodeHostDrag, dragIds, dropPlan, encodeHostDrag, HOST_DRAG_MIME, ungroupPlan } from '@shared/host-drag'
import { clearConnectFail, connectFailKey, noteConnectFail } from './lib/connect-fail-store'
import { cmdDrafts } from './lib/cmd-draft-store'
import { getDraft, persistableDraft, putDraft } from '@shared/cmd-drafts'
import { sessionInfoText } from '@shared/session-info'
import { isSensitiveCommand } from '@shared/workspace-features'
import { runInCwdLine } from '@shared/history-exit'
import HostKeyConfirmModal from './components/HostKeyConfirmModal'
import KnownHostsModal from './components/KnownHostsModal'
import SessionSearchBar from './components/SessionSearchBar'
import { exportSessionsAndCopy } from './components/SessionExportButtons'
import SnippetsPanel from './components/SnippetsPanel'
import TerminalPrefsModal from './components/TerminalPrefsModal'
import UiThemeModal from './components/UiThemeModal'
import { applyUiTheme, isLightUiTheme, suggestedTerminalTheme, toggleLightDarkTheme, type UiThemeId } from './lib/ui-themes'
import SftpPanel from './components/SftpPanel'
import { askSftpClose, clearArmedFolderSync, requestFolderSync, takeArmedFolderSync } from './lib/sftp-activity'
import { formatSftpTabTitle, planSftpOpen } from '@shared/sftp-host'
import { clearHostHistory, forgetCommand, loadSmartPrefs, restoreSmartEntries, saveSmartPrefs, SMART_PREFS_EVENT } from './lib/smart-history'
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
import {
  broadcastStillActive,
  initialBroadcastSelection,
  pruneBroadcastTargets
} from '@shared/broadcast-targets'
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
import { isEngineerLeak, noticeHost, noticeKind, type NoticeKind } from '@shared/product-error'
import ErrorNotice from './components/ErrorNotice'
import ConnectTrouble, { PNG5_CAUSE } from './components/ConnectTrouble'
import { placeMenu } from '@shared/menu-place'
import { hostMenuItems, tabMenuItems, type HostMenuCtx, type MenuEntry, type TabMenuCtx } from '@shared/inline-menus'
import { BuiltMenu } from './components/BuiltMenu'
import CommandPalette from './components/CommandPalette'
import WhatsNewModal, { WHATS_NEW_AUTO_KEY } from './components/WhatsNewModal'
import UpdateModal from './components/UpdateModal'
import { ToastHost, clearToasts, showToast } from './lib/toast'
import { SCREENSHOT_EVENT, screenshotHooksEnabled, type ScreenshotOp } from './lib/screenshot-hooks'
import { isSkipped, markChecked, shouldAutoCheck, skipVersion } from './lib/update-check'
import { loadUpdateChannelPrefs, rememberUpdateSource, sourceLabel } from '@shared/update-channel'
import { alertHostIds, ignoreAlert, locateTargetFor, reconcileAlerts } from '@shared/alert-locate'
import { buildAlertContext } from '@shared/alert-context'
import { COMPARE_BYTE_LIMIT } from '@shared/file-diff'
import { applyImportPolicy, buildImportPreview, type ImportPolicy, type ImportPreviewModel } from '@shared/import-preview'
import { completeTask, dismissTasksForever, loadTaskState, pendingTasks, reopenTasks, skipTask, TASK_IDS, type TaskId, type TaskState } from '@shared/retention-tasks'
import { loadSftpDensity, saveSftpDensity, SFTP_DENSITY_EVENT } from '@shared/sftp-density'
import type { ServerToolsTab } from './components/ServerToolsModal'
import { requestTerminalFind, AISS_TERMINAL_FIND_EVENT } from './lib/terminal-find'
import { keysFor, matchKeymap } from '@shared/keymap'
import { dupOrdinals, withOrdinal } from '@shared/tab-dedupe'
import { applySplitMode, applySplitToggle, splitModeOf, type SplitMode, type SplitOrientation } from '@shared/split-toggle'
import SplitModeMenu from './components/SplitModeMenu'
import { matchSnippetHotkey, SNIPPET_HOTKEY_EVENT } from '@shared/snippet-hotkey'
import { dispatchInjectTerminal } from './lib/terminal-inject'
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
import { CHROME_ICON_SIZE, CHROME_ICON_STROKE, STATUS_ICON_SIZE, TAB_ICON_SIZE, TREE_CHEVRON_SIZE } from './components/emptyIcons'
import { statusSlotIconName } from './lib/status-icons'
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
import { OPEN_AUDIT_EVENT } from './components/ExecReplay'
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
import { TAB_STRIP_NUDGE, disconnectedSessions, filterTabList, showTabSearch, tabStripChrome, tabStripNudgePx, tabStripRevealDelta, tabStripWheelDelta } from '@shared/tab-overflow'
import { loadProbePrefs, probeExtrasOf, sanitizeProbeReason, saveProbePrefs, type ProbePrefs } from '@shared/health-probe'
import { bellShouldFlash, endingSoon, expireDue, formatRemaining, loadMaintenance, shouldNotify, activeWindows, endMaintenance } from '@shared/maintenance'
import { planPostmortem } from '@shared/postmortem-ai'
import { markLoop } from '@shared/alert-loop'
import { arrangeTabs, closeOthers, closeRight } from '@shared/tab-actions'
import { popClosedTab, pushClosedTab, type ClosedTabSnap } from '@shared/closed-tabs'
import { collectReminderNotice, REMINDER_FILTER_EVENT, REMINDER_FOCUS_EVENT } from './lib/reminder-tick'
import { loadFirstWeekDismissed, saveFirstWeekDismissed } from '@shared/first-week'
import { decideQuickStart, loadFreshProfile, loadQuickDone, noteInstall, saveQuickDone } from '@shared/onboarding'
import { loadWelcomePrefs, saveWelcomeCompleted, saveWelcomeDismissed } from '@shared/welcome-prefs'
import { admitProductOverlay, escProductTarget, isHigherChromeOpen, pickProductOverlay, productBackdropCount, suppressParkableProduct, shouldOfferTourAfterWelcome } from '@shared/overlay-stack'
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
import { disconnectStatusSentence, fitStatusSlots, formatStatusLatency, latencyClipboardText, statusBarSlots, statusQuietLabel } from '@shared/status-bar'
import { QUIET_LOAD_ATTRS } from '@shared/quiet-load'
import { trayHoverTitle } from '@shared/product'
import { tabKindIcon } from '@shared/tab-kind'
import { connectionTechnicalDetail, showConnectionTrouble, troubleshootConnection } from '@shared/connect-trouble'
import { runCloudSync, syncIsConfigured } from './lib/cloud-sync'
import { runFolderSyncDurable, type FolderSyncPlan } from './lib/folder-sync-run'
import { connectOptsFromProfile } from './lib/connect-opts'
import StartupSettingsModal from './components/StartupSettingsModal'
import ProtectionSection, { ProtectionLevelField } from './components/ProtectionSection'
import ScopePicker from './components/ScopePicker'
import { activeCount, loadBellPrefs, markHandled, saveBellPrefs, type AlertFilter, type BellPrefs } from '@shared/alert-workbench'
import { appendAudit, appendGate, auditEnabled, clearAudit, loadAudit, redactAuditText, setAuditEnabled, type AuditEvent } from '@shared/audit-log'
import { peekAuditExportContext, type AuditExportSeed } from '@shared/audit-export'
import { hideFromDashboard, hostInScope, loadDashScope, restoreToDashboard, saveDashScope, type DashScope } from '@shared/dashboard-scope'
import { dropCenterSnippetTabs, redirectCenterSnippets, type RightPaneId } from '@shared/right-panel'
import { assessCommandRisk } from '@shared/command-risk'
import { setStrictPasteHosts } from './lib/paste-pref'
import { SHELL_INT_EVENT, setShellIntOn, shellIntOn } from './lib/shell-integration'
import { BLOCKS_HINT_KEY, shouldHintBlocks } from '@shared/blocks-hint'
import { SI_HINT_KEY, shouldHintShellInt } from '@shared/shell-int-hint'
import { isDemoSessionId } from '@shared/demo-host'
import { COMMAND_SUBMITTED_EVENT } from './lib/ai-events'
import { matchProfile, parseQuickTarget, quickTargetLabel, type QuickTarget } from '@shared/quick-connect'
import { recentConnectTarget, recentSaveTarget, shouldAskPassword, sidebarQuick } from '@shared/recent-quick'
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
import { formatOpenTabsList } from '@shared/open-tabs-export'
import { coldStartShowsWelcome, planColdStart, restoreWatchIds, showsDroppedConnection, showsRestoreHold } from '@shared/cold-start'
import { isSettingsSection, loadSettingsSection, saveSettingsSection, sectionForAction, type SettingsSection } from '@shared/settings-nav'
import { editorOpenPlan, type EditorId } from '@shared/editor-surface'
import SettingsPanel from './components/SettingsPanel'
import DisconnectBanner from './components/DisconnectBanner'
import { DEMO_HOST, DEMO_PROFILE_ID, DEMO_TAGS, DEMO_USER, demoProfileLabel, profileDisplayLabel } from '@shared/demo-host'
import { findAlertDraft, playbookFromFixes, ruleShortName } from '@shared/playbook-draft'
import { appendTimeline, ensureFired, eventsFor, viewTimeline } from '@shared/timeline'
import { SHARED_MENUS, menuLabel, type MenuAction } from '@shared/menus'
import { useI18n, tg, type MessageKey } from './lib/i18n'
import { askConfirm, askText, DialogHost , isDialogOpen, promptDialog, toast, toastUndo} from './lib/dialogs'
import { ContextMenuHost, closeContextMenu, openContextMenu, textFieldContextItems } from './components/ContextMenu'
import { notifyRecentChanged } from './lib/workspace-events'
import type { RecentConnection } from '@shared/workspace-features'
import { normalizeTags } from '@shared/workspace-features'
import { filterProfiles, folderMatches } from './lib/session-filter'
import { clearRemoteFileDirty, isRemoteFileDirty } from './lib/remote-file-dirty'
import PanelHeader from './components/ui/PanelHeader'
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
  /** 2.3: audit row to scroll to and highlight (from AI execution replay). Not persisted. */
  auditFocusId?: string
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
  /** D8: cwd saved with the workspace; used on the first connect */
  restoreCwd?: string
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
  /** PNG-5: raw connect failure, kept for the triage card's collapsed detail. */
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
  const labelFor = (tab: Pick<Tab, 'title' | 'customTitle' | 'status' | 'view' | 'auditHost' | 'connectOpts'>) =>
    tabLabel(
      {
        title: tab.title,
        customTitle: tab.customTitle,
        status: tab.status,
        view: tab.view,
        auditHost: tab.auditHost,
        hostLabel: tab.view === 'sftp' ? tab.connectOpts?.label?.trim() || tab.connectOpts?.host || '' : undefined
      },
      (key, vars) => tr(key as MessageKey, vars)
    )
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  // D4: MRU of activated tabs (Ctrl+Tab / Ctrl+P)
  const mruRef = useRef<string[]>([])
  const tabChainRef = useRef<{ snap: string[]; idx: number; at: number } | null>(null)
  useEffect(() => {
    if (activeTabId && !(tabChainRef.current && Date.now() - tabChainRef.current.at < 1200)) mruRef.current = mruTouch(mruRef.current, activeTabId)
  }, [activeTabId])
  const [quickPick, setQuickPick] = useState<null | 'history' | 'switch'>(null)
  const [sessionState, setSessionState] = useState<SavedSessionsState>({ folders: [], profiles: [] })
  const sessionStateRef = useRef(sessionState)
  sessionStateRef.current = sessionState
  const { folders, profiles } = sessionState

  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [label, setLabel] = useState('')
  const [sessionNote, setSessionNote] = useState('')

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
  // Split / broadcast toggles read these live boxes: handleTitlebarMenuAction is memoised without
  // splitEnabled / broadcastEnabled in its deps, so reading the state there saw stale values.
  const splitEnabledRef = useRef(false)
  const broadcastEnabledRef = useRef(false)
  splitEnabledRef.current = splitEnabled
  broadcastEnabledRef.current = broadcastEnabled
  // S41b: layout lives here so the tab-bar popover owns off / side by side / top and bottom
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientation>(() =>
    localStorage.getItem('aiss.split.orientation') === 'vertical' ? 'vertical' : 'horizontal'
  )
  const splitOrientationRef = useRef<SplitOrientation>(splitOrientation)
  splitOrientationRef.current = splitOrientation
  useEffect(() => localStorage.setItem('aiss.split.orientation', splitOrientation), [splitOrientation])
  const [broadcastTargets, setBroadcastTargets] = useState<string[]>([])
  const [broadcastPickerOpen, setBroadcastPickerOpen] = useState(false)
  const [alertRules, setAlertRules] = useState<AlertRulesState>(() => loadAlertRules())
  const [alertHistory, setAlertHistory] = useState<FiredAlert[]>(() => loadAlertHistory())
  const [rulesDock, setRulesDock] = useState<{ nonce: number; tab: 'rules' | 'history' } | null>(null)
  const [bellPrefs, setBellPrefs] = useState<BellPrefs>(() => loadBellPrefs())
  const [statusLatencyMs, setStatusLatencyMs] = useState<number | null | undefined>(undefined)
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
  // 2.1: AI command rows are written by the AI panel; refresh the audit view when they land.
  useEffect(() => {
    const onChanged = () => setAuditEvents(loadAudit())
    window.addEventListener('aiss-audit-changed', onChanged)
    return () => window.removeEventListener('aiss-audit-changed', onChanged)
  }, [])
  const [auditExport, setAuditExport] = useState<{ nonce: number; seed: AuditExportSeed } | null>(null)
  const auditExportNonce = useRef(0)
  const [guardCollapsed, setGuardCollapsed] = useState<Record<string, boolean>>({})
  const [protection, setProtection] = useState<ProtectionLevel>('normal')
  const [jumpChain, setJumpChain] = useState<JumpHop[]>([])
  const [connAuth, setConnAuth] = useState<'password' | 'key' | 'agent'>('password')
  const [certificatePath, setCertificatePath] = useState('')
  const [agentForward, setAgentForward] = useState(false)
  const [formAutoRecord, setFormAutoRecord] = useState(false)
  const [blocksOn, setBlocksOn] = useState(() => blocksEnabled())
  const [jumpFail, setJumpFail] = useState<{ hop: number; total: number; name: string; reason: string; profileId?: string } | null>(null)
  const [hopProgress, setHopProgress] = useState<{ hop: number; total: number; name: string } | null>(null)
  const [connFocus, setConnFocus] = useState<'jump' | 'cert' | 'note' | null>(null)
  const [tabOverflowOpen, setTabOverflowOpen] = useState(false)
  const [tabOverflowPos, setTabOverflowPos] = useState<{ top: number; left: number } | null>(null)
  const [tabStripOverflowing, setTabStripOverflowing] = useState(false)
  const [tabHiddenCount, setTabHiddenCount] = useState(0)
  const [tabFade, setTabFade] = useState({ left: false, right: false })
  const tabChrome = tabStripChrome(tabStripOverflowing)

  const openAllTabsMenu = useCallback(() => {
    const btn = tabOverflowBtnRef.current
    if (btn) {
      const r = btn.getBoundingClientRect()
      const width = 280
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
      setTabOverflowPos({ top: Math.round(r.bottom + 4), left: Math.round(left) })
    } else {
      setTabOverflowPos({ top: 48, left: Math.max(8, window.innerWidth - 300) })
    }
    tabOverflowFromRef.current = 'chevron'
    setTabQuery('')
    setTabListIndex(0)
    setTabOverflowOpen(true)
  }, [])

  const tabBarRef = useRef<HTMLDivElement>(null)
  const tabOverflowBtnRef = useRef<HTMLButtonElement>(null)
  const tabOverflowMenuRef = useRef<HTMLDivElement>(null)
  const tabSearchRef = useRef<HTMLInputElement>(null)
  const tabOverflowFromRef = useRef<'chevron' | 'palette'>('chevron')
  const tabStripWasOverflowingRef = useRef(false)
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
    const next = !layout.showSidebar
    updateLayout((p) => withPaneToggle(p, 'sidebar', next))
    showToast(tg(next ? 'toolbar.showSidebar' : 'toolbar.hideSidebar'))
  }, [updateLayout, layout.showSidebar])
  const toggleMain = useCallback(() => {
    const next = !layout.showMain
    updateLayout((p) => withPaneToggle(p, 'main', next))
    showToast(tg(next ? 'toolbar.showMain' : 'toolbar.hideMain'))
  }, [updateLayout, layout.showMain])
  const toggleAi = useCallback(() => {
    const next = !layout.showAi
    updateLayout((p) => withPaneToggle(p, 'ai', next))
    showToast(tg(next ? 'toolbar.showAi' : 'toolbar.hideAi'))
  }, [updateLayout, layout.showAi])
  const [rightPane, setRightPane] = useState<RightPaneId>(() => loadLayoutPrefs().rightPane)
  const [aiPending, setAiPending] = useState<AiPendingInfo | null>(null)
  const [aiFocusPendingToken, setAiFocusPendingToken] = useState(0)
  const onAiPendingChange = useCallback((info: AiPendingInfo | null) => {
    setAiPending(info)
  }, [])
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
  // c51 PL1: switching tabs closes every portal popover (DateField, Select, menus) so none leaks onto the next tab
  useEffect(() => {
    closeContextMenu()
  }, [activeTabId])
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
  const noteFailure = useCallback((raw: unknown, forced?: NoticeKind): string => {
    const fe = friendlyError(raw, { locale })
    const rawText = raw instanceof Error ? raw.message : String(raw ?? '')
    const blob = `${fe.message}\n${fe.detail ?? ''}\n${rawText}`
    const kind = forced ?? noticeKind(blob)
    const detail = connectionTechnicalDetail(rawText || fe.detail || '')
    const item = troubleshootConnection(blob)
    const loc = locale === 'en' ? 'en' : 'zh-CN'
    setErrorKind(kind)
    setErrorRaw(rawText)
    setErrorDetail(detail && detail !== fe.message ? detail : null)
    if (showConnectionTrouble(kind, blob) || showConnectionTrouble(kind, rawText)) {
      const host = noticeHost(blob)
      const cause = item.id === 'dropped' ? disconnectStatusSentence(host, loc) : tg(PNG5_CAUSE[item.id])
      setError(cause)
      if (detail) setErrorDetail(detail)
      return cause
    }
    if (kind === 'unreachable') {
      const host = noticeHost(blob)
      const cause = tg('pf5.sshUnreachable', { host: host || tg('pf5.thisHost') })
      setError(cause)
      return cause
    }
    if (kind === 'auth') {
      setError(tg('pf5.auth'))
      return tg('pf5.auth')
    }
    if (kind === 'dropped') {
      const cause = disconnectStatusSentence(noticeHost(blob), loc)
      setError(cause)
      return cause
    }
    if (kind === 'permission') {
      setError(tg('pf5.sftpPerm'))
      return tg('pf5.sftpPerm')
    }
    if (kind === 'import') {
      setError(tg('pf5.importFail'))
      return tg('pf5.importFail')
    }
    if (isEngineerLeak(fe.message)) {
      const cause = tg('png5.cause.generic')
      setError(cause)
      setErrorDetail(detail || fe.message)
      return cause
    }
    setError(fe.message)
    return fe.message
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
  const [knownHostsOpen, setKnownHostsOpen] = useState(false)
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
      // D3 / D4: Ctrl+R history (only from a terminal), Ctrl+P quick switch
      const k = e.key.length === 1 ? e.key.toLowerCase() : ''
      if (!e.shiftKey && k === 'r') {
        const inTerm = (document.activeElement as HTMLElement | null)?.closest?.('.xterm')
        if (!inTerm || !activeSessionIdRef.current) return
        e.preventDefault()
        e.stopPropagation()
        setQuickPick('history')
        return
      }
      if (!e.shiftKey && k === 'p') {
        e.preventDefault()
        e.stopPropagation()
        setQuickPick('switch')
        return
      }
      const list = tabsRef.current
      if (!list.length) {
        if (e.key === 'Tab') {
          e.preventDefault()
          showToast(tg('tab.none'))
        }
        return
      }
      let target: string | undefined
      if (e.key === 'Tab') {
        // D4: most-recently-used order; presses within 1.2 s keep walking the same snapshot
        const now = Date.now()
        const chain = tabChainRef.current
        const ids = list.map((t) => t.tabId)
        if (!chain || now - chain.at > 1200) tabChainRef.current = { snap: mruOrder(mruRef.current, ids), idx: 0, at: now }
        const c = tabChainRef.current!
        c.snap = c.snap.filter((id) => ids.includes(id))
        c.idx = (c.idx + (e.shiftKey ? -1 : 1) + c.snap.length) % Math.max(1, c.snap.length)
        c.at = now
        const nextId = c.snap[c.idx]
        if (nextId) setActiveTabId(nextId)
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
    window.addEventListener('aiss:close-menus', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('aiss:close-menus', close)
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
    const describeSource = (r: { source?: Parameters<typeof sourceLabel>[0]; tried?: Array<Parameters<typeof sourceLabel>[0]>; fellBack?: boolean }) => {
      const src = r.source ? sourceLabel(r.source, locale) : ''
      const first = r.tried?.[0]
      return r.fellBack && first ? tg('upd.sourceFallback', { source: src, from: sourceLabel(first, locale) }) : src
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
          source: r.source ? describeSource(r) : undefined
        }
        if (!manual && isSkipped(r.latestVersion)) return
        setUpdateInfo(info)
        if (manual) setUpdateModalOpen(true)
        return
      }
      if (!manual) return
      if (r.status === 'error') failUpdate()
      else showToast(r.source ? `${tg('upd.upToDate', { version: r.currentVersion })} · ${tg('upd.source', { source: describeSource(r) })}` : tg('upd.upToDate', { version: r.currentVersion }))
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
  const [batchQueue, setBatchQueue] = useState<{ queued: number; total: number; started: number; ok: number; fail: number; current?: string } | null>(null)
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
  const [reconnectAllBusy, setReconnectAllBusy] = useState(false)
  // G2 welcome tour, UX-09 host picker, A1 AI explain card, UX-10 indicators
  const [tourOpen, setTourOpen] = useState(false)
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => loadWelcomePrefs().dismissed)
  const [welcomeCompleted, setWelcomeCompleted] = useState(() => loadWelcomePrefs().completed)
  const [welcomeReplay, setWelcomeReplay] = useState(false)
  const [welcomeNotesHeld, setWelcomeNotesHeld] = useState(false)
  const welcomeSeen = useRef(false)
  /** P11-1: Help → welcome must survive the "hosts already exist" auto-complete. */
  const helpWelcomeReplay = useRef(false)
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
  /** PNG-5: keep the failure card mounted so the primary button can show a loading guard. */
  const failureHoldRef = useRef(false)
  /** 连接中关闭的 tab，避免连上后仍挂会话 */
  const cancelledConnectingTabsRef = useRef(new Set<string>())
  const connectingSinceRef = useRef(new Map<string, number>())
  const batchBusyRef = useRef(false)
  const batchCancelRef = useRef(false)
  const batchQueuedRef = useRef(0)
  const connectManyRef = useRef<(hosts: BatchHost[]) => Promise<void>>(async () => {})

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? null
  // M22: per-tab temporary AI policy, memory only. Dropped when the tab closes or disconnects.
  const [tempPolicyByTab, setTempPolicyByTab] = useState<Record<string, AiPolicy>>({})
  useEffect(() => {
    setTempPolicyByTab((prev) => {
      const ids = Object.keys(prev)
      if (ids.length === 0) return prev
      const keep = ids.filter((id) => tabs.some((t) => t.tabId === id && t.status === 'connected'))
      if (keep.length === ids.length) return prev
      return Object.fromEntries(keep.map((id) => [id, prev[id]]))
    })
  }, [tabs])
  const activeTabProfile = activeTab?.profileId ? sessionState.profiles.find((p) => p.id === activeTab.profileId) ?? null : null
  const activeIsSession = !activeTab?.view || activeTab.view === 'session'
  const activeSessionId =
    activeIsSession && activeTab?.status === 'connected' ? activeTab.sessionId : null
  // M23: one AI conversation per terminal tab. Same host in two tabs → #1 / #2.
  const convOrdinalsRef = useRef<Record<string, number>>({})
  const convTabs = useMemo(
    () =>
      tabs
        .filter((t) => !t.view || t.view === 'session')
        .map((t) => ({
          tabId: t.tabId,
          group: conversationGroup({ profileId: t.profileId, host: t.connectOpts?.host, port: t.connectOpts?.port }),
          hostLabel: t.customTitle || (t.profileId ? sessionState.profiles.find((p) => p.id === t.profileId)?.label : undefined) || t.connectOpts?.host || t.title,
          status: t.status
        })),
    [tabs, sessionState.profiles]
  )
  const convOrdinals = useMemo(() => {
    const next = assignConversationOrdinals(convOrdinalsRef.current, convTabs)
    convOrdinalsRef.current = next
    return next
  }, [convTabs])
  const convFor = useCallback(
    (tabId: string | null | undefined) => {
      const row = convTabs.find((t) => t.tabId === tabId)
      if (!row) return null
      const n = convOrdinals[row.tabId] ?? 1
      return { ...row, n, key: conversationKey(row.group, n), label: conversationLabel(row.hostLabel, n) }
    },
    [convTabs, convOrdinals]
  )
  const activeConv = activeIsSession ? convFor(activeTabId) : null
  // D29: a closed tab's #2/#3 conversation would be unreachable (reopening gets #1); archive it so it can be continued
  const convSeenRef = useRef<Map<string, { key: string; group: string; label: string; n: number }>>(new Map())
  useEffect(() => {
    const live = new Set(convTabs.map((t) => t.tabId))
    for (const [tabId, c] of convSeenRef.current) {
      if (live.has(tabId)) continue
      convSeenRef.current.delete(tabId)
      if (c.n <= 1 || !window.aiss.ai.chatArchive) continue
      void window.aiss.ai.getChatHistory(c.key).then(async (msgs) => {
        if (!msgs.length) return
        await window.aiss.ai.chatArchive!.add({ id: `${Date.now().toString(36)}-${c.n}`, group: c.group, hostLabel: c.label, key: c.key, title: archiveTitle(msgs) || tg('ai.untitledChat'), savedAt: Date.now(), messages: msgs })
        await window.aiss.ai.setChatHistory(c.key, [])
      }).catch(() => undefined)
    }
    for (const t of convTabs) {
      const c = convFor(t.tabId)
      if (c) convSeenRef.current.set(t.tabId, { key: c.key, group: c.group, label: c.label, n: c.n })
    }
  }, [convTabs, convFor])
  const aiTargets = useMemo(
    () =>
      convTabs
        .filter((t) => t.status === 'connected')
        .map((t) => {
          const n = convOrdinals[t.tabId] ?? 1
          return { tabId: t.tabId, n, label: conversationLabel(t.hostLabel, n), active: t.tabId === activeTabId }
        }),
    [convTabs, convOrdinals, activeTabId]
  )
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
            tags: prof?.tags,
            readonly: stricterLevel(effectiveLevel(prof), Boolean(tab.profileId && sessionRo[tab.profileId])) === 'readonly' && !isElevated(prof?.id, elevateMap)
          }
        }),
    [tabs, profiles, sessionRo, elevateMap]
  )
  const [siOn, setSiOn] = useState(() => shellIntOn())
  // D18: blocks stay off by default; after a few real commands, point to them once
  useEffect(() => {
    let submitted = 0
    const onCmd = (e: Event) => {
      const sid = (e as CustomEvent<{ sessionId: string }>).detail?.sessionId
      submitted += 1
      let shown = true
      try {
        shown = localStorage.getItem(BLOCKS_HINT_KEY) === '1'
      } catch {
        shown = true
      }
      if (!shouldHintBlocks({ enabled: blocksEnabled(), shown, submitted, demo: !sid || isDemoSessionId(sid) })) return
      try {
        localStorage.setItem(BLOCKS_HINT_KEY, '1')
      } catch {
        /* ignore */
      }
      showToast(tg('d18.hint'), { ms: 12000, actions: [{ label: tg('d18.enable'), run: () => setBlocksOn(turnBlocks(true)) }] })
    }
    window.addEventListener(COMMAND_SUBMITTED_EVENT, onCmd)
    return () => window.removeEventListener(COMMAND_SUBMITTED_EVENT, onCmd)
  }, [])
  // D27: Shell Integration is off by default; on the first normal SSH session, offer it once
  const siHintRef = useRef(false)
  useEffect(() => {
    if (siHintRef.current) return
    const tab = tabs.find((t) => t.tabId === activeTabId && t.status === 'connected' && t.sessionId)
    if (!tab?.sessionId) return
    let shown = true
    try {
      shown = localStorage.getItem(SI_HINT_KEY) === '1'
    } catch {
      shown = true
    }
    const prof = tab.profileId ? profiles.find((p) => p.id === tab.profileId) : undefined
    const level = stricterLevel(effectiveLevel(prof), Boolean(tab.profileId && sessionRo[tab.profileId]))
    if (!shouldHintShellInt({ enabled: shellIntOn(), shown, kind: tab.kind, demo: isDemoSessionId(tab.sessionId), level })) return
    siHintRef.current = true
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(SI_HINT_KEY, '1')
      } catch {
        /* ignore */
      }
      showToast(tg('d27.hint'), { ms: 15000, actions: [{ label: tg('d18.enable'), run: () => setShellIntOn(true) }] })
    }, 2500)
    return () => {
      window.clearTimeout(timer)
      siHintRef.current = false
    }
  }, [tabs, activeTabId, profiles, sessionRo])
  useEffect(() => {
    const sync = () => setSiOn(shellIntOn())
    window.addEventListener(SHELL_INT_EVENT, sync)
    return () => window.removeEventListener(SHELL_INT_EVENT, sync)
  }, [])
  const onlineSessionIds = useMemo(() => new Set(connectedSshSessions.map((s) => s.sessionId)), [connectedSshSessions])
  // D7b: production / read-only hosts always preview multi-line pastes
  useEffect(() => {
    const keys: string[] = []
    for (const tab of tabs) {
      if (tab.kind === 'local') continue
      const prof = profiles.find((p) => p.id === tab.profileId)
      if (stricterLevel(effectiveLevel(prof), Boolean(tab.profileId && sessionRo[tab.profileId])) !== 'normal') keys.push(sessionHostKey(tab))
    }
    setStrictPasteHosts(keys)
  }, [tabs, profiles, sessionRo])
  const cmdkHostEntries = useMemo(() => {
    const out: Array<{ id: string; label: string; host: string; username: string; port: number; recent?: boolean }> = []
    const seen = new Set<string>()
    for (const r of recentRows.slice(0, 8)) {
      const p =
        profiles.find((x) => x.id === r.id) ||
        profiles.find((x) => x.host === r.host && (x.port || 22) === (r.port || 22) && x.username === r.username)
      if (!p || seen.has(p.id)) continue
      seen.add(p.id)
      out.push({
        id: p.id,
        label: p.label || r.label || `${p.username}@${p.host}`,
        host: p.host,
        username: p.username,
        port: p.port || 22,
        recent: true
      })
    }
    for (const p of profiles) {
      if (seen.has(p.id)) continue
      if (out.length >= 24) break
      seen.add(p.id)
      out.push({
        id: p.id,
        label: p.label || `${p.username}@${p.host}`,
        host: p.host,
        username: p.username,
        port: p.port || 22
      })
    }
    return out
  }, [profiles, recentRows])

  // D3: Ctrl+R history / snippet picker
  const [pickSnippets, setPickSnippets] = useState<CommandSnippet[]>([])
  useEffect(() => {
    if (quickPick !== 'history') return
    void window.aiss.snippets.list().then(setPickSnippets).catch(() => undefined)
  }, [quickPick])
  const [histHostOnly, setHistHostOnly] = useState(() => loadHostOnly())
  const rankHistory = useCallback(
    (q: string) =>
      rankHistoryPick({ query: q, hostKey: activeTab ? sessionHostKey(activeTab) : '', entries: loadSmartHistory(), snippets: pickSnippets, hostOnly: histHostOnly, cwd: activeTab?.sessionId ? getSessionCwd(activeTab.sessionId) : null }),
    [activeTab, pickSnippets, histHostOnly]
  )
  // D4: Ctrl+P open tabs (MRU) + saved hosts
  const rankSwitch = useCallback(
    (q: string) => {
      const qt = parseQuickTarget(q)
      const ranked = rankSwitchPick({
        query: q,
        tabs: tabs.map((t) => ({
          tabId: t.tabId,
          title: t.customTitle || t.title,
          detail: t.connectOpts?.host ? `${t.connectOpts.username ? t.connectOpts.username + '@' : ''}${t.connectOpts.host}` : undefined,
          connected: t.status === 'connected'
        })),
        mru: mruRef.current,
        currentTabId: activeTabId,
        hosts: profiles.map((p) => ({ id: p.id, label: p.label || `${p.username}@${p.host}`, detail: `${p.username}@${p.host}${p.port && p.port !== 22 ? ':' + p.port : ''}` }))
      })
      if (!qt) return ranked
      const saved = matchProfile(profiles, qt)
      const item: PickItem = {
        id: 'qc',
        kind: 'host',
        label: tg(saved ? 'd13.connectSaved' : 'd13.connect', { target: quickTargetLabel(qt) }),
        detail: [qt.identity ? `-i ${qt.identity}` : '', qt.jump?.length ? `-J ${qt.jump.map(quickTargetLabel).join(',')}` : '', saved ? saved.label || '' : tg('d13.notSaved')].filter(Boolean).join(' · '),
        value: `qc:${q}`,
        indices: []
      }
      return [item, ...ranked.filter((x) => !(saved && x.kind === 'host' && x.value === saved.id))]
    },
    [tabs, activeTabId, profiles]
  )

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
  useEffect(() => {
    if (!activeSessionId || !activeIsSsh) {
      setStatusLatencyMs(undefined)
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      let ms: number | null = null
      try {
        ms = await window.aiss.workspace.ping(activeSessionId)
      } catch {
        ms = null
      }
      if (!alive) return
      setStatusLatencyMs(ms)
      timer = setTimeout(() => void tick(), LATENCY_POLL_MS)
    }
    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [activeSessionId, activeIsSsh])
  const isRecordingActive = Boolean(activeSessionId && recordingSessionId === activeSessionId)
  const connectedSshSessionsRef = useRef(connectedSshSessions)
  connectedSshSessionsRef.current = connectedSshSessions
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const snippetsHotkeyRef = useRef<import('@shared/ipc').CommandSnippet[]>([])
  useEffect(() => {
    const loadSnips = () => {
      void window.aiss.snippets.list().then((list) => {
        snippetsHotkeyRef.current = Array.isArray(list) ? list : []
      }).catch(() => {
        snippetsHotkeyRef.current = []
      })
    }
    loadSnips()
    window.addEventListener(SNIPPET_HOTKEY_EVENT, loadSnips)
    return () => window.removeEventListener(SNIPPET_HOTKEY_EVENT, loadSnips)
  }, [])
  const addDemoHostRef = useRef<(connect: boolean) => Promise<void>>(async () => undefined)
  const activeIsDemo = Boolean(activeIsSession && activeTab?.status === 'connected' && activeTab.connectOpts.demo)
  // X3 / UX-10: broadcast targets are explicit; fall back to split pair for legacy
  const broadcastSessions = useMemo(() => {
    if (!broadcastEnabled) return [] as string[]
    if (broadcastTargets.length >= 2) return broadcastTargets
    if (splitEnabled && activeSessionId) return [...new Set([activeSessionId, splitSecondary || activeSessionId])]
    return activeSessionId ? [activeSessionId] : []
  }, [broadcastEnabled, broadcastTargets, splitEnabled, activeSessionId, splitSecondary])

  const broadcastPickerTabs = useMemo(() => {
    return tabs
      .filter((x) => x.sessionId && x.status === 'connected' && (!x.view || x.view === 'session') && x.kind !== 'local')
      .map((x) => {
        const profile = x.profileId ? profiles.find((p) => p.id === x.profileId) : undefined
        return {
          sessionId: x.sessionId!,
          title: x.customTitle || x.title || x.sessionId!,
          group: profile?.folderId,
          isProd: effectiveLevel(profile) === 'production'
        }
      })
  }, [tabs, profiles])

  const broadcastLiveIds = useMemo(() => broadcastPickerTabs.map((x) => x.sessionId), [broadcastPickerTabs])

  // Keep last target set across picker reopen; drop ids whose sessions closed.
  useEffect(() => {
    setBroadcastTargets((prev) => {
      const next = pruneBroadcastTargets(prev, broadcastLiveIds)
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next
    })
  }, [broadcastLiveIds])

  useEffect(() => {
    if (!broadcastStillActive(broadcastEnabled, pruneBroadcastTargets(broadcastTargets, broadcastLiveIds))) {
      if (broadcastEnabled) setBroadcastEnabled(false)
    }
  }, [broadcastEnabled, broadcastTargets, broadcastLiveIds])
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
      .then(async (state) => {
        setSessionState(state)
        setSessionsReady(true)
        // M21: one-time move of old per-host / per-session tiers and the autopilot allow list
        // onto host profiles, then clear the legacy settings fields.
        try {
          const ai = await window.aiss.ai.getSettings()
          if (!hasLegacyHostPolicies(ai)) return
          const moved = migrateLegacyHostPolicies(ai, state.profiles, globalAiPolicy(ai))
          if (moved.changed > 0) {
            const next = { ...state, profiles: moved.profiles }
            setSessionState(next)
            await window.aiss.sessions.save(next)
          }
          await window.aiss.ai.setSettings({ safetyTierHosts: {}, safetyTierSessions: {}, autopilotAllowHosts: [] })
          window.dispatchEvent(new CustomEvent('aiss-ai-settings-saved'))
        } catch (e) {
          console.warn('[app] ai policy migration skipped', e)
        }
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

  // D77b: latest connect stage per target host:port
  const [connectStages, setConnectStages] = useState<Record<string, ConnectStageEvent>>({})
  const connectStagesRef = useRef<Record<string, ConnectStageEvent>>({})
  // D83: last failed attempt, for "copy diagnostics"
  const lastAttemptRef = useRef<{ opts: SshConnectOptions; startedAt: number; endedAt: number; stage: ConnectStageEvent | null } | null>(null)
  useEffect(() => {
    return window.aiss.ssh.onStage?.((e) => {
      connectStagesRef.current = { ...connectStagesRef.current, [e.target]: e }
      setConnectStages((prev) => ({ ...prev, [e.target]: e }))
    })
  }, [])

  useEffect(() => {
    return window.aiss.ssh.onHop((payload) => {
      if (batchBusyRef.current) return
      setHopProgress(payload)
    })
  }, [])

  // D23: an unanswered prompt times out in main; close it here instead of leaving dead buttons
  useEffect(() => {
    const off = window.aiss.ssh.onHostKeyExpired?.(({ requestId }) => {
      const cur = hostKeyShownRef.current
      if (cur?.requestId === requestId) {
        const advanced = advanceHostKey(hostKeyQueueRef.current)
        hostKeyShownRef.current = advanced.current
        hostKeyQueueRef.current = advanced.queue
        setHostKeyPrompt(advanced.current)
        showToast(tg('d23.expired', { host: `${cur.host}:${cur.port}` }), { kind: 'error' })
      } else hostKeyQueueRef.current = hostKeyQueueRef.current.filter((p) => p.requestId !== requestId)
    })
    return () => off?.()
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

  /** M21: per-host AI policy lives on the profile (undefined = follow global). */
  const setHostAiPolicy = useCallback(
    (profileId: string, policy: AiPolicy | undefined) => {
      const next = {
        ...sessionStateRef.current,
        profiles: sessionStateRef.current.profiles.map((p) => {
          if (p.id !== profileId) return p
          const row = { ...p }
          if (policy) row.aiPolicy = policy
          else delete row.aiPolicy
          return row
        })
      }
      void persistSessionState(next)
    },
    [persistSessionState]
  )

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
        /** D13d: raw failure + the tab that holds it */
        onFailRaw?: (raw: string, tabId: string) => void
      }
    ): Promise<string | null> => {
      const quiet = Boolean(extra?.quiet)
      const focus = extra?.focus ?? !quiet
      if (!quiet) {
        if (!failureHoldRef.current) setError(null)
        lastConnectErrorRef.current = null
        setConnecting(true)
      }
      const tabId = uuid()
      const title = opts.label?.trim() || `${opts.username}@${opts.host}`
      cancelledConnectingTabsRef.current.delete(tabId)
      connectingSinceRef.current.set(tabId, Date.now())
      {
        const key = stageTarget(opts.host, opts.port)
        setConnectStages((prev) => {
          if (!(key in prev)) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
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
          jumpRetryFromFailedHop: policy.jumpRetryFromFailedHop,
          readyTimeoutSec: policy.connectTimeoutSec
        })
        clearConnectFail(connectFailKey(opts.username, opts.host, opts.port))
        // C3: every session that carries the agent is audited
        if (opts.agentForward) {
          appendAudit({ type: 'session.agentForward', host: opts.label || opts.host, source: 'user', outcome: 'allowed', detail: agentForwardAuditDetail('session', opts.host) })
        }
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
          setError(null)
          setJumpFail(null)
          setHopProgress(null)
        }
        if (quickOpenRef.current) setQuickStep(3)
        const kind = extra?.kind ?? meta.kind ?? 'ssh'
        if (!quiet && kind !== 'local') onFirstConnectRef.current()
        return sessionId
      } catch (e) {
        // D73: the user cancelled this attempt; the tab already shows as disconnected, no error card
        if (cancelledConnectingTabsRef.current.has(tabId)) {
          cancelledConnectingTabsRef.current.delete(tabId)
          return null
        }
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
          lastConnectErrorRef.current = noteFailure(raw)
          lastAttemptRef.current = {
            opts,
            startedAt: connectingSinceRef.current.get(tabId) ?? Date.now(),
            endedAt: Date.now(),
            stage: connectStagesRef.current[stageTarget(opts.host, opts.port)] ?? null
          }
        }
        setTabs((prev) =>
          prev.map((t) => (t.tabId === tabId ? { ...t, status: 'disconnected', failRaw: raw } : t))
        )
        // D88: Recent shows a red dot with this reason until the next success
        noteConnectFail(connectFailKey(opts.username, opts.host, opts.port), shown)
        extra?.onError?.(shown)
        extra?.onFailRaw?.(raw, tabId)
        return null
      } finally {
        if (!quiet) setConnecting(false)
      }
    },
    []
  )

  const tabsRef = useRef(tabs)
  // D60: search across all terminal tabs
  const [searchAllOpen, setSearchAllOpen] = useState(false)
  const searchAllLabel = useCallback((sid: string) => {
    const t = tabsRef.current.find((x) => x.sessionId === sid && !x.view)
    return t ? t.title : null
  }, [])
  const searchAllPick = useCallback((sid: string, query: string) => {
    const t = tabsRef.current.find((x) => x.sessionId === sid && !x.view)
    if (!t) return
    setActiveTabId(t.tabId)
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(AISS_TERMINAL_FIND_EVENT, { detail: { query } })), 80)
  }, [])
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
    const raf = window.requestAnimationFrame(() => measure())
    return () => {
      window.cancelAnimationFrame(raf)
      ro.disconnect()
      scroll.removeEventListener('scroll', measure)
      bar.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [tabs.length, locale, layout.showMain, layout.showSidebar, layout.showAi])
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
    // D108: close only when the strip STOPS overflowing; the button is always shown, so the old check
    // ("not overflowing → close") shut the list in the same render it opened (flash)
    const was = tabStripWasOverflowingRef.current
    tabStripWasOverflowingRef.current = tabStripOverflowing
    if (was && !tabStripOverflowing && tabOverflowOpen && tabOverflowFromRef.current !== 'palette') setTabOverflowOpen(false)
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
        // D37: offline: don't burn an attempt; the 'online' listener resumes this tab right away
        if (navigator.onLine === false) {
          autoRetryRef.current.set(tabId, { attempt: attempt - 1, timer: 0 as unknown as ReturnType<typeof setTimeout> })
          if (!netWaitToastRef.current) {
            netWaitToastRef.current = true
            showToast(tg('d37.waitNet'))
          }
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

  // D37: network back: retry pending tabs immediately instead of waiting for the countdown
  const netWaitToastRef = useRef(false)
  useEffect(() => {
    const retryPendingNow = (ids: string[]) => {
      for (const id of ids) {
        const cur = autoRetryRef.current.get(id)
        if (cur) clearTimeout(cur.timer)
        void reconnectTabRef.current(id, { full: false }).then((sid) => {
          if (sid) cancelAutoReconnect(id)
          else if (autoRetryRef.current.has(id)) scheduleAutoReconnectRef.current(id)
        })
      }
    }
    const pendingIds = () => [...autoRetryRef.current.keys()].filter((id) => !haltedRef.current.has(id))
    const onOnline = () => {
      netWaitToastRef.current = false
      const ids = pendingIds()
      if (!ids.length) return
      showToast(tg('d37.netBack', { n: ids.length }))
      retryPendingNow(ids)
    }
    // D40: after sleep, pending tabs retry now; connected SSH tabs get a quick check and dead ones go through the normal auto-reconnect
    const onResume = () => {
      retryPendingNow(pendingIds())
      const live = tabsRef.current.filter((t) => t.kind !== 'local' && t.status === 'connected' && t.sessionId && !isDemoSessionId(t.sessionId))
      void Promise.all(live.map(async (t) => ({ t, ms: await window.aiss.workspace.ping(t.sessionId!).catch(() => null) }))).then((rows) => {
        const dead = rows.filter((r) => r.ms === null).map((r) => r.t)
        if (!dead.length) return
        showToast(tg('d40.resumeDead', { n: dead.length }))
        for (const t of dead) {
          setTabs((prev) => prev.map((x) => (x.tabId === t.tabId ? { ...x, status: 'disconnected' as const, failRaw: tg('d40.reason') } : x)))
          void window.aiss.ssh.disconnect(t.sessionId!).catch(() => {})
          if (!haltedRef.current.has(t.tabId)) scheduleAutoReconnectRef.current(t.tabId)
        }
      })
    }
    window.addEventListener('online', onOnline)
    const offResume = window.aiss.ssh.onPowerResume?.(onResume)
    return () => {
      window.removeEventListener('online', onOnline)
      offResume?.()
    }
  }, [cancelAutoReconnect])

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
      if (!quiet && !failureHoldRef.current) setError(null)
      setReconnectingTabId(tabId)
      const policy = policyRef.current
      const hop = jumpFailRef.current
      const startHop = resumeStartHop(hop?.total ?? 0, hop && hop.profileId === tab.profileId ? hop.hop : null, policy.jumpRetryFromFailedHop, Boolean(how?.full))
      const resumeFromHop = how?.full ? undefined : startHop > 1 ? startHop : undefined
      try {
        if (tab.kind === 'local') {
          const prevLocalCwd = getSessionCwd(tab.sessionId) ?? tab.restoreCwd ?? null
          const { sessionId, meta } = await window.aiss.ssh.openLocalShell(prevLocalCwd ? { cwd: prevLocalCwd } : undefined)
          // D20b: the shell was spawned there, so no cd line is typed
          if (meta.startCwd) {
            setSessionCwd(sessionId, meta.startCwd)
            showToast(tg('cwd.restored', { path: meta.startCwd }))
          }
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
          readyTimeoutSec: policy.connectTimeoutSec,
          resumeFromHop
        })
        if (tab.connectOpts.agentForward) {
          appendAudit({
            type: 'session.agentForward',
            host: tab.connectOpts.label || tab.connectOpts.host,
            source: 'user',
            outcome: 'allowed',
            detail: agentForwardAuditDetail('session', tab.connectOpts.host)
          })
        }
        // B3: bring back forwards added from the panel. -R is skipped on read-only hosts.
        if (tab.sessionId && window.aiss.workspace.forwards.restore) {
          const prof = tab.profileId ? profilesRef.current.find((p) => p.id === tab.profileId) : undefined
          const ro =
            stricterLevel(effectiveLevel(prof), Boolean(tab.profileId && sessionRoRef.current[tab.profileId])) === 'readonly' &&
            !isElevated(prof?.id, loadElevate())
          void window.aiss.workspace.forwards
            .restore({ fromSessionId: tab.sessionId, toSessionId: sessionId, allowRemote: !ro })
            .then((r) => {
              const skippedRo = r.skipped.filter((s) => s.reason === 'readonly').length
              if (skippedRo) showToast(tg('pfR.skippedReadonly', { n: skippedRo }))
              else if (r.restored.length && !quiet) showToast(tg('pfR.restored', { n: r.restored.length }))
            })
            .catch(() => undefined)
        }
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
        // D2: return to the previous working directory (navigation only, no user command is replayed)
        {
          const prevCwd = getSessionCwd(tab.sessionId) ?? tab.restoreCwd ?? null
          const cdLine = cdCommandFor(prevCwd)
          if (prevCwd && cdLine) {
            setSessionCwd(sessionId, prevCwd)
            window.setTimeout(() => void window.aiss.ssh.write(sessionId, cdLine + '\r').catch(() => undefined), 400)
            showToast(tg('cwd.restored', { path: prevCwd }))
          }
        }
        if (!quiet) {
          setError(null)
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
          if (tab.profileId) failedProfileIdRef.current = tab.profileId
          lastConnectErrorRef.current = noteFailure(raw)
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
        ...(agentForward ? { agentForward: true } : {}),
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
    certificatePath,
    agentForward
  ])

  const closeTabRef = useRef<(tabId: string, sessionId: string, status: Tab['status'], view?: TabView) => void>(() => {})
  const closedTabsRef = useRef<ClosedTabSnap[]>([])
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
    const closing = curTabs[idx]
    if (closing && (!closing.view || closing.view === 'session') && closing.connectOpts) {
      closedTabsRef.current = pushClosedTab(closedTabsRef.current, {
        connectOpts: closing.connectOpts,
        profileId: closing.profileId,
        hostInventoryId: closing.hostInventoryId,
        kind: closing.kind === 'local' ? 'local' : 'ssh',
        title: closing.customTitle || closing.title
      })
    }
    const rest = curTabs.filter((t) => t.tabId !== tabId)
    const fallback = rest[Math.min(Math.max(idx, 0), Math.max(rest.length - 1, 0))]?.tabId ?? null
    setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
    setActiveTabId((cur) => (cur === tabId ? fallback : cur))
  }, [])
  closeTabRef.current = closeTab

  const commitRename = useCallback((raw?: string) => {
    const id = renamingTabId
    if (!id) return
    const title = normalizeTabTitle(raw !== undefined ? raw : renameDraft)
    if (title) setTabs((prev) => prev.map((t) => (t.tabId === id ? { ...t, title, customTitle: title } : t)))
    setRenamingTabId(null)
  }, [renamingTabId, renameDraft])

  const startRename = useCallback((tabId: string) => {
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    if (!tab) {
      showToast(tg('tab.none'))
      return
    }
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

  // c53 AA1: executors for AI-proposed app actions. Only called after the user confirms the card.
  const onAppAction = useCallback(
    async (name: string, v: Record<string, string>): Promise<ActionResult> => {
      const r = await runAppActionRef.current(name, v)
      // c54: every confirmed AI action lands in the audit log (secrets never included)
      appendAudit({ type: 'ai.action', host: v.host || v.target || '', source: 'AI', outcome: r.ok ? 'allowed' : 'blocked', detail: auditDetailForAction(name, v) + (r.ok ? '' : ' · ' + (r.message ?? '')) })
      return r
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folders, persistSessionState, alertRules, showToast, activeSessionId]
  )
  // c55: always run the latest executor (onAppAction is memoized; this avoids stale state)
  const runAppActionRef = useRef<(name: string, v: Record<string, string>) => Promise<ActionResult>>(async () => ({ ok: false }))
  runAppActionRef.current = async (name: string, v: Record<string, string>): Promise<ActionResult> => {
    {
      if (name === 'connection.open') {
        const r = resolveTargets(profilesRef.current, v.targets ?? '')
        if (r.missing.length) return { ok: false, message: tg('aa.noTarget', { target: r.missing.join(tg('aa.sep')) }) }
        for (const prof of r.found) void connectProfile(prof)
        const msg = tg('aa.connOpened', { n: r.found.length })
        showToast(msg)
        return { ok: true, message: msg }
      }
      if (name === 'history.fill') {
        if (!activeSessionId) return { ok: false, message: tg('aa.noSession') }
        const cmd = pickHistoryForAction(loadSmartHistory(), v.query ?? '', activeTab ? sessionHostKey(activeTab) : '')
        if (!cmd) return { ok: false, message: tg('aa.noHistory', { query: v.query ?? '' }) }
        fillCommandBar(activeSessionId, cmd)
        return { ok: true, message: tg('aa.histFilled', { cmd }) }
      }
      if (name === 'sftp.open') {
        const prof = findProfileForAction(profilesRef.current, v.target ?? '')
        if (!prof) return { ok: false, message: tg('aa.noTarget', { target: v.target ?? '' }) }
        if (!sftpPathOk(v.path ?? '')) return { ok: false, message: tg('aa.badPath') }
        openSftpFromHost(prof, (v.path ?? '').trim() || undefined)
        return { ok: true, message: tg('aa.sftpOpened', { name: prof.label }) }
      }
      if (name === 'snippet.create') {
        const cur = await window.aiss.snippets.list()
        const r = buildSnippetFromAction(v, cur, uuid)
        await window.aiss.snippets.save(r.list)
        // c55: stay on the AI panel so the card shows its result (E2E caught the card vanishing)
        window.dispatchEvent(new CustomEvent('aiss-snippets-changed'))
        const msg = tg('aa.snippetSaved', { name: r.snippet.title })
        showToast(msg)
        return { ok: true, message: msg }
      }
      if (name === 'forward.create') {
        if (!activeSessionId) return { ok: false, message: tg('aa.noSession') }
        const req = forwardRequestFromAction(v, activeSessionId)
        try {
          await window.aiss.workspace.forwards.add(req)
        } catch (err) {
          return { ok: false, message: cleanIpcError(err) }
        }
        const msg = tg('aa.forwardAdded', { local: req.localPort, remote: `${req.remoteHost}:${req.remotePort}` })
        showToast(msg)
        return { ok: true, message: msg }
      }
      if (name === 'connection.add') {
        const r = buildProfileFromAction(v, profilesRef.current, uuid)
        await persistSessionState({ folders, profiles: r.profiles })
        const msg = tg(r.updated ? 'aa.connUpdated' : 'aa.connSaved', { name: r.profile.label })
        showToast(msg)
        return { ok: true, message: msg }
      }
      if (name === 'monitor.configure') {
        const next = applyMonitorAction(alertRules, v)
        saveAlertRules(next)
        setAlertRules(next)
        const msg = tg('aa.monitorSaved', { metric: v.metric })
        showToast(msg)
        return { ok: true, message: msg }
      }
      return { ok: false, message: tg('aa.noExecutor') }
    }
  }
  const saveProfile = useCallback(() => {
    if (!host.trim() || !username.trim()) {
      setError(tg('app.needHostUser'))
      showToast(tg('app.needHostUser'), { kind: 'error' })
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
      agentForward: agentForward || undefined,
      autoRecord: formAutoRecord,
      ...(forwards ? { forwards } : {}),
      protection,
      ...(normalizeSessionNote(sessionNote) ? { note: normalizeSessionNote(sessionNote) } : { note: undefined })
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
    const savedLabel = label.trim() || `${u}@${h}`
    showToast(tg('app.profileSaved', { name: savedLabel }))
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
    agentForward,
    formAutoRecord,
    sessionNote
  ])

  const resetConnectionForm = useCallback(() => {
    setHost('')
    setPort('22')
    setUsername('')
    setPassword('')
    setPrivateKeyPath('')
    setPassphrase('')
    setLabel('')
    setSessionNote('')
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
    setAgentForward(false)
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
    setSessionNote(profile.note ?? '')
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
    setAgentForward(profile.agentForward === true)
    setFormAutoRecord(Boolean(profile.autoRecord))
  }, [])

  const openConnectionEditor = useCallback(
    (profile?: SavedSessionProfile, focus?: 'jump' | 'cert' | 'note' | null) => {
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
        showToast(tg('app.needSshSftp'), { kind: 'error' })
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
        showToast(tg('app.needSshSftp'), { kind: 'error' })
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
        showToast(tg('app.needSshSftp'), { kind: 'error' })
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

  const openAudit = useCallback((host?: string, focusId?: string) => {
    ensureMainVisible()
    setAuditEvents(loadAudit())
    const title = host ? `${tg('l4.auditTitle')} · ${host}` : tg('l4.auditTitle')
    const ex = tabsRef.current.find((t) => t.view === 'audit')
    if (ex) {
      setTabs((prev) => prev.map((t) => (t.tabId === ex.tabId ? { ...t, title, auditHost: host, auditFocusId: focusId } : t)))
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
        auditHost: host,
        auditFocusId: focusId
      }
    ])
    setActiveTabId(tabId)
  }, [ensureMainVisible])

  // 2.4: global AI policy for the production banner; refreshed whenever AI settings are saved
  const [aiPolicySettings, setAiPolicySettings] = useState<AiPolicySettings | null>(null)
  useEffect(() => {
    const refresh = () => {
      void window.aiss.ai.getSettings().then((s) => setAiPolicySettings({ aiPolicy: s.aiPolicy, aiAutoHighRisk: s.aiAutoHighRisk, safetyTier: s.safetyTier }))
    }
    refresh()
    window.addEventListener('aiss-ai-settings-saved', refresh)
    return () => window.removeEventListener('aiss-ai-settings-saved', refresh)
  }, [])

  // 2.3: "审计记录" in an AI execution replay row
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id
      openAudit(undefined, id || undefined)
    }
    window.addEventListener(OPEN_AUDIT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_AUDIT_EVENT, onOpen)
  }, [openAudit])

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
    showToast(tg('w3.history'))
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
    showToast(tg('w4.opened'))
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
    showToast(tg('a5.opened'))
  }, [aiConfigured, openM2])

  const createDiffPlaybook = useCallback((info: { hostKey: string; hostTitle: string; path: string; fixes: Array<{ command: string; note?: string }> }) => {
    if (!info.fixes.length) {
      showToast(tg('l8b.noFixes'))
      return
    }
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
      showToast(tg('l2d.open'))
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
  // D101: same-name tabs read "name · 2" in strip order (split Select and tooltips use the same label)
  const tabDup = dupOrdinals(orderedTabs.map((t) => ({ id: t.tabId, label: labelFor(t) })))
  const dupLabelFor = (t: Pick<Tab, 'tabId'> & Parameters<typeof labelFor>[0]) => withOrdinal(labelFor(t), tabDup.get(t.tabId))
  const dupLabelBySession = (sid: string) => {
    const tab = orderedTabs.find((x) => x.sessionId === sid && (!x.view || x.view === 'session'))
    return tab ? dupLabelFor(tab) : ''
  }
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

  // M20: the main process enforces host protection on AI writes; keep its per-session copy current
  // (profile level, demo default, per-tab temporary read-only, elevation window).
  useEffect(() => {
    const push = window.aiss.ai.setSessionProtection
    if (!push) return
    for (const t of tabs) {
      if (!t.sessionId || (t.view && t.view !== 'session')) continue
      const g = guardForSession(t.sessionId)
      push(t.sessionId, { level: g.level, elevated: g.elevated })
    }
  }, [tabs, guardForSession])

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
    if (level === 'normal') {
      showToast(tg('s4.alreadyOff'))
      return
    }
    if (isElevated(p.id, loadElevate())) {
      showToast(tg('l4.alreadyUnlocked'))
      return
    }
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
      setAiConfigured(Boolean(p?.baseURL && hasUsableKey(p.baseURL, p.apiKey) && s?.model))
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
        showToast(tg('app.needSshDocker'), { kind: 'error' })
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
      const msg = tg('app.needSshRefreshDocker')
      setError(msg)
      showToast(msg, { kind: 'error' })
      return
    }
    const host =
      statusHostChipLabel(profile.label?.trim() || profile.host) || profile.label || profile.host || '—'
    showToast(tg('docker.refreshing', { host }))
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

  const openQuickTargetRef = useRef<(t: QuickTarget) => void>(() => undefined)
  const quickConnectRecent = useCallback(
    (row: RecentConnection) => {
      const match = profiles.find(
        (p) =>
          p.host === row.host &&
          p.username === row.username &&
          (p.port || 22) === (row.port || 22)
      )
      if (match) {
        showToast(tg('recent.connecting', { host: match.label?.trim() || match.host }))
        connectProfile(match)
        return
      }
      // D13c: quick rows reconnect with the same user / port / -i / -J
      const qt = recentConnectTarget(row)
      if (qt) {
        openQuickTargetRef.current(qt)
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
      showToast(tg('recent.needCreds'))
    },
    [connectProfile, openConnectionEditor, profiles]
  )

  // D13: quick connect from Ctrl+P — saved host connects, otherwise a prefilled form (password / key still needed)
  /** D13b/D21: connection editor pre-filled from a quick target (save is the user's click) */
  const prefillQuickTarget = useCallback(
    (t: QuickTarget, name = '') => {
      const jumpChain = t.jump?.length ? t.jump.map((h, i) => ({ id: `qc-${Date.now().toString(36)}-${i}`, host: h.host, port: h.port, username: h.username ?? t.username ?? '' })) : undefined
      resetConnectionForm()
      setEditingSavedId(null)
      setError(null)
      setHost(t.host)
      setPort(String(t.port))
      setUsername(t.username ?? '')
      if (name) setLabel(name)
      if (t.identity) {
        setConnAuth('key')
        setPrivateKeyPath(t.identity)
      }
      if (jumpChain) setJumpChain(jumpChain)
      openConnectionEditor()
    },
    [openConnectionEditor, resetConnectionForm]
  )
  const saveRecentAsHost = useCallback(
    (row: RecentConnection) => {
      const { target, label: name } = recentSaveTarget(row)
      prefillQuickTarget(target, name)
      showToast(tg('d21.prefilled', { target: quickTargetLabel(target) }))
    },
    [prefillQuickTarget]
  )
  const openQuickTarget = useCallback(
    (t: QuickTarget) => {
      const match = matchProfile(profiles, t)
      if (match) {
        showToast(tg('recent.connecting', { host: match.label?.trim() || match.host }))
        void connectProfile(match)
        return
      }
      const jumpChain = t.jump?.length ? t.jump.map((h, i) => ({ id: `qc-${Date.now().toString(36)}-${i}`, host: h.host, port: h.port, username: h.username ?? t.username ?? '' })) : undefined
      const prefill = () => prefillQuickTarget(t)
      // D13b: with a user we can try right away (key from -i or ~/.ssh defaults, like OpenSSH); saving is one click
      if (t.username) {
        // D13d: password hosts — auth failure asks for the password in a small dialog (kept in memory for this tab only)
        const askPassword = async (tabId: string, attempt: number): Promise<void> => {
          const pw = await promptDialog({
            title: tg('d13d.title', { target: quickTargetLabel(t) }),
            label: tg(attempt > 0 ? 'd13d.again' : 'd13d.label'),
            detail: tg('d13d.detail'),
            secret: true
          })
          if (!pw) return
          setTabs((prev) => prev.map((x) => (x.tabId === tabId ? { ...x, connectOpts: { ...x.connectOpts, password: pw, authMode: 'password' as const } } : x)))
          await new Promise((r) => window.setTimeout(r, 60))
          let failed = ''
          const sid = await reconnectTabRef.current(tabId, { full: true, onError: (m) => { failed = m } })
          if (!sid && shouldAskPassword(noticeKind(tabsRef.current.find((x) => x.tabId === tabId)?.failRaw || failed), t, attempt + 1)) await askPassword(tabId, attempt + 1)
        }
        void openSession({
          host: t.host,
          port: t.port,
          username: t.username,
          ...(t.identity ? { privateKeyPath: t.identity, authMode: 'key' as const } : {}),
          ...(jumpChain ? { jumpChain } : {}),
          quick: true
        }, { onFailRaw: (raw, tabId) => { if (shouldAskPassword(noticeKind(raw), t, 0)) void askPassword(tabId, 0) } })
        showToast(tg('d13b.connecting', { target: quickTargetLabel(t) }), { action: { label: tg('d13b.save'), run: prefill } })
        return
      }
      prefill()
      showToast(tg('d13.prefilled', { target: quickTargetLabel(t) }))
    },
    [connectProfile, openSession, prefillQuickTarget, profiles]
  )
  openQuickTargetRef.current = openQuickTarget
  const sidebarQuickHit = useMemo(() => sidebarQuick(sessionSearch, profiles), [sessionSearch, profiles])
  const runSidebarQuick = useCallback((): boolean => {
    if (!sidebarQuickHit) return false
    if (sidebarQuickHit.saved) void connectProfile(sidebarQuickHit.saved)
    else openQuickTarget(sidebarQuickHit.target)
    setSessionSearch('')
    return true
  }, [sidebarQuickHit, connectProfile, openQuickTarget])

  /** "Connect": focus an open tab for this host, otherwise connect (H1). */
  const openOrFocusProfile = useCallback(
    (p: SavedSessionProfile) => {
      const live = tabsRef.current.find((x) => x.profileId === p.id && x.status !== 'disconnected' && (!x.view || x.view === 'session'))
      if (live) {
        setActiveTabId(live.tabId)
        showToast(tg('sess.focusedExisting'))
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
      if (row.kind === 'terminal' && row.draft) putDraft(cmdDrafts, tabId, row.draft)
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
        pinned: row.pinned === true,
        openSeq: (row.order + 1) * 10,
        cold: plan.autoConnect && needsSession,
        restored: !plan.autoConnect && needsSession,
        restoreCwd: row.kind === 'terminal' ? row.cwd : undefined
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
  // D8: save each terminal's live cwd with the workspace, and once more when the window closes
  // D63: plus the unsent command-bar draft (only when safe to keep on disk)
  const withLiveCwd = (list: Tab[]) =>
    list.map((t) => ({ ...t, cwd: getSessionCwd(t.sessionId) ?? t.restoreCwd ?? null, draft: persistableDraft(getDraft(cmdDrafts, t.tabId), isSensitiveCommand, redactAuditText) }))
  useEffect(() => {
    const onUnload = () => {
      if (!sessionsReady || !bootedRef.current || !workspaceReadyRef.current) return
      const snapshot = snapshotWorkspace(withLiveCwd(tabsRef.current), activeTabIdRef.current)
      const ids = [...new Set(snapshot.filter((row) => row.kind === 'terminal' && row.profileId).map((row) => row.profileId!))]
      saveLastWorkspace({ profileIds: snapshot.length ? ids : [], tabs: snapshot })
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [sessionsReady])
  const restoreArmedAt = useRef(new Map<string, number>())
  const workspaceReady = useRef(false)
  const workspaceReadyRef = workspaceReady
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
    const snapshot = snapshotWorkspace(withLiveCwd(tabs), activeTabId)
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
      showToast(tg('ctx.renamed', { name: renamed }))
    },
    [folders, persistSessionState, profiles]
  )
  const onSidebarKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      // D56: ArrowUp/Down walk the visible host rows (folders, filter and order as shown)
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const rows = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-profile-id]')]
        if (!rows.length) return
        e.preventDefault()
        const ids = rows.map((r) => r.dataset.profileId!)
        const at = selectedProfileId ? ids.indexOf(selectedProfileId) : -1
        const next = at < 0 ? (e.key === 'ArrowDown' ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
        setSelectedProfileId(ids[next]!)
        rows[next]!.scrollIntoView({ block: 'nearest' })
        return
      }
      const p = profiles.find((x) => x.id === selectedProfileId)
      if (!p) {
        if (e.key === 'Enter' || e.key === 'F2' || e.key === 'Delete' || e.key === 'Backspace') {
          showToast(tg('l10.none'))
        }
        return
      }
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
  // D90: show the "ungroup" drop zone only while a host drag is in progress
  const [hostDragging, setHostDragging] = useState(false)
  useEffect(() => {
    if (!hostDragging) return
    const end = () => setHostDragging(false)
    window.addEventListener('dragend', end)
    window.addEventListener('drop', end)
    return () => {
      window.removeEventListener('dragend', end)
      window.removeEventListener('drop', end)
    }
  }, [hostDragging])

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
      onDragHost={(e) => {
        const ids = dragIds(p.id, multiSelected)
        e.dataTransfer.setData(HOST_DRAG_MIME, encodeHostDrag(ids))
        e.dataTransfer.effectAllowed = 'move'
        setHostDragging(true)
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

  const openLocalShell = useCallback(async (cwdOverride?: string | null) => {
    setError(null)
    setConnecting(true)
    try {
      // D25: a new local shell starts where the active local tab is (validated in main; home otherwise)
      const fromSid = activeSessionIdRef.current
      const inherit = (typeof cwdOverride === 'string' ? cwdOverride : null) ?? (fromSid && fromSid.startsWith('local:') ? getSessionCwd(fromSid) : null)
      const { sessionId, meta } = await window.aiss.ssh.openLocalShell(inherit ? { cwd: inherit } : undefined)
      if (meta.startCwd) setSessionCwd(sessionId, meta.startCwd)
      const tabId = uuid()
      const title = meta.label ?? tg('localShell.label')
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
      if (meta.startCwd) showToast(tg('d25.openedIn', { path: meta.startCwd }))
      else showToast(tg('localShell.opened'))
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const msg = /node-pty|本机 Shell 不可用|Local shell unavailable/i.test(raw) ? tg('localShell.unavailable') : raw
      setError(msg)
      showToast(msg, { kind: 'error' })
    } finally {
      setConnecting(false)
    }
  }, [])

  // D26: duplicate a tab into the same working directory (SSH: one leading-space cd after connect; local: spawn there)
  const duplicateTab = useCallback(
    async (tab: Tab) => {
      const cwd = getSessionCwd(tab.sessionId) ?? tab.restoreCwd ?? null
      if (tab.kind === 'local') {
        await openLocalShell(cwd)
        return
      }
      const sid = await openSession(tab.connectOpts, { profileId: tab.profileId, hostInventoryId: tab.hostInventoryId, kind: 'ssh' })
      const cdLine = cdCommandFor(cwd)
      if (sid && cwd && cdLine) {
        setSessionCwd(sid, cwd)
        window.setTimeout(() => void window.aiss.ssh.write(sid, cdLine + '\r').catch(() => undefined), 400)
        showToast(tg('d26.dupIn', { path: cwd }))
      }
    },
    [openLocalShell, openSession]
  )

  const startRecording = useCallback(async () => {
    if (!activeSessionId) {
      showToast(tg('toolbar.needSession'))
      return
    }
    setError(null)
    try {
      const path = await window.aiss.ssh.startRecording(activeSessionId)
      if (path) {
        setRecordingSessionId(activeSessionId)
        setRecordingStartedAt(Date.now())
        const tab = tabsRef.current.find((t) => t.sessionId === activeSessionId)
        const host =
          statusHostChipLabel(
            tab?.connectOpts.label?.trim() || tab?.connectOpts.host || tab?.title || tab?.customTitle
          ) || tab?.title || tab?.connectOpts.host || '—'
        showToast(tg('sess.recordingStarted', { host }))
      } else {
        setError(tg('app.recordFail'))
        showToast(tg('app.recordFail'), { kind: 'error' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      showToast(msg, { kind: 'error' })
    }
  }, [activeSessionId])

  const stopRecording = useCallback(async () => {
    if (!recordingSessionId) {
      showToast(tg('sess.notRecording'))
      return
    }
    const tab = tabsRef.current.find((t) => t.sessionId === recordingSessionId)
    const host =
      statusHostChipLabel(
        tab?.connectOpts.label?.trim() || tab?.connectOpts.host || tab?.title || tab?.customTitle
      ) || tab?.title || tab?.connectOpts.host || '—'
    try {
      await window.aiss.ssh.stopRecording(recordingSessionId)
      showToast(tg('sess.recordingStopped', { host }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      showToast(msg, { kind: 'error' })
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
    showToast(tg('app.folderCreated', { name }))
  }, [folders, persistSessionState, profiles])

  const renameFolder = useCallback(
    async (folderId: string, currentName: string) => {
      if (!folders.find((f) => f.id === folderId)) {
        showToast(tg('app.folderMissing'))
        setFolderMenu(null)
        return
      }
      const name = (await askText(tg('app.renameFolder'), currentName))?.trim()
      if (!name) return
      void persistSessionState({
        folders: folders.map((f) => (f.id === folderId ? { ...f, name } : f)),
        profiles
      })
      setFolderMenu(null)
      showToast(tg('app.folderRenamed', { name }))
    },
    [folders, persistSessionState, profiles]
  )

  const deleteFolder = useCallback(
    (folderId: string) => {
      const folder = folders.find((f) => f.id === folderId)
      if (!folder) {
        showToast(tg('app.folderMissing'))
        setFolderMenu(null)
        return
      }
      const name = folder.name
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
        showToast(tg('app.folderDeleted', { name }))
      })
    },
    [folders, persistSessionState, profiles]
  )

  const editProfileTags = useCallback(
    async (profileId: string) => {
      setSessionMenu(null)
      const cur = profiles.find((p) => p.id === profileId)
      if (!cur) {
        showToast(tg('l10.missing'))
        return
      }
      const input = await askText(tg('tags.prompt'), (cur.tags ?? []).join(', '))
      if (input == null) return
      const tags = normalizeTags(input)
      const next = profiles.map((p) => {
        if (p.id !== profileId) return p
        const { tags: _old, ...rest } = p
        return tags.length ? { ...rest, tags } : (rest as SavedSessionProfile)
      })
      void persistSessionState({ folders, profiles: next })
      showToast(tags.length ? tg('tags.saved', { tags: tags.join(', ') }) : tg('tags.cleared'))
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
      const n = ids.size
      if (targetFolderId) {
        const name = folders.find((f) => f.id === targetFolderId)?.name || '—'
        showToast(tg('app.movedToFolder', { n, name }))
      } else {
        showToast(tg('app.movedToUngrouped', { n }))
      }
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
        const msg = model.notes.join(' ') || tg('n2.empty')
        setSideInfo(msg)
        showToast(msg)
        return
      }
      openImportPreview(model)
    } catch (e) {
      noteFailure(e, 'import')
    }
  }, [openImportPreview, profiles, noteFailure])

  const importSshConfigPick = useCallback(async () => {
    setError(null)
    setSideInfo(null)
    try {
      const res = await window.aiss.sessions.importSshConfig()
      const model = buildImportPreview(res.items, profiles, res.notes)
      if (!model.rows.length) {
        const msg = model.notes.join(' ') || tg('n2.empty')
        setSideInfo(msg)
        showToast(msg)
        return
      }
      openImportPreview(model)
    } catch (e) {
      noteFailure(e, 'import')
    }
  }, [openImportPreview, profiles, noteFailure])

  const applyImport = useCallback(
    (policy: ImportPolicy) => {
      if (!importPreview) {
        showToast(tg('n2.empty'))
        return
      }
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
      const showImportMoment = shouldShowImportMoment({ count, off: loadPrefFlag(IMPORT_HINT_OFF_KEY) })
      if (showImportMoment) setImportMoment({ count, ids })
      // P12-5: value strip carries the import outcome — do not stack a synonym sideInfo/toast.
      if (!showImportMoment) {
        setSideInfo([tg('n2.added', { n: applied.added }), tg('n2.updated', { n: applied.updated }), tg('n2.skipped', { n: applied.skipped })].join(' · '))
      }
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
    if (!blob) {
      showToast(tg('conn.pasteEmpty'))
      return
    }
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
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      showToast(msg, { kind: 'error' })
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
    let okCount = 0
    let failCount = 0
    const noteFail = (id: string, label: string, reason: string) => {
      failCount += 1
      setBatchFails((prev) => [...prev.filter((row) => row.id !== id), { id, label, reason }])
      setBatchQueue((cur) => (cur ? { ...cur, fail: failCount, current: label } : cur))
      showToast(tg('l10.fail', { host: label, reason }), { kind: 'error' })
    }
    const noteOk = (label: string) => {
      okCount += 1
      setBatchQueue((cur) => (cur ? { ...cur, ok: okCount, current: label } : cur))
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
          noteOk(label)
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
            noteOk(label)
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
          noteOk(label)
          return { ok: true }
        }
        if (!error) return { ok: true, skipped: true }
        noteFail(profile.id, label, error)
        return { ok: false, error }
      }, {
        isCancelled: () => batchCancelRef.current,
        onProgress: (progress) => {
          batchQueuedRef.current = progress.queued
          setBatchQueue((cur) => ({
            queued: progress.queued,
            total: progress.total,
            started: progress.started,
            ok: cur?.ok ?? okCount,
            fail: cur?.fail ?? failCount,
            current: cur?.current
          }))
        }
      })
      const summary = summarizeBatch(results)
      const okLabels = results
        .filter((row) => row.ok && !row.skipped && !row.cancelled)
        .map((row) => row.label || row.id)
      const failLabels = summary.failed.map((row) => row.label || row.id)
      const fmtHosts = (labels: string[]) =>
        labels.length === 0
          ? '—'
          : labels.length <= 3
            ? labels.join(', ')
            : `${labels.slice(0, 2).join(', ')}…+${labels.length - 2}`
      if (summary.fail > 1 || (summary.fail === 1 && summary.ok > 0))
        showToast(tg('l10.summary', { ok: summary.ok, fail: summary.fail, hosts: fmtHosts(failLabels) }), {
          kind: 'error'
        })
      else if (summary.fail === 0 && summary.ok >= 1)
        showToast(tg('l10.done', { n: summary.ok, hosts: fmtHosts(okLabels) }))
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
            showToast(tg('inspect.opened'))
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
        helpWelcomeReplay.current = true
        setWelcomeReplay(true)
        setWelcomeDismissed(false)
        saveWelcomeDismissed(false)
        showToast(tg('pf1.replay'))
        return
      }
      if (action === 'tour') {
        setQuickOpen(false)
        setQuickExplicit(false)
        setTourExplicit(true)
        setTourOpen(true)
        showToast(tg('l7.tour'))
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
        showToast(tg('pf1.welcome'))
        return
      }
      if (action === 'enableRuleTemplates') {
        openM2('alert-rules', tg('o2.rulesTitle'), { rulesSeg: 'templates' })
        showToast(tg('l2c.templatesOpen'))
        return
      }
      if (action === 'retryFailedProbes') {
        if (!tabsRef.current.some((tab) => tab.view === 'home')) {
          showToast(tg('l7b.needHome'), { kind: 'error' })
          return
        }
        if (probeFailCountRef.current === 0) {
          showToast(tg('l7c.noFails'))
          return
        }
        setRetryAllNonce((n) => n + 1)
        return
      }
      if (action === 'exportPlaybookPack') {
        openM2('playbook-list', tg('m2.playbooks'))
        showToast(tg('w5.export'))
        window.setTimeout(() => window.dispatchEvent(new Event('aiss-export-share')), 60)
        return
      }
      if (action === 'importPlaybookPack') {
        openM2('playbook-import', tg('w5.import'))
        showToast(tg('w5.import'))
        return
      }
      if (action === 'gateTimeline') {
        openM2('gate-timeline', tg('s2b.tab'))
        showToast(tg('s2b.timelineOpen'))
        return
      }
      if (action === 'maintOpen') {
        openMaintenance()
        showToast(tg('l2d.open'))
        return
      }
      if (action === 'maintEnd') {
        const active = activeWindows(loadMaintenance())
        if (!active.length) {
          showToast(tg('l2d.noneActive'))
          openMaintenance()
          return
        }
        if (active.length > 1) {
          showToast(tg('l2d.pickEnd'))
          openMaintenance()
          return
        }
        const row = active[0]!
        const scopeLabel = row.scope === 'hosts' ? row.hostKeys.join(', ') : row.tagIds.join(', ')
        void askConfirm({
          id: 'confirm.maintEnd',
          title: tg('l2d.endTitle'),
          body: tg('l2d.endBody', { scope: scopeLabel }),
          confirmText: tg('l2d.endConfirm')
        }).then((ok) => {
          if (!ok) return
          const ended = endMaintenance(row.id, 'user')
          if (!ended) {
            showToast(tg('l2d.noneActive'), { kind: 'error' })
            return
          }
          window.dispatchEvent(new Event('aiss-maintenance-change'))
          showToast(tg('l2d.toastEnded'))
        })
        return
      }
      if (action === 'setDryRunReminder') {
        openM2('playbook-list', tg('m2.playbooks'))
        showToast(tg('w6.set'))
        window.setTimeout(() => window.dispatchEvent(new Event(REMINDER_FILTER_EVENT)), 60)
        return
      }
      if (action === 'aiPostmortem') {
        const focus = tabsRef.current.find((t) => t.view === 'alert-workbench')?.focusAlertId
        const alert = (focus ? loadAlertHistory().find((a) => a.id === focus) : undefined) ?? loadAlertHistory().find((a) => a.status === 'active')
        if (!alert) {
          showToast(tg('w1.needAlertForPostmortem'))
          return
        }
        openPostmortemAi(alert)
        return
      }
      if (action === 'explainDiff' || action === 'diffFixPlaybook') {
        const diff = tabsRef.current.find((t) => t.view === 'file-diff' && t.tabId === activeTabId) ?? tabsRef.current.find((t) => t.view === 'file-diff')
        if (!diff) {
          showToast(tg(action === 'explainDiff' ? 'l8b.needDiffExplain' : 'l8b.needDiffPlaybook'))
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
        showToast(tg('l7.tasksReopened'))
        return
      }
      if (action === 'switchTab') {
        if (!tabsRef.current.length) {
          showToast(tg('tab.none'))
          return
        }
        tabOverflowFromRef.current = 'palette'
        setTabQuery('')
        setTabListIndex(0)
        const width = 280
        setTabOverflowPos({ top: 40, left: Math.max(8, window.innerWidth - width - 16) })
        setTabOverflowOpen(true)
        return
      }
      if (action === 'refreshHomeHealth') {
        if (!tabsRef.current.some((t) => t.view === 'home')) {
          showToast(tg('l7b.needHome'), { kind: 'error' })
          return
        }
        setProbeNonce((n) => n + 1)
        return
      }
      if (action === 'sftpComfort') {
        const next = sftpComfort ? 'auto' : 'comfort'
        saveSftpDensity(next)
        setSftpComfort(next === 'comfort')
        window.dispatchEvent(new CustomEvent(SFTP_DENSITY_EVENT))
        showToast(tg(next === 'comfort' ? 'sb.sftpComfortOn' : 'sb.sftpComfortOff'))
        return
      }
      if (action === 'updateChannel') {
        openUnifiedSettings('about')
        showToast(tg('about.updatesOpened'))
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
      if (action === 'importSshConfig') {
        void importSshConfigPick()
        return
      }
      if (action === 'exportJson' || action === 'exportOpenssh') {
        const format = action === 'exportJson' ? 'json' : 'openssh'
        void (async () => {
          try {
            await exportSessionsAndCopy(format)
            setSideInfo(tg('exp.copied', { format }))
            showToast(tg('exp.copied', { format }))
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setError(msg)
            showToast(msg, { kind: 'error' })
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
      if (action === 'focusTerminal') {
        const sid = activeSessionIdRef.current
        if (!sid) {
          showToast(tg('term.noSession'), { kind: 'error' })
          return
        }
        updateLayout((p) => withPaneToggle(p, 'main', true))
        window.dispatchEvent(new CustomEvent('aiss-focus-terminal', { detail: { sessionId: sid } }))
        return
      }
      if (action === 'focusAiPanel') {
        const wasHidden = !layout.showAi
        updateLayout((p) => withPaneToggle(p, 'ai', true))
        setRightPane('ai')
        if (wasHidden) showToast(tg('ai.focusShortcutTip'))
        return
      }
      if (action === 'clearAiChat') {
        updateLayout((p) => withPaneToggle(p, 'ai', true))
        setRightPane('ai')
        window.dispatchEvent(new CustomEvent('aiss-ai-clear-chat'))
        return
      }
      if (action === 'searchAllTerms') {
        setSearchAllOpen(true)
        return
      }
      if (action === 'copyLastOutput') {
        // D57: same as the terminal menu item (D54)
        const sid = activeSessionIdRef.current
        const last = sid ? lastRunFor(sid) : null
        if (!last?.out) {
          showToast(tg('d57.none'))
          return
        }
        const label = last.command.length > 40 ? last.command.slice(0, 40) + '…' : last.command
        void navigator.clipboard.writeText(last.out).then(
          () => showToast(tg('d54.copied', { cmd: label })),
          () => showToast(tg('d49.copyFail'), { kind: 'error' })
        )
        return
      }
      if (action === 'copyLastAiReply') {
        updateLayout((p) => withPaneToggle(p, 'ai', true))
        setRightPane('ai')
        window.dispatchEvent(new CustomEvent('aiss-ai-copy-last-reply'))
        return
      }
      if (action === 'closeOtherTabs') {
        if (!activeTabId) {
          showToast(tg('tab.none'))
          return
        }
        const rows = tabsRef.current.map((t, i) => ({
          ...t,
          id: t.tabId,
          seq: t.openSeq ?? i + 1,
          pinned: Boolean(t.pinned)
        }))
        const dropIds = closeOthers(rows, activeTabId)
        if (!dropIds.length) {
          showToast(tg('tab.closeOthersDisabled'))
          return
        }
        const drop = new Set(dropIds)
        closeTabsWhere((row) => !drop.has(row.tabId))
        showToast(tg('tab.closedOthersToast', { n: dropIds.length }))
        return
      }
      if (action === 'closeTabsToRight') {
        if (!activeTabId) {
          showToast(tg('tab.none'))
          return
        }
        const rows = tabsRef.current.map((t, i) => ({
          ...t,
          id: t.tabId,
          seq: t.openSeq ?? i + 1,
          pinned: Boolean(t.pinned)
        }))
        const { close: dropIds } = closeRight(rows, activeTabId)
        if (!dropIds.length) {
          showToast(tg('tab.closeRightDisabled'))
          return
        }
        const drop = new Set(dropIds)
        closeTabsWhere((row) => !drop.has(row.tabId))
        showToast(tg('tab.closedRightToast', { n: dropIds.length }))
        return
      }
      if (action === 'openAllTabs') {
        if (!tabsRef.current.length) {
          showToast(tg('tab.none'))
          return
        }
        openAllTabsMenu()
        return
      }
      if (action === 'closeDisconnectedTabs') {
        const gone = disconnectedSessions(tabsRef.current)
        if (!gone.length) {
          showToast(tg('tab.list.noDisconnected'))
          return
        }
        const snapshots = gone.map((t) => ({ ...t }))
        const hostLabels = snapshots.map(
          (t) =>
            statusHostChipLabel(
              t.connectOpts?.label?.trim() || t.connectOpts?.host || t.title || t.customTitle
            ) || t.title || t.connectOpts?.host || '?'
        )
        const hosts =
          hostLabels.length <= 3
            ? hostLabels.join(', ')
            : `${hostLabels.slice(0, 2).join(', ')}…+${hostLabels.length - 2}`
        setClosingDisconnected(true)
        for (const t of gone) closeTab(t.tabId, t.sessionId, t.status, t.view)
        window.setTimeout(() => setClosingDisconnected(false), 400)
        showToast(tg('tab.list.closedToast', { n: snapshots.length, hosts }), {
          ms: 2000,
          action: {
            label: tg('tab.list.undo'),
            run: () => {
              setTabs((prev) => {
                const ids = new Set(prev.map((x) => x.tabId))
                return [...prev, ...snapshots.filter((x) => !ids.has(x.tabId))]
              })
            }
          }
        })
        return
      }
      if (action === 'reopenClosedTab') {
        const { next, snap } = popClosedTab(closedTabsRef.current)
        closedTabsRef.current = next
        if (!snap) {
          showToast(tg('tab.reopenEmpty'))
          return
        }
        void openSession(snap.connectOpts as Parameters<typeof openSession>[0], {
          profileId: snap.profileId,
          hostInventoryId: snap.hostInventoryId,
          kind: snap.kind || 'ssh'
        }).then(() => showToast(tg('tab.reopened')))
        return
      }
      if (action === 'serialPort') {
        showToast(tg('serial.unavailable'), {
          action: localShellAvailable
            ? { label: tg('menu.localShell'), run: () => void openLocalShell() }
            : undefined,
          ms: 8000
        })
        return
      }
      if (action === 'localShell') {
        void openLocalShell()
        return
      }
      if (action === 'sftp') {
        openSftpTransfer(undefined, { alignCwd: true })
        showToast(tg('toolbar.sftpTitle'))
        return
      }
      if (action === 'sftpTransferQueue') {
        const sid = openSftpTransfer(undefined, { alignCwd: true })
        showToast(tg('d1.queue'))
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('aiss-sftp-focus-queue', { detail: { sessionId: sid ?? activeSessionIdRef.current } })
          )
        }, 80)
        return
      }
      if (action === 'folderSync') {
        const armed = takeArmedFolderSync()
        requestFolderSync(armed.set ? armed.profileId : undefined)
        openSftpTransfer(undefined, { alignCwd: true })
        showToast(tg('menu.folderSync'))
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
        if (!removed) {
          showToast(tg('x1.nothingToClear'))
          return
        }
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
        const live = tabsRef.current.filter(
          (x) => x.sessionId && x.status === 'connected' && (!x.view || x.view === 'session') && x.kind !== 'local'
        )
        const alsoBroadcast = broadcastEnabledRef.current
        const r = applySplitToggle(splitEnabledRef, live.length)
        if (r.toast === 'needTwo') {
          showToast(tg('sb.splitNeedTwo'))
          return
        }
        setSplitEnabled(r.next)
        if (r.toast === 'off') {
          broadcastEnabledRef.current = false
          setBroadcastEnabled(false)
          showToast(alsoBroadcast ? tg('sb.splitOffAlsoBroadcast') : tg('sb.splitOff'))
        } else showToast(tg('sb.splitOn'))
        return
      }
      if (action === 'toggleBroadcast') {
        if (broadcastEnabledRef.current) {
          broadcastEnabledRef.current = false
          setBroadcastEnabled(false) // keep broadcastTargets for next picker open
          showToast(tg('sb.broadcastOff'))
        } else {
          const live = tabsRef.current.filter(
            (x) => x.sessionId && x.status === 'connected' && (!x.view || x.view === 'session') && x.kind !== 'local'
          )
          if (live.length < 2) {
            showToast(tg('x3.needTwo'))
            return
          }
          setBroadcastPickerOpen(true)
        }
        return
      }
      if (action === 'broadcastTargets') {
        const live = tabsRef.current.filter(
          (x) => x.sessionId && x.status === 'connected' && (!x.view || x.view === 'session') && x.kind !== 'local'
        )
        if (live.length < 2) {
          showToast(tg('x3.needTwo'))
          return
        }
        setBroadcastPickerOpen(true)
        showToast(tg('menu.broadcastTargets'))
        return
      }
      if (action === 'opsHome') {
        openHome()
        showToast(tg('l7.title'))
        return
      }
      if (action === 'alertWorkbench') {
        openWorkbench()
        showToast(tg('l7.openWorkbench'))
        return
      }
      if (action === 'auditLog') {
        openAudit()
        showToast(tg('menu.auditLog'))
        return
      }
      if (action === 'exportAudit') {
        const ctx = peekAuditExportContext()
        const tab = tabsRef.current.find((t) => t.view === 'audit')
        setAuditEvents(loadAudit())
        auditExportNonce.current += 1
        setAuditExport({ nonce: auditExportNonce.current, seed: ctx ?? { range: '7d', host: tab?.auditHost || '' } })
        showToast(tg('audit.exportOpen'))
        return
      }
      if (action === 'playbooks') {
        openM2('playbook-list', tg('m2.playbooks'))
        showToast(tg('m2.playbooks'))
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
        showToast(tg('m2.cloudSync'))
        return
      }
      if (action === 'exportOpenTabsList') {
        const rows = tabsRef.current
        if (!rows.length) {
          showToast(tg('tabs.listEmpty'), { kind: 'error' })
          return
        }
        const text = formatOpenTabsList(rows)
        const titles = rows.map((t) => String(t.title || t.customTitle || '').trim()).filter(Boolean)
        const hosts =
          titles.length === 0
            ? '—'
            : titles.length <= 3
              ? titles.join(', ')
              : `${titles.slice(0, 2).join(', ')}…+${titles.length - 2}`
        void navigator.clipboard.writeText(text).then(
          () => showToast(tg('tabs.listCopied', { n: rows.length, hosts })),
          () => showToast(tg('ai.copyFailed'), { kind: 'error' })
        )
        return
      }
      if (action === 'saveWorkspaceNow') {
        const snapshot = snapshotWorkspace(withLiveCwd(tabsRef.current), activeTabId)
        const ids = [
          ...new Set(snapshot.filter((row) => row.kind === 'terminal' && row.profileId).map((row) => row.profileId!))
        ]
        saveLastWorkspace({ profileIds: snapshot.length ? ids : [], tabs: snapshot })
        const titles = snapshot.map((row) => String(row.title || '').trim()).filter(Boolean)
        const hosts =
          titles.length === 0
            ? '—'
            : titles.length <= 3
              ? titles.join(', ')
              : `${titles.slice(0, 2).join(', ')}…+${titles.length - 2}`
        showToast(tg('ws.savedNow', { n: snapshot.length, hosts }))
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
        showToast(tg('menu.sessionRecordings'))
        return
      }
      if (action === 'toggleBlocks') {
        setBlocksOn(turnBlocks(!blocksEnabled()))
        return
      }
      if (action === 'toggleShellIntegration') {
        const next = !shellIntOn()
        setShellIntOn(next)
        setSiOn(next)
        showToast(tg(next ? 'd14.on' : 'd14.off'))
        return
      }
      if (action === 'startupSettings') {
        openUnifiedSettings('general')
        showToast(tg('menu.startupSettings'))
        return
      }
      if (action === 'alertRules') {
        openClassifiedEditor('alert-rules')
        showToast(tg('o2.rulesTitle'))
        return
      }
      if (action === 'alertHistory') {
        if (bellPrefs.mode === 'drawer') openClassifiedEditor('alert-history')
        else openWorkbench({ filter: 'all' })
        showToast(tg('o2.historyTitle'))
        return
      }
      if (action === 'toggleRecording') {
        if (recordingSessionId) void stopRecording()
        else void startRecording()
        return
      }
      if (action === 'connection') {
        openConnectionEditor()
        showToast(tg('toolbar.newConn'))
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
        showToast(tg('s2b.openProtection'))
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
        showToast(tg('menu.inventory'))
        return
      }
      if (action === 'about') {
        openUnifiedSettings('about')
        showToast(tg('about.desc'))
        return
      }
      if (action === 'shortcuts') {
        setShortcutsOpen(true)
        showToast(tg('menu.shortcuts'))
        return
      }
      if (action === 'batchExec') {
        openToolTabRef.current('batch')
        showToast(tg('ctx.batch'))
        return
      }
      if (action === 'portForward') {
        openToolTabRef.current('forward')
        showToast(tg('tab.forward'))
        return
      }
      if (action === 'dashboard') {
        openDashboardRef.current()
        showToast(tg('l7.openDashboard'))
        return
      }
      if (action === 'resourceMonitor') {
        openToolTabRef.current('monitor')
        showToast(tg('g3.monitor'))
        return
      }
      if (action === 'commandPalette') {
        setPaletteOpen(true)
        showToast(tg('toolbar.searchFeatures'))
        return
      }
      if (action === 'whatsNew') {
        setWhatsNewOpen(true)
        showToast(tg('about.whatsNew'))
        return
      }
      if (action === 'backup') {
        openUnifiedSettings('backup')
        showToast(tg('menu.backup'))
        return
      }
      if (action === 'serverTools') {
        openToolTabRef.current('toolbox')
        showToast(tg('ctx.toolbox'))
        return
      }
      if (action === 'openDocker') {
        const sid = activeSessionIdRef.current
        if (!sid || connectedSshSessionsRef.current.length === 0) {
          pendingLocateRef.current = 'docker'
          setHostPicker({ action: 'serverTools', feature: 'Docker' })
          showToast(tg('docker.pickHost'))
          return
        }
        const tab = tabsRef.current.find((t) => t.sessionId === sid)
        const host =
          statusHostChipLabel(
            tab?.connectOpts.label?.trim() || tab?.connectOpts.host || tab?.title || tab?.customTitle
          ) || tab?.title || tab?.connectOpts.host || '—'
        showToast(tg('docker.opening', { host }))
        openToolTabRef.current('toolbox', sid, undefined, 0, 'docker')
        return
      }
      if (action === 'copyConnectionString') {
        const tab = tabsRef.current.find((x) => x.tabId === activeTabId && (!x.view || x.view === 'session'))
        const profile = profilesRef.current.find((p) => p.id === tab?.profileId) ?? profilesRef.current.find((p) => p.id === selectedProfileId)
        if (!tab && !profile) {
          showToast(tg('l10.none'))
          return
        }
        const conn = formatConnectionString({
          username: tab?.connectOpts.username ?? profile?.username,
          host: tab?.connectOpts.host ?? profile?.host,
          port: tab?.connectOpts.port ?? profile?.port
        })
        void navigator.clipboard.writeText(conn).then(
          () => showToast(tg('sess.copiedConn', { conn })),
          () => showToast(tg('sess.copiedConn', { conn }), { kind: 'error' })
        )
        return
      }
      if (action === 'setJumpHosts' || action === 'checkCerts' || action === 'editSessionNote') {
        const tab = tabsRef.current.find((x) => x.tabId === activeTabId && (!x.view || x.view === 'session'))
        const profile = profilesRef.current.find((p) => p.id === tab?.profileId) ?? profilesRef.current.find((p) => p.id === selectedProfileId)
        if (!profile) {
          showToast(tg('l10.none'))
          return
        }
        const focus = action === 'setJumpHosts' ? 'jump' : action === 'checkCerts' ? 'cert' : 'note'
        openConnectionEditor(profile, focus)
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
        showToast(tg('m2.conflicts'))
        return
      }
      if (action === 'syncPreview') {
        const ex = tabsRef.current.find((t) => t.view === 'sync-preview')
        if (ex) setActiveTabId(ex.tabId)
        else openM2('sync-settings', tg('m2.cloudSync'))
        showToast(tg('m2.cloudSync'))
        return
      }
      if (action === 'knownHosts') {
        setKnownHostsOpen(true)
        showToast(tg('kh.title'))
        return
      }
      if (action === 'settings') {
        openUnifiedSettings(sectionForAction('settings') ?? 'general')
        showToast(tg('settings.title'))
        return
      }
      if (action === 'find') {
        if (!activeSessionIdRef.current) {
          showToast(tg('term.noSession'), { kind: 'error' })
          return
        }
        requestTerminalFind()
        return
      }
      if (action === 'toggleLanguage') {
        const next = locale === 'en' ? 'zh-CN' : 'en'
        setLocale(next)
        showToast(tg('toolbar.localeTitle', { locale: next === 'en' ? 'English' : '中文' }))
        return
      }
      if (action === 'toggleHostStatus') {
        setShowHostStatus((v) => {
          const next = !v
          localStorage.setItem('aiss.showHostStatus', next ? '1' : '0')
          showToast(tg(next ? 'settings.hostStatusOn' : 'settings.hostStatusOff'))
          return next
        })
        return
      }
      if (action === 'openAi') {
        const wasHidden = !layout.showAi
        updateLayout((p) => withPaneToggle(p, 'ai', true))
        openRightPanelRef.current('ai')
        if (wasHidden) showToast(tg('ai.focusShortcutTip'))
        return
      }
      if (action === 'checkUpdate') {
        void runUpdateCheck(true)
        return
      }
      if (action === 'github') {
        showToast(tg('toolbar.openGithub'))
        void window.aiss.app.openGithub().catch(() => undefined)
        return
      }
      if (action === 'reconnectPolicy') {
        openUnifiedSettings('connections', 'l9-reconnect')
        showToast(tg('l9.section'))
        return
      }
      if (action === 'reconnectNow') {
        const tab = tabs.find((x) => x.tabId === activeTabId)
        const subject =
          tab && tab.status === 'disconnected' && (!tab.view || tab.view === 'session') && tab.kind !== 'local'
            ? tab
            : tabs.find((x) => x.sessionId && x.sessionId === tab?.boundSessionId && x.status === 'disconnected') ||
              tabs.find(
                (x) =>
                  x.status === 'disconnected' &&
                  (!x.view || x.view === 'session') &&
                  x.kind !== 'local' &&
                  Boolean(x.sessionId || x.profileId)
              )
        if (!subject) {
          showToast(tg('palette.needDropped'))
          return
        }
        if (subject.tabId !== activeTabId) setActiveTabId(subject.tabId)
        haltedRef.current.delete(subject.tabId)
        const cur = autoRetryRef.current.get(subject.tabId)
        if (cur) clearTimeout(cur.timer)
        autoRetryRef.current.delete(subject.tabId)
        const hostLabel =
          statusHostChipLabel(
            subject.connectOpts.label?.trim() || subject.connectOpts.host || subject.title || subject.customTitle
          ) || subject.title || subject.connectOpts.host || ''
        if (hostLabel) showToast(tg('sess.reconnectStarted', { host: hostLabel }))
        void reconnectTab(subject.tabId, { full: true }).then((sid) => {
          if (sid) cancelAutoReconnect(subject.tabId)
          else if (policyRef.current.mode !== 'off') scheduleAutoReconnectRef.current(subject.tabId)
        })
        return
      }
      if (action === 'askAgain') {
        updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
        openRightPanelRef.current('ai')
        window.setTimeout(() => window.dispatchEvent(new Event('aiss-ai-ask-again')), 40)
        return
      }
      if (action === 'disconnectSession') {
        const tab = tabsRef.current.find((t) => t.tabId === activeTabId && (!t.view || t.view === 'session'))
        const sid = tab?.status === 'connected' ? tab.sessionId : null
        if (!sid || !tab) {
          showToast(tg('sess.noLiveSession'), { kind: 'error' })
          return
        }
        const hostLabel =
          statusHostChipLabel(
            tab.connectOpts.label?.trim() || tab.connectOpts.host || tab.title || tab.customTitle
          ) || tab.title || tab.connectOpts.host || ''
        void askConfirm({
          id: 'confirm.disconnectSession',
          title: tg('confirm.disconnectSession'),
          body: tg('confirm.disconnectSessionBody', { host: hostLabel }),
          confirmText: tg('confirm.disconnectSession'),
          danger: true
        }).then((ok) => {
          if (!ok) return
          void window.aiss.ssh.disconnect(sid)
          haltedRef.current.add(tab.tabId)
          setTabs((prev) =>
            prev.map((t) =>
              t.tabId === tab.tabId ? { ...t, status: 'disconnected' as const, failRaw: undefined } : t
            )
          )
          setRecordingSessionId((cur) => (cur === sid ? null : cur))
          showToast(tg('sess.disconnectedToast', { host: hostLabel || '—' }))
        })
        return
      }
      if (action === 'disconnectAllSessions') {
        const live = tabsRef.current.filter(
          (t) =>
            t.status === 'connected' &&
            (!t.view || t.view === 'session') &&
            t.kind !== 'local' &&
            Boolean(t.sessionId)
        )
        if (!live.length) {
          showToast(tg('sess.noLiveSession'), { kind: 'error' })
          return
        }
        const hostLabels = live.map(
          (t) =>
            statusHostChipLabel(
              t.connectOpts.label?.trim() || t.connectOpts.host || t.title || t.customTitle
            ) || t.title || t.connectOpts.host || '?'
        )
        const hosts =
          hostLabels.length <= 3
            ? hostLabels.join(', ')
            : `${hostLabels.slice(0, 2).join(', ')}…+${hostLabels.length - 2}`
        void askConfirm({
          id: 'confirm.disconnectAllSessions',
          title: tg('confirm.disconnectAllSessions'),
          body: tg('confirm.disconnectAllSessionsBody', { n: live.length, hosts }),
          confirmText: tg('confirm.disconnectAllSessions'),
          danger: true
        }).then((ok) => {
          if (!ok) return
          const ids = new Set(live.map((t) => t.tabId))
          for (const t of live) {
            if (t.sessionId) void window.aiss.ssh.disconnect(t.sessionId)
            haltedRef.current.add(t.tabId)
          }
          setTabs((prev) =>
            prev.map((t) =>
              ids.has(t.tabId) ? { ...t, status: 'disconnected' as const, failRaw: undefined } : t
            )
          )
          setRecordingSessionId((cur) => (cur && live.some((t) => t.sessionId === cur) ? null : cur))
          showToast(tg('sess.disconnectedAllToast', { n: live.length, hosts }))
        })
        return
      }
      if (action === 'reconnectAllDropped') {
        if (reconnectAllBusy) {
          showToast(tg('palette.reconnectAllBusy'))
          return
        }
        const dropped = tabs.filter(
          (x) =>
            x.status === 'disconnected' &&
            (!x.view || x.view === 'session') &&
            x.kind !== 'local' &&
            Boolean(x.sessionId || x.profileId)
        )
        if (!dropped.length) {
          showToast(tg('palette.needDropped'))
          return
        }
        const hostLabels = dropped.map(
          (t) =>
            statusHostChipLabel(
              t.connectOpts.label?.trim() || t.connectOpts.host || t.title || t.customTitle
            ) || t.title || t.connectOpts.host || '?'
        )
        const hosts =
          hostLabels.length <= 3
            ? hostLabels.join(', ')
            : `${hostLabels.slice(0, 2).join(', ')}…+${hostLabels.length - 2}`
        showToast(tg('palette.reconnectAllStarted', { n: dropped.length, hosts }))
        setReconnectAllBusy(true)
        void (async () => {
          let okCount = 0
          try {
            // Sequential: avoid stacking host-key / password prompts.
            for (const subject of dropped) {
              haltedRef.current.delete(subject.tabId)
              const cur = autoRetryRef.current.get(subject.tabId)
              if (cur) clearTimeout(cur.timer)
              autoRetryRef.current.delete(subject.tabId)
              const sid = await reconnectTab(subject.tabId, { full: true, quiet: true })
              if (sid) {
                okCount += 1
                cancelAutoReconnect(subject.tabId)
              } else if (policyRef.current.mode !== 'off') {
                scheduleAutoReconnectRef.current(subject.tabId)
              }
            }
            showToast(
              okCount > 0
                ? tg('palette.reconnectedAll', { n: okCount, total: dropped.length, hosts })
                : tg('palette.reconnectAllFailed', { n: dropped.length, hosts })
            )
          } finally {
            setReconnectAllBusy(false)
          }
        })()
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
        if (action === 'readonlyOn' && on) {
          showToast(tg('s4.alreadyOn'))
          return
        }
        if (action === 'readonlyOff' && !on && effectiveLevel(profiles.find((p) => p.id === tab.profileId)) !== 'readonly') {
          showToast(tg('s4.alreadyOff'))
          return
        }
        toggleSessionReadonly(tab)
        return
      }
      if (action === 'reconnect' || action === 'duplicateSession') {
        const tab = tabs.find((x) => x.tabId === activeTabId)
        if (!tab || (tab.view && tab.view !== 'session') || (tab.kind === 'local' && action === 'reconnect')) {
          showToast(tg('toolbar.needSession'))
          return
        }
        const host =
          statusHostChipLabel(
            tab.connectOpts.label?.trim() || tab.connectOpts.host || tab.title || tab.customTitle
          ) || tab.title || tab.connectOpts.host || '—'
        if (action === 'reconnect') {
          showToast(tg('sess.reconnectStarted', { host }))
          void reconnectTab(tab.tabId)
        } else {
          showToast(tg('sess.duplicating', { host }))
          void duplicateTab(tab)
        }
        return
      }
      if (action === 'snippets') {
        openRightPanelRef.current('snippets')
        showToast(tg('menu.snippets'))
        return
      }
      if (action === 'builtinSnippets') {
        openRightPanelRef.current('snippets', { previewBuiltin: true })
        showToast(tg('snip.builtinOpen'))
        return
      }
      if (action === 'builtinPlaybooks') {
        openM2('playbook-list', tg('m2.playbooks'))
        showToast(tg('m2.builtinOpen'))
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
          showToast(tg('w1.needAlertWorkbench'))
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
          window.setTimeout(() => window.dispatchEvent(new CustomEvent('aiss-dry-run')), 120)
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
      if (action === 'toggleTabPin') {
        const tab = tabs.find((row) => row.tabId === activeTabId)
        if (!tab) {
          showToast(tg('tab.none'))
          return
        }
        const wasPinned = Boolean(tab.pinned)
        setTabs((prev) =>
          prev.map((row, i) =>
            row.tabId === tab.tabId ? { ...row, pinned: !row.pinned, openSeq: row.openSeq ?? i + 1 } : row
          )
        )
        showToast(wasPinned ? tg('tab.unpinned') : tg('tab.pinnedToast'), { ms: wasPinned ? 2000 : 2500 })
        return
      }
      if (action === 'clearScrollback') {
        const sid = activeSessionIdRef.current
        if (!sid) {
          showToast(tg('term.noSession'), { kind: 'error' })
          return
        }
        const tab = tabsRef.current.find((t) => t.sessionId === sid) ?? tabsRef.current.find((t) => t.tabId === activeTabId)
        const host =
          statusHostChipLabel(
            tab?.connectOpts.label?.trim() || tab?.connectOpts.host || tab?.title || tab?.customTitle
          ) || tab?.title || tab?.connectOpts.host || '—'
        window.dispatchEvent(new CustomEvent('aiss-clear-scrollback', { detail: { sessionId: sid } }))
        showToast(tg('term.scrollbackCleared', { host }))
        return
      }
      if (action === 'toggleMuteBell') {
        const next = !terminalPrefs.muteBell
        void window.aiss.terminal.setPrefs({ muteBell: next }).then((p) => {
          setTerminalPrefs(p)
          showToast(tg(next ? 'term.bellMuted' : 'term.bellUnmuted'))
        }).catch(() => undefined)
        return
      }
      if (action === 'zoomIn' || action === 'zoomOut' || action === 'zoomReset') {
        const cur = terminalPrefs.fontSize
        const next =
          action === 'zoomIn'
            ? bumpTerminalFontSize(cur, 1)
            : action === 'zoomOut'
              ? bumpTerminalFontSize(cur, -1)
              : resetTerminalFontSize()
        if (next === cur && action !== 'zoomReset') {
          showToast(tg(action === 'zoomIn' ? 'zoom.atMax' : 'zoom.atMin', { n: next }))
          return
        }
        void window.aiss.terminal.setPrefs({ fontSize: next }).then((p) => {
          setTerminalPrefs(p)
          showToast(tg('zoom.size', { n: p.fontSize }))
        }).catch(() => undefined)
        return
      }
      if (action === 'toggleUiTheme') {
        const next = toggleLightDarkTheme()
        const termTheme = suggestedTerminalTheme(next)
        void window.aiss.terminal.setPrefs({ themeId: termTheme }).then(setTerminalPrefs).catch(() => {})
        showToast(tg(isLightUiTheme(next) ? 'theme.switchedLight' : 'theme.switchedDark'))
        return
      }
      if (action === 'mcpGuide') {
        openUnifiedSettings(sectionForAction(action) ?? 'general')
        showToast(tg('mcp.guideOpened'))
        return
      }
      if (action === 'ai' || action === 'terminalPrefs' || action === 'uiTheme') {
        openUnifiedSettings(sectionForAction(action) ?? 'general')
        showToast(
          tg(
            action === 'ai'
              ? 'settings.aiOpened'
              : action === 'terminalPrefs'
                ? 'settings.terminalOpened'
                : 'settings.themeOpened'
          )
        )
      }
    },
    [
      addFolder,
      importSessionsPick,
      importSshConfigPick,
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
      terminalPrefs,
      layout.showAi,
      runUpdateCheck,
      sftpComfort,
      reconnectTab,
      cancelAutoReconnect,
      reconnectAllBusy,
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
  /** S41b: popover pick; decides from splitEnabledRef / splitOrientationRef (live), never from memoised state. */
  const pickSplitMode = useCallback((target: SplitMode) => {
    const live = tabsRef.current.filter(
      (x) => x.sessionId && x.status === 'connected' && (!x.view || x.view === 'session') && x.kind !== 'local'
    )
    const alsoBroadcast = broadcastEnabledRef.current
    const r = applySplitMode(splitEnabledRef, splitOrientationRef, live.length, target)
    if (r.toast === 'noop') return
    if (r.toast === 'needTwo') {
      showToast(tg('sb.splitNeedTwo'))
      return
    }
    setSplitOrientation(r.orientation)
    setSplitEnabled(r.enabled)
    if (r.toast === 'off') {
      broadcastEnabledRef.current = false
      setBroadcastEnabled(false)
      showToast(alsoBroadcast ? tg('sb.splitOffAlsoBroadcast') : tg('sb.splitOff'))
    } else showToast(tg('s41.modeDone', { mode: tg(r.orientation === 'horizontal' ? 's41.modeH' : 's41.modeV') }))
  }, [])
  // D99: Ctrl+wheel over a terminal reuses the zoom actions (limits + toast + persisted prefs)
  useEffect(() => {
    const onZoom = (ev: Event) => {
      const step = (ev as CustomEvent<{ step?: number }>).detail?.step
      if (step === 1 || step === -1) handleTitlebarMenuActionRef.current(step > 0 ? 'zoomIn' : 'zoomOut')
    }
    window.addEventListener('aiss-term-zoom', onZoom)
    return () => window.removeEventListener('aiss-term-zoom', onZoom)
  }, [])

  const openMonitorForSession = useCallback((sid: string | null) => {
    openToolTabRef.current('monitor', sid)
  }, [])
  const monitorProfile = useCallback(
    async (p: SavedSessionProfile) => {
      setSessionMenu(null)
      showToast(tg('g3.monitor'))
      const live = tabs.find(
        (x) => x.profileId === p.id && x.status === 'connected' && x.sessionId && (!x.view || x.view === 'session')
      )
      if (live) return openMonitorForSession(live.sessionId)
      const sid = await connectProfile(p)
      if (sid) openMonitorForSession(sid)
      else {
        showToast(tg('ctx.connectFailed', { reason: tg('ctx.seeError') }), { kind: 'error' })
      }
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
  const openSftpFromHost = useCallback((p: SavedSessionProfile, gotoPath?: string) => {
    setSessionMenu(null)
    showToast(tg('toolbar.sftpTitle'))
    const live = tabsRef.current.find(
      (x) => x.profileId === p.id && x.status === 'connected' && x.sessionId && (!x.view || x.view === 'session') && x.kind !== 'local'
    )
    if (live?.sessionId) {
      if (gotoPath) requestSftpGoto(live.sessionId, gotoPath)
      openSftpTransfer(live.sessionId, { alignCwd: false })
      return
    }
    const tabId = openSftpTransfer(undefined, { alignCwd: false, profile: p })
    if (!tabId) {
      showToast(tg('app.needSshSftp'), { kind: 'error' })
      return
    }
    void ensureProfileSession(p).then((sid) => {
      if (sid && gotoPath) requestSftpGoto(sid, gotoPath)
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
      if (!ids.length) {
        showToast(tg('l10.none'))
        return
      }
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
      showToast(
        ids.length > 1
          ? tg('app.profilesDeleted', { n: ids.length })
          : tg('app.profileDeleted', { name: name || '—' })
      )
    },
    [folders, persistSessionState, profiles]
  )
  deleteProfilesRef.current = deleteProfilesFn

  /** G1: add the built-in demo host (local simulation, no network) and optionally open it. */
  const addDemoHost = useCallback(
    async (connect: boolean) => {
      let demo = profilesRef.current.find((x) => x.demo)
      let created = false
      if (!demo) {
        demo = {
          id: DEMO_PROFILE_ID,
          label: demoProfileLabel(locale),
          host: DEMO_HOST,
          port: 22,
          username: DEMO_USER,
          tags: [...DEMO_TAGS],
          demo: true
        }
        await persistSessionState({ folders, profiles: [demo, ...profilesRef.current] })
        created = true
      }
      setSelectedProfileId(demo.id)
      if (connect) {
        showToast(tg(created ? 'l7.demoAddedConnect' : 'l7.demoConnect'))
        openOrFocusProfile(demo)
      } else if (created) {
        showToast(tg('l7.demoAdded'))
      } else {
        showToast(tg('l7.demoExists'))
      }
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
    // P11-1: Help replay stays up. Hosts already present do not clear it.
    if (welcomeReplay) return
    const seen = welcomeSeen.current
    const replay = helpWelcomeReplay.current
    helpWelcomeReplay.current = false
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
  const openAiPendingConfirm = useCallback(() => {
    ensureAiVisible()
    openRightPanelRef.current('ai')
    setAiFocusPendingToken((n) => n + 1)
  }, [ensureAiVisible])

  useEffect(() => {
    const onShot = (ev: Event) => {
      if (!screenshotHooksEnabled()) return
      const detail = (ev as CustomEvent<ScreenshotOp>).detail
      if (!detail?.op) return
      if (detail.op === 'dismissProduct') {
        try {
          localStorage.setItem('aiss.prefs.onboarding.quickDone', '1')
          localStorage.setItem('aiss.tourDone', '1')
          localStorage.setItem('aiss.prefs.welcomeDismissed', '1')
          localStorage.setItem('aiss.prefs.welcomeCompleted', '1')
          localStorage.setItem('aiss.prefs.firstWeekTipsDismissed', 'true')
        } catch { /* ignore */ }
        setQuickOpen(false)
        setTourOpen(false)
        setWelcomeDismissed(true)
        setWelcomeCompleted(true)
        setTipsDismissed(true)
        setTipsSnooze(true)
        setTasksManual(false)
        setTaskState(dismissTasksForever())
        setKnownHostsOpen(false)
        clearToasts()
        setAlertHistory([])
        setAlertRules((prev) => {
          const next = { ...prev, mutedUntil: Date.now() + 3_600_000 }
          saveAlertRules(next)
          return next
        })
        return
      }
      if (detail.op === 'reset') {
        // c51: screenshot isolation — close popovers, modals and the right panel before each scenario
        closeContextMenu()
        setKnownHostsOpen(false)
        setPaletteOpen(false)
        setShortcutsOpen(false)
        updateLayout((p) => (p.showAi ? withPaneToggle(p, 'ai', false) : p))
        return
      }
      if (detail.op === 'closeModals') {
        setKnownHostsOpen(false)
        setPaletteOpen(false)
        setShortcutsOpen(false)
        return
      }
      if (detail.op === 'knownHosts') {
        setQuickOpen(false)
        setTourOpen(false)
        setKnownHostsOpen(true)
        return
      }
      if (detail.op === 'theme') {
        applyUiTheme(detail.id as UiThemeId)
        return
      }
      if (detail.op === 'sftp' || detail.op === 'sftpDual') {
        setQuickOpen(false)
        setTourOpen(false)
        setKnownHostsOpen(false)
        const wantDual = detail.op === 'sftpDual'
        if (wantDual) {
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
            void persistSessionState({ folders, profiles: [demo, ...profilesRef.current] })
          }
          const live = tabsRef.current.find(
            (x) =>
              x.profileId === demo!.id &&
              x.status === 'connected' &&
              x.sessionId &&
              (!x.view || x.view === 'session')
          )
          // Prefer openSftpTransfer (does not set restoreFailed). restore-hold would unmount SftpPanel.
          if (live?.sessionId) openSftpTransfer(live.sessionId, { alignCwd: true })
          else openSftpTransfer(undefined, { profile: demo, alignCwd: false })
          try { sessionStorage.setItem('aiss.screenshot.sftpDualPending', '1') } catch { /* ignore */ }
          clearToasts()
          setAlertRules((prev) => {
            const next = { ...prev, mutedUntil: Date.now() + 3_600_000 }
            saveAlertRules(next)
            return next
          })
          const armMock = () => {
            clearToasts()
            try { sessionStorage.setItem('aiss.screenshot.sftpDualPending', '1') } catch { /* ignore */ }
            setTabs((prev) =>
              prev.map((x) =>
                x.view === 'sftp'
                  ? { ...x, restoreFailed: false, cold: false, restored: false }
                  : x
              )
            )
            const sftp = tabsRef.current.find((x) => x.view === 'sftp')
            if (sftp) setActiveTabId(sftp.tabId)
            window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: { op: 'sftpMockFill' } }))
          }
          window.setTimeout(armMock, 400)
          window.setTimeout(armMock, 1100)
          void addDemoHostRef.current(true)
          return
        }
        const profile = profilesRef.current[0]
        if (profile) {
          openSftpFromHost(profile)
          window.setTimeout(() => {
            const sftp = tabsRef.current.find((x) => x.view === 'sftp')
            if (sftp) setActiveTabId(sftp.tabId)
          }, 900)
        } else showToast('No profile for SFTP screenshot')
        return
      }
      if (detail.op === 'aiChat') {
        setQuickOpen(false)
        setTourOpen(false)
        ensureAiVisible()
        openRightPanelRef.current('ai')
        // AIPanel listens for the same event to seed / clear the demo conversation.
        return
      }
      if (detail.op === 'menu') {
        handleTitlebarMenuAction(detail.action as TitlebarMenuAction)
        return
      }
      if (detail.op === 'hostSafety') {
        setQuickOpen(false)
        setTourOpen(false)
        const p = sessionStateRef.current.profiles.find((x) => !x.demo) ?? sessionStateRef.current.profiles[0]
        if (!p) return
        void persistSessionState({
          ...sessionStateRef.current,
          profiles: sessionStateRef.current.profiles.map((x) =>
            x.id === p.id ? { ...x, protection: 'readonly' as const, aiPolicy: 'auto' as const } : x
          )
        })
        openInventoryEditor({ profileId: p.id, host: p.host, label: p.label, hostInventoryId: p.hostInventoryId })
        window.setTimeout(() => {
          document.querySelector('[data-testid="host-safety-card"]')?.scrollIntoView({ block: 'center' })
        }, 700)
        return
      }
      if (detail.op === 'sftpMockFill') {
        // Handled by SftpPanel listeners; App no-ops so the event can still bubble.
        return
      }
      if (detail.op === 'aiConfirm') {
        setQuickOpen(false)
        setTourOpen(false)
        const preview = detail.preview || 'systemctl status nginx --no-pager'
        setAiPending({
          requestId: detail.requestId || 'screenshot-confirm',
          action: 'command',
          preview
        })
        ensureAiVisible()
        openRightPanelRef.current('ai')
        setAiFocusPendingToken((n) => n + 1)
        // AIPanel also listens for the same event to fill the dock
        return
      }
    }
    window.addEventListener(SCREENSHOT_EVENT, onShot)
    return () => window.removeEventListener(SCREENSHOT_EVENT, onShot)
  }, [ensureAiVisible, openSftpFromHost, openSftpTransfer, persistSessionState, folders, locale, handleTitlebarMenuAction])
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
  // D6: "Ask AI" from a terminal selection → that tab's conversation, context prefilled, user types the question
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<{ sessionId: string; text: string; question?: string }>).detail
      if (!d?.sessionId || !d.text?.trim()) return
      focusSessionTab(d.sessionId)
      const tab = tabsRef.current.find((x) => x.sessionId === d.sessionId)
      const host = tab ? tab.connectOpts.label?.trim() || tab.title : ''
      const cwd = getSessionCwd(d.sessionId)
      const head = cwd && cwd !== '~' ? tg('d6.ctxHeadCwd', { host, cwd }) : tg('d6.ctxHead', { host })
      // D66: redact secrets in the selection too (file context and recent runs already are)
      setAiPrefill(`${head}\n${fenceSelection(redactAuditText(d.text))}\n${d.question ?? ''}`)
      updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
      openRightPanelRef.current('ai')
    }
    window.addEventListener(AI_ASK_CONTEXT_EVENT, onAsk)
    return () => window.removeEventListener(AI_ASK_CONTEXT_EVENT, onAsk)
  }, [focusSessionTab, updateLayout])
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
      if (!action) {
        // Do not steal chords while typing / capturing a hotkey in a form field.
        const tag = (el?.tagName || '').toLowerCase()
        const editable =
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          Boolean(el?.isContentEditable) ||
          Boolean(el?.closest?.('input, textarea, select, [contenteditable="true"]'))
        if (editable && !inTerminal) return
        const snip = matchSnippetHotkey(e, snippetsHotkeyRef.current)
        if (!snip) return
        e.preventDefault()
        e.stopPropagation()
        const sid = activeSessionIdRef.current
        if (!sid) {
          showToast(tg('snip.needSession'))
          return
        }
        dispatchInjectTerminal(sid, snip.body, false)
        showToast(tg('snip.hotkeyFired', { title: snip.title }))
        return
      }
      // P39: the focused block copies its own output (was mis-wired to toggleBlockStrip, hiding the strip)
      if (action === 'copyBlockOutput') return
      e.preventDefault()
      e.stopPropagation()
      // IX-6: Ctrl+W closes outside a terminal. Inside one, only Ctrl+Shift+W matches.
      // A dialog that is already open is not a close, so the chord cannot kill a tab underneath it.
      if (action === 'closeTab') {
        if (isDialogOpen()) return
        const tab = tabsRef.current.find((t) => t.tabId === activeTabIdRef.current)
        if (!tab) {
          showToast(tg('tab.none'))
          return
        }
        closeTabRef.current(tab.tabId, tab.sessionId, tab.status, tab.view)
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
  const higherChromeOpen =
    paletteOpen ||
    shortcutsOpen ||
    knownHostsOpen ||
    aboutOpen ||
    startupOpen ||
    broadcastPickerOpen ||
    Boolean(hostPicker) ||
    resourceOpen ||
    isHigherChromeOpen(typeof document !== 'undefined' ? document : { querySelector: () => null })
  const workspaceEditorOpen = tabs.some((tab) => tab.view === 'connection' || tab.view === 'import-preview')
  const product = suppressParkableProduct(
    pickProductOverlay({
      systemUpdate: updateRequested,
      releaseNotes: whatsNewOpen,
      welcome: welcomeEligible,
      tour: tourOpen,
      tourExplicit,
      quickStart: quickOpen,
      quickExplicit,
      tasks: tasksEligible
    }),
    { higherChrome: higherChromeOpen, workspaceEditor: workspaceEditorOpen }
  )
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
      if (tourOpen) {
        e.preventDefault()
        closeTour()
        return
      }
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
  }, [product, tourOpen, dismissWelcome, closeTour, finishQuick])

  const productLayerOpen = product != null
  const productFocusRef = useRef<ReturnType<typeof bindProductFocus> | null>(null)
  if (!productFocusRef.current) productFocusRef.current = bindProductFocus()
  useLayoutEffect(() => {
    if (!productLayerOpen) return
    return productFocusRef.current?.activate()
  }, [productLayerOpen])

  const closeTip = tr(closeControlTipKey(terminalFocused))

  const failureHostLabel = () => {
    const id = failedProfileIdRef.current || selectedProfileId
    const row = profiles.find((p) => p.id === id)
    return row?.label?.trim() || row?.host || noticeHost(errorRaw || '')
  }
  const openFailedConnection = (focus?: 'jump' | 'cert' | null) => {
    const id = failedProfileIdRef.current || selectedProfileId
    openConnectionEditor(profiles.find((p) => p.id === id), focus ?? null)
  }
  const retryFailedConnection = () => {
    if (failureHoldRef.current || connecting || reconnectingTabId !== null) return
    failureHoldRef.current = true
    const id = failedProfileIdRef.current || selectedProfileId
    const tab = tabs.find((x) => x.profileId === id && (!x.view || x.view === 'session') && x.status !== 'connected')
    const release = () => {
      failureHoldRef.current = false
    }
    if (tab) void reconnectTab(tab.tabId).finally(release)
    else {
      const row = profiles.find((p) => p.id === id)
      if (row) void connectProfile(row).finally(release)
      else release()
    }
  }
  const failureCard = errorRaw && showConnectionTrouble(errorKind, errorRaw) ? (
    <ConnectTrouble
      raw={errorRaw}
      host={failureHostLabel()}
      busy={connecting || reconnectingTabId !== null}
      onEdit={openFailedConnection}
      onRetry={retryFailedConnection}
      diag={() => {
        const a = lastAttemptRef.current
        const o = a?.opts
        return buildConnectDiag({
          target: o ? stageTarget(o.host, o.port) : failureHostLabel(),
          user: o?.username ?? '?',
          authMode: o?.authMode,
          jumpHops: o?.jumpChain?.length ?? (o?.jumpHost?.host ? 1 : 0),
          kind: errorKind ?? 'unknown',
          stage: a?.stage?.stage ?? null,
          elapsedMs: a ? a.endedAt - a.startedAt : null,
          timeoutSec: policyRef.current.connectTimeoutSec,
          keepAliveSec: policyRef.current.keepAliveSec,
          appVersion: appVersion ?? undefined,
          raw: errorRaw ?? '',
          at: new Date()
        })
      }}
    />
  ) : null

  return (
    <div className="app-root" data-product-layer={product ?? 'none'} data-product-dimmers={productDimmers}>
      <AppToolbar
        onMenuAction={handleTitlebarMenuAction}
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
          toggleMuteBell: terminalPrefs.muteBell,
          toggleBroadcast: broadcastEnabled,
          toggleRecording: Boolean(recordingSessionId),
          toggleBlocks: blocksOn,
          toggleShellIntegration: siOn,
          smartComplete: smartOn,
          sftpComfort
        }}
        disabled={{
          syncNow: !syncReady,
          runPlaybook: !hasPlaybooks,
          localShell: !localShellAvailable
        }}
        hints={{
          syncNow: syncReady ? undefined : tg('m2.syncNeedSetup'),
          runPlaybook: hasPlaybooks ? undefined : tg('m2.noPlaybooks'),
          localShell: localShellAvailable ? undefined : tg('localShell.hintUnavailable')
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
                <SessionSearchBar
                  value={sessionSearch}
                  onChange={setSessionSearch}
                  onEnter={() => {
                    if (runSidebarQuick()) return true
                    // D53: exactly one saved host matches: Enter opens it (several: use ArrowDown to pick)
                    const hits = sessionSearch.trim() ? filterProfiles(profiles, sessionSearch, treeDataForProfile) : []
                    if (hits.length !== 1) return false
                    openOrFocusProfile(hits[0]!)
                    return true
                  }}
                  onArrowDown={() => {
                    const hits = sessionSearch.trim() ? filterProfiles(profiles, sessionSearch, treeDataForProfile) : profiles
                    if (!hits.length) return false
                    setSelectedProfileId(hits[0]!.id)
                    ;(document.querySelector('.sidebar-scroll') as HTMLElement | null)?.focus()
                    return true
                  }}
                />
                {sidebarQuickHit ? (
                  <button type="button" className="sidebar-quick" data-testid="sidebar-quick" onClick={runSidebarQuick}>
                    <span className="sidebar-quick-label">
                      {sidebarQuickHit.saved
                        ? tg('d13c.openSaved', { name: sidebarQuickHit.saved.label?.trim() || sidebarQuickHit.saved.host })
                        : tg('d13c.connect', { target: quickTargetLabel(sidebarQuickHit.target) })}
                    </span>
                    <kbd>{tg('d13c.enter')}</kbd>
                  </button>
                ) : null}
              </div>
              <div className="sidebar-scroll" tabIndex={0} onKeyDown={onSidebarKeyDown}>
                <RecentConnections
                  hideWhenEmpty={profiles.length === 0}
                  onQuickConnect={quickConnectRecent}
                  onSaveAsHost={saveRecentAsHost}
                  savedKeys={profiles.map((p) => `${p.username}@${p.host}:${p.port || 22}`)}
                  demoRenamed={profiles.some((p) => p.id === DEMO_PROFILE_ID && p.demoRenamed)}
                />
                {error && activeTab?.view !== 'connection' && (
                  failureCard ?? (
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
                  )
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
                        data-testid="session-folder-row"
                        onDragOver={(e) => {
                          if (!e.dataTransfer.types.includes(HOST_DRAG_MIME)) return
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          e.currentTarget.classList.add('is-drop-target')
                        }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('is-drop-target')}
                        onDrop={(e) => {
                          e.currentTarget.classList.remove('is-drop-target')
                          const ids = decodeHostDrag(e.dataTransfer.getData(HOST_DRAG_MIME))
                          if (!ids.length) return
                          e.preventDefault()
                          // D87: same path as right-click Move to; hosts already there are skipped
                          const moving = dropPlan(ids, profilesRef.current, f.id)
                          if (moving.length) moveProfileToFolder(moving, f.id)
                          else showToast(tg('d87.already', { name: f.name }))
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleFolderExpanded(f.id)
                          }
                        }}
                      >
                        <span className="session-folder-chevron" aria-hidden>
                          <Twist open={expanded} size={TREE_CHEVRON_SIZE} />
                        </span>
                        <span className="session-folder-name">{f.name}</span>
                        <span className="session-folder-count">{inFolder.length}</span>
                      </div>
                      {expanded && inFolder.map((p) => renderProfileBranch(p, true))}
                    </div>
                  )
                })}

                {hostDragging && folders.length > 0 ? (
                  <div
                    className="sidebar-ungroup-drop"
                    data-testid="ungroup-drop"
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(HOST_DRAG_MIME)) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      e.currentTarget.classList.add('is-drop-target')
                    }}
                    onDragLeave={(e) => e.currentTarget.classList.remove('is-drop-target')}
                    onDrop={(e) => {
                      e.preventDefault()
                      setHostDragging(false)
                      const ids = decodeHostDrag(e.dataTransfer.getData(HOST_DRAG_MIME))
                      // D90: same path as Move to → Ungrouped; hosts already ungrouped are skipped
                      const moving = ungroupPlan(ids, profilesRef.current)
                      if (moving.length) moveProfileToFolder(moving, undefined)
                      else showToast(tg('d90.already'))
                    }}
                  >
                    {tg('d90.drop')}
                  </div>
                ) : null}
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
                title={tr('ux10.broadcastEdit')}
                onClick={() => setBroadcastPickerOpen(true)}
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
              title={tg('d102.tip')}
              onDoubleClick={(e) => {
                // D102: only the empty strip, never a tab (tab double-click still renames)
                if (e.target !== e.currentTarget) return
                handleTitlebarMenuActionRef.current('connection')
              }}
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
              // D103: session tabs say who/where and the connection state on hover (was only the pin hint)
              const sessionTip = isSession && t.kind !== 'local' && t.connectOpts?.host
                ? tg('d103.tip', {
                    name: dupLabelFor(t),
                    addr: `${t.connectOpts.username}@${t.connectOpts.host}:${t.connectOpts.port || 22}`,
                    state: tg(t.status === 'connected' ? 'd103.connected' : t.status === 'connecting' ? 'd103.connecting' : 'd103.disconnected')
                  })
                : ''
              return (
              <button
                key={t.tabId}
                type="button"
                title={[sessionTip, sftpAddr, guardTip, t.status === 'disconnected' && t.failRaw ? tg('d35.tabReason', { reason: friendlyErrorMessage(t.failRaw) }) : '', tg('tab.pinTip')].filter(Boolean).join(' · ') || undefined}
                data-tab-id={t.tabId}
                className={`tab tab-kind-${t.view || 'session'} ${guardClass} ${t.pinned ? 'is-pinned' : ''} ${t.tabId === activeTabId ? 'active' : ''} ${isSession && t.status === 'disconnected' ? 'tab--disconnected' : ''} ${(isSession || t.view === 'sftp') && t.status === 'connecting' ? 'tab--connecting' : ''} ${t.view && WORKSPACE_TAB_VIEWS.has(t.view) ? 'tab--workspace' : ''}`}
                onClick={() => setActiveTabId(t.tabId)}
                onDoubleClick={() => startRename(t.tabId)}
                onAuxClick={(e) => {
                  if (e.button !== 1) return
                  e.preventDefault()
                  e.stopPropagation()
                  closeTab(t.tabId, t.sessionId, t.status, t.view)
                }}
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
                    onBlur={(e) => commitRename(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') commitRename(e.currentTarget.value)
                      if (e.key === 'Escape') setRenamingTabId(null)
                    }}
                  />
                ) : (
                <>
                <span className="tab-kind-icon">
                  <Icon name={tabKindIcon(t.view)} size={TAB_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
                </span>
                {/* pin affordance: tab-pin-btn */}
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
                {tabDup.get(t.tabId) ? <span className="tab-dup-n" data-testid="tab-dup-n">· {tabDup.get(t.tabId)}</span> : null}
                {showRo ? <span className="prot-badge prot-badge--readonly" data-testid="s4-tab-badge">{tg('s4.badge')}</span> : null}
                </>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  className={`tab-pin-btn${t.pinned ? ' is-on' : ''}`}
                  data-testid="tab-pin-btn"
                  title={t.pinned ? tg('tab.unpin') : tg('tab.pin')}
                  aria-label={t.pinned ? tg('tab.unpin') : tg('tab.pin')}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const wasPinned = Boolean(t.pinned)
                    setTabs((prev) =>
                      prev.map((row, i) =>
                        row.tabId === t.tabId ? { ...row, pinned: !row.pinned, openSeq: row.openSeq ?? i + 1 } : row
                      )
                    )
                    if (!wasPinned) {
                      try {
                        if (localStorage.getItem('aiss.prefs.tabPinTipShown') !== '1') {
                          localStorage.setItem('aiss.prefs.tabPinTipShown', '1')
                          showToast(tg('tab.pinnedToast'), { ms: 3500 })
                        }
                      } catch { /* ignore */ }
                    } else {
                      toastUndo({
                        message: tg('tab.unpinned'),
                        undo: () => setTabs((prev) => prev.map((row) => (row.tabId === t.tabId ? { ...row, pinned: true } : row)))
                      })
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      ;(e.currentTarget as HTMLElement).click()
                    }
                  }}
                >
                  <Icon name="pin" size={TAB_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
                </span>
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
            {/* S41b: one entry for split mode (off / side by side / top and bottom) */}
            <SplitModeMenu mode={splitModeOf(splitEnabled, splitOrientation)} onPick={pickSplitMode} />
            {tabs.length > 0 ? (
              <button
                ref={tabOverflowBtnRef}
                type="button"
                className={`tab-split-btn tab-overflow-btn${tabOverflowOpen ? ' is-on' : ''}`}
                data-testid="tab-overflow"
                data-hidden={tabHiddenCount}
                aria-expanded={tabOverflowOpen}
                aria-haspopup="menu"
                aria-label={tr('tab.overflow', { n: tabs.length, hidden: tabHiddenCount })}
                title={tr('tab.allTabsN', { n: tabs.length })}
                onClick={() => {
                  if (tabOverflowOpen) {
                    setTabOverflowOpen(false)
                    return
                  }
                  openAllTabsMenu()
                }}
              >
                {/* D108: icon button like the split-mode button; badge = tab count, dot when some are scrolled out */}
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                  <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
                  <path d="M4 6h8M4 8.5h8M4 11h5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span className={`tab-overflow-badge${tabHiddenCount > 0 ? ' has-hidden' : ''}`} aria-hidden>{tabs.length > 99 ? '99+' : tabs.length}</span>
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
                            <span className="tab-kind-icon">
                              <Icon name={tabKindIcon(t.view)} size={TAB_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
                            </span>
                            {t.pinned ? <Icon name="pin" size={TAB_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} /> : null}
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
                                <Icon name="check" size={CHROME_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
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
                const canDuplicate = (!tab.view || tab.view === 'session') && (tab.kind === 'local' ? localShellAvailable : Boolean(tab.connectOpts?.host))
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
                  canCopySsh: tab.kind !== 'local' && Boolean(tab.connectOpts?.host) && !tab.connectOpts?.demo,
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
                        } else {
                          try {
                            if (localStorage.getItem('aiss.prefs.tabPinTipShown') !== '1') {
                              localStorage.setItem('aiss.prefs.tabPinTipShown', '1')
                              showToast(tg('tab.pinnedToast'), { ms: 3500 })
                            }
                          } catch { /* ignore */ }
                        }
                      } else if (id === 'rename') startRename(tab.tabId)
                      else if (id === 'duplicate') {
                        void duplicateTab(tab)
                      } else if (id === 'copyInfo') {
                        // D49: host, user, status, cwd, last command; no secrets
                        const text = sessionInfoText({
                          title: tab.customTitle || tab.title,
                          kind: tab.kind === 'local' ? 'local' : 'ssh',
                          user: tab.connectOpts.username,
                          host: tab.connectOpts.host,
                          port: tab.connectOpts.port,
                          status: tab.status,
                          reason: tab.status === 'disconnected' && tab.failRaw ? friendlyErrorMessage(tab.failRaw) : undefined,
                          cwd: tab.sessionId ? getSessionCwd(tab.sessionId) : null,
                          last: tab.sessionId ? lastRunFor(tab.sessionId) : null,
                          sensitive: isSensitiveCommand
                        })
                        void navigator.clipboard.writeText(text).then(
                          () => showToast(tg('d49.copied')),
                          () => showToast(tg('d49.copyFail'), { kind: 'error' })
                        )
                      } else if (id === 'copySsh') {
                        const cmd = formatSshCommand(tab.connectOpts)
                        void navigator.clipboard.writeText(cmd).then(
                          () => showToast(tg('d84.copied', { cmd })),
                          () => showToast(tg('d49.copyFail'), { kind: 'error' })
                        )
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
              <span className="l10-queue-text">
                {tg('l10.queue', {
                  started: batchQueue.started,
                  total: batchQueue.total,
                  n: batchQueue.queued,
                  ok: batchQueue.ok,
                  fail: batchQueue.fail
                })}
              </span>
              <span className="l10-queue-chips" aria-hidden>
                <span className="l10-chip l10-chip-ok" data-testid="l10-chip-ok">{tg('l10.okChip', { n: batchQueue.ok })}</span>
                <span className="l10-chip l10-chip-fail" data-testid="l10-chip-fail">{tg('l10.failChip', { n: batchQueue.fail })}</span>
              </span>
              {batchQueue.current ? (
                <span className="l10-queue-current" title={batchQueue.current} data-testid="l10-queue-current">
                  {tg('l10.queueCurrent', { host: batchQueue.current })}
                </span>
              ) : null}
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
                <div key={row.id} className="l10-error" data-testid="l10-error" data-host={row.label}>
                  <span className="l10-error-host" title={row.label}>{row.label}</span>
                  <span className="l10-error-reason" title={row.reason}>{row.reason}</span>
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
            <div className="session-disconnect-banner session-connecting-banner" role="status" {...QUIET_LOAD_ATTRS}>
              <span>
                {tr('banner.connecting', {
                  target: `${activeTab.connectOpts.username}@${activeTab.connectOpts.host}:${activeTab.connectOpts.port}`
                })}
              </span>
              {(() => {
                const st = connectStages[stageTarget(activeTab.connectOpts.host, activeTab.connectOpts.port)]
                if (!st) return null
                const name = tr(`d77b.stage.${st.stage}` as 'd77b.stage.tcp')
                return (
                  <span className="session-connecting-stage" data-testid="connecting-stage" data-stage={st.stage}>
                    {st.hop ? tr('d77b.hopStage', { n: st.hop, total: st.hopTotal ?? st.hop, stage: name }) : name}
                  </span>
                )
              })()}
              <ConnectingElapsed
                key={activeTab.tabId}
                since={connectingSinceRef.current.get(activeTab.tabId) ?? Date.now()}
                timeoutSec={policyRef.current.connectTimeoutSec}
              />
              <button
                type="button"
                className="session-connecting-cancel"
                data-testid="connecting-cancel"
                title={tr('d73.cancelTip')}
                onClick={() => {
                  // D73: stop waiting; keep the tab (disconnected) so Reconnect / Edit stay one click away
                  const id = activeTab.tabId
                  cancelledConnectingTabsRef.current.add(id)
                  setTabs((prev) => prev.map((x) => (x.tabId === id && x.status === 'connecting' ? { ...x, status: 'disconnected' } : x)))
                  setConnecting(false)
                  showToast(tg('d73.cancelled'))
                }}
              >
                {tr('d73.cancel')}
              </button>
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

          {/* c50 P2: demo + guard banners merge into one row */}
          {activeIsDemo && !(activeTab?.sessionId && activeTab.profileId && (() => { const g = guardForSession(activeTab.sessionId); if (g.level === 'normal') return false; const pid = g.profile?.id; return !(pid && guardCollapsed[pid] && !g.elevated) })()) ? (
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
              draftKey={activeTab.tabId}
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
                  // 2.4: production + effective Auto run → say so in the banner (reminder only, nothing is blocked)
                  const autoHint = prodAutoHint({
                    level: g.level,
                    paused,
                    policy: resolveAiPolicy({
                      settings: aiPolicySettings,
                      hostPolicy: g.profile?.aiPolicy,
                      tempOverride: activeTab.tabId ? tempPolicyByTab[activeTab.tabId] : undefined,
                      protection: { level: g.level, elevated: g.elevated }
                    })
                  })
                  const autoTip = autoHint
                    ? tg('prodAuto.tip', { source: tg(`policy.source.${autoHint.source}` as 'policy.source.global'), high: autoHint.autoHighRisk ? tg('prodAuto.high') : tg('prodAuto.highOff') })
                    : ''
                  const baseTip = paused ? tg('l4.bannerPaused', { time: `${mm}:${ss}` }) : g.level === 'readonly' ? tg('s4.banner') : tg('l4.bannerProd')
                  return (
                    <div
                      className={`term-guard-banner${paused ? ' is-paused' : g.level === 'readonly' ? ' is-ro' : ' is-prod'}${autoHint ? ' has-auto' : ''}`}
                      data-testid="term-guard-banner"
                      data-ai-policy={autoHint ? 'auto' : undefined}
                      title={autoTip ? `${baseTip}\n${autoTip}` : baseTip}
                    >
                      <span className="s4-banner-long">{baseTip}</span>
                      <span className="s4-banner-short">{paused ? `${mm}:${ss}` : g.level === 'readonly' ? tg('s4.bannerShort') : tg('l4.bannerProd')}</span>
                      {activeIsDemo ? (<span className="term-guard-demo" data-testid="demo-banner" role="status" title={tr('g1.banner')}><span className="term-guard-demo-text">{tr('g1.banner')}</span><span className="term-guard-demo-short" aria-hidden="true"><span className="banner-ai-dot" />{tr('g1.bannerShort')}</span><button type="button" className="primary" onClick={() => openConnectionEditor()}>{tr('g1.addMine')}</button></span>) : null}
                      {autoHint ? (
                        <button
                          type="button"
                          className={`banner-ai-auto${autoHint.autoHighRisk ? ' is-high' : ''}`}
                          data-testid="banner-ai-auto"
                          title={autoTip}
                          aria-label={autoTip}
                          onClick={() => {
                            ensureAiVisible()
                            openRightPanelRef.current('ai')
                            window.setTimeout(() => window.dispatchEvent(new Event(OPEN_AI_POLICY_EVENT)), 60)
                          }}
                        >
                          <span className="banner-ai-dot" aria-hidden />
                          <span className="banner-ai-long">{autoHint.autoHighRisk ? tg('prodAuto.chipHigh') : tg('prodAuto.chip')}</span>
                          <span className="banner-ai-short">{tg('prodAuto.chipShort')}</span>
                        </button>
                      ) : null}
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
                  onClick={() => {
                    void navigator.clipboard.writeText(roBlock.command).then(
                      () => showToast(tg('ctx.copied')),
                      () => showToast(tg('ai.copyFailed'), { kind: 'error' })
                    )
                  }}
                >
                  {tg('s4.copyCmd')}
                </button>
                <button
                  type="button"
                  data-testid="s4-unlock"
                  onClick={() => {
                    const g = guardForSession(roBlock.sessionId)
                    if (!g.profile) {
                      showToast(tg('s4.needProfile'), { kind: 'error' })
                      return
                    }
                    void elevateProfile(g.profile)
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
                title={
                  profiles.length === 0
                    ? tr('ux08.sidebarTitle')
                    : startupMode === 'blank'
                      ? tr('l7.blankTitle')
                      : tr('ux08.termTitle')
                }
                desc={
                  profiles.length === 0
                    ? tr('ux08.termDescEmpty')
                    : startupMode === 'blank'
                      ? tr('l7.blankDesc')
                      : tr('ux08.termDesc')
                }
                primary={
                  profiles.length === 0
                    ? {
                        label: tr('ux08.newConnection'),
                        onClick: () => openConnectionEditor(),
                        testId: 'term-empty-new',
                        command: 'connection'
                      }
                    : { label: tr('l7.title'), onClick: () => openHome(), avoid: true }
                }
                secondary={
                  profiles.length === 0
                    ? [
                        { label: tr('pf1.import'), onClick: () => void importSessionsPick(), command: 'importSessions' },
                        { label: tr('pf1.demo'), onClick: () => void addDemoHost(true), command: 'demoHost' }
                      ]
                    : [
                        { label: tr('ux08.newConnection'), onClick: () => openConnectionEditor() },
                        { label: tr('ux08.palette'), onClick: () => setPaletteOpen(true) }
                      ]
                }
              >
                <RecentConnections variant="welcome" limit={5} hideWhenEmpty onQuickConnect={quickConnectRecent} demoRenamed={profiles.some((p) => p.id === DEMO_PROFILE_ID && p.demoRenamed)} />
                <div className="empty-state-keys">
                  <span>
                    <kbd>Ctrl+Shift+N</kbd> {tr('ux08.keyNew')}
                  </span>
                  <span>
                    <kbd>Ctrl+K</kbd> {tr('ux08.keyPalette')}
                  </span>
                  <span data-testid="term-empty-key-focus">
                    <kbd>{keysFor('focusTerminal') ?? 'Ctrl+Shift+`'}</kbd> {tr('ux08.keyFocusTerm')}
                  </span>
                  <span data-testid="term-empty-key-ai">
                    <kbd>{keysFor('focusAiPanel') ?? 'Ctrl+Shift+A'}</kbd> {tr('ux08.keyAi')}
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
                    error={t.tabId === activeTabId && failureCard ? null : error}
                    notice={t.tabId === activeTabId ? failureCard : null}
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
                    sessionNote={sessionNote}
                    setSessionNote={setSessionNote}
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
                    agentForward={agentForward}
                    setAgentForward={setAgentForward}
                    hostForAudit={label.trim() || host.trim()}
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
                        ...(certificatePath.trim() ? { certificatePath: certificatePath.trim() } : {}),
                        ...(agentForward ? { agentForward: true } : {})
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
                    aiPolicy={profiles.find((p) => p.id === inventoryLink?.profileId)?.aiPolicy}
                    onAiPolicyChange={
                      inventoryLink?.profileId && !profiles.find((p) => p.id === inventoryLink?.profileId)?.demo
                        ? (policy) => setHostAiPolicy(inventoryLink.profileId!, policy)
                        : undefined
                    }
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
                    onOpenDocker={(target) => {
                      const profileId =
                        t.profileId ||
                        tabs.find((x) => x.sessionId && x.sessionId === t.boundSessionId && x.profileId)?.profileId
                      const profile = profileId ? profiles.find((p) => p.id === profileId) : undefined
                      if (!profile) return
                      openDockerDetail({ profile, ...target })
                    }}
                    onDockerChanged={() => {
                      const profileId =
                        t.profileId ||
                        tabs.find((x) => x.sessionId && x.sessionId === t.boundSessionId && x.profileId)?.profileId
                      const profile = profileId ? profiles.find((p) => p.id === profileId) : undefined
                      if (!profile) return
                      void loadDockerTreeForProfile(profile, true)
                      window.setTimeout(() => void silentRefreshDockerTree(profile), 1200)
                      window.setTimeout(() => void silentRefreshDockerTree(profile), 3200)
                    }}
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
                    folders={folders}
                    onOpenHost={(sid, command) => {
                      // D65: fill only; the user reviews and presses Enter
                      const live = tabs.find((x) => x.sessionId === sid && (!x.view || x.view === 'session'))
                      if (live) setActiveTabId(live.tabId)
                      window.setTimeout(() => fillCommandBar(sid, command), 60)
                    }}
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
                    nextTask={pendingTasks(taskState)[0]}
                    onDismissTasks={() => {
                      setTaskState(dismissTasksForever())
                      toastUndo({ message: tg('l7e.tasksHidden'), undo: () => setTaskState(reopenTasks()) })
                    }}
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
                    onEditHost={(profileId) => openConnectionEditor(profiles.find((x) => x.id === profileId))}
                    onOpenHostSftp={(host) => {
                      const p = profiles.find((x) => x.id === host.profileId)
                      if (p) openSftpFromHost(p)
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
                    return <PostmortemTab alert={tl} events={viewTimeline(tl, eventsFor(alert.id), auditEvents)} version={appVersion || '0.4.13'} />
                  })()
                ) : t.view === 'playbook-list' ? (
                  <PlaybookList
                    profiles={profiles}
                    onEdit={(id) => {
                      openM2('playbook-edit', tg('m2.edit'), { playbookId: id })
                      showToast(tg('m2.edit'))
                    }}
                    onRun={(id) => {
                      openM2('playbook-run', tg('m2.run'), { playbookId: id })
                      showToast(tg('m2.run'))
                    }}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'playbook-edit' && t.playbookId ? (
                  <PlaybookEditor
                    playbookId={t.playbookId}
                    onRun={(id) => {
                      openM2('playbook-run', tg('m2.run'), { playbookId: id })
                      showToast(tg('m2.run'))
                    }}
                    onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)}
                  />
                ) : t.view === 'playbook-run' && t.playbookId ? (
                  <PlaybookRun
                    playbookId={t.playbookId}
                    profiles={profiles}
                    live={liveSessions}
                    sessionReadonly={sessionRo}
                    onResult={() => {
                      openM2('playbook-result', tg('m2.playbooks'))
                      showToast(tg('m2.playbooks'))
                    }}
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
                  <PlaybookImportTab appVersion={appVersion || '0.4.13'} onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} />
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
                    onOpen={(file) => {
                      openM2('recording-play', tg('m2.play'), { recordingFile: file })
                      showToast(tg('m2.play'))
                    }}
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
                    focusId={t.auditFocusId}
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
                        showToast(tg('audit.cleared'))
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
                    <PanelHeader
                      title={t.title}
                      actions={
                        <>
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
                        </>
                      }
                    />
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
                    onCdInTerminal={(path) => {
                      // D28: SFTP -> terminal. Filled, not run: the shell may be busy, and Enter stays with the user.
                      const term = tabs.find((x) => x.sessionId === t.boundSessionId && x.status === 'connected' && (!x.view || x.view === 'session'))
                      const line = cdCommandFor(path)
                      if (!term?.sessionId || !line) {
                        showToast(tg('d28.noTerm'))
                        return
                      }
                      setActiveTabId(term.tabId)
                      const sid = term.sessionId
                      window.setTimeout(() => dispatchInjectTerminal(sid, line, false), 60)
                      showToast(tg('d28.filled', { path }))
                    }}
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
                    onPinPreview={(plan) => {
                      openM2('sync-preview', tg('m2.syncPreview'), { syncPlan: { ...plan, sessionId: t.boundSessionId, profileId: t.profileId }, boundSessionId: t.boundSessionId, profileId: t.profileId })
                      showToast(tg('m2.syncPreview'))
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
                    onOpenKnownHosts={() => setKnownHostsOpen(true)}
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
                  <UiThemeModal onClose={() => closeTab(t.tabId, t.sessionId, t.status, t.view)} onTerminalTheme={(themeId) => setTerminalPrefs((p) => ({ ...p, themeId }))} />
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
                      onToggleBroadcast={() => handleTitlebarMenuActionRef.current('toggleBroadcast')}
                      orientation={splitOrientation}
                      primaryTitle={dupLabelFor(t)}
                      peers={connectedSshSessions
                        .filter((x) => x.sessionId !== t.sessionId)
                        .map((x) => ({ sessionId: x.sessionId, title: dupLabelBySession(x.sessionId) || x.title }))}
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
                    <TerminalBlocks sessionId={t.sessionId} hostKey={sessionHostKey(t)} />
                    </>
                  )
                ) : (
                  <div className="terminal-disconnected-placeholder" data-testid="term-disconnected" role="status">
                    <div className="term-disconnect-card">
                      <p className="term-disconnect-msg">{tr('term.disconnected')}</p>
                      {t.failRaw ? (
                        <p className="term-disconnect-reason" data-testid="term-disconnect-reason">
                          {friendlyErrorMessage(t.failRaw)}
                        </p>
                      ) : null}
                      {t.failRaw ? (
                        <button
                          type="button"
                          className="ghost"
                          data-testid="term-copy-disconnect-reason"
                          onClick={() => {
                            const text = friendlyErrorMessage(t.failRaw!) || t.failRaw!
                            void navigator.clipboard.writeText(text).then(
                              () => showToast(tg('term.disconnectReasonCopied')),
                              () => showToast(tg('ai.copyFailed'), { kind: 'error' })
                            )
                          }}
                        >
                          {tg('term.copyDisconnectReason')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="primary"
                        data-testid="term-reconnect"
                        disabled={reconnectingTabId === t.tabId}
                        onClick={() => {
                          haltedRef.current.delete(t.tabId)
                          const cur = autoRetryRef.current.get(t.tabId)
                          if (cur) clearTimeout(cur.timer)
                          autoRetryRef.current.delete(t.tabId)
                          void reconnectTab(t.tabId, { full: true }).then((sid) => {
                            if (sid) cancelAutoReconnect(t.tabId)
                            else if (policyRef.current.mode !== 'off') scheduleAutoReconnectRef.current(t.tabId)
                          })
                        }}
                      >
                        {reconnectingTabId === t.tabId ? tr('term.connecting') : tg('pf5.reconnect')}
                      </button>
                    </div>
                  </div>
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
              onAppAction={onAppAction}
              onOpenSettings={() => openUnifiedSettings('ai')}
              activeSessionId={activeSessionId}
              historyKey={activeConv ? activeConv.key : GENERAL_CONVERSATION_KEY}
              conversation={
                activeConv
                  ? { group: activeConv.group, n: activeConv.n, hostLabel: activeConv.hostLabel, status: activeConv.status }
                  : null
              }
              aiTargets={aiTargets}
              onSelectTarget={(tabId) => setActiveTabId(tabId)}
              onReconnect={activeConv && activeConv.status === 'disconnected' ? () => void reconnectTab(activeConv.tabId) : undefined}
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
              protection={activeSessionId ? guardForSession(activeSessionId).level : 'normal'}
              elevated={activeSessionId ? guardForSession(activeSessionId).elevated : false}
              hostPolicy={activeTabProfile?.aiPolicy}
              onSetHostPolicy={activeTabProfile && !activeTabProfile.demo ? (policy) => setHostAiPolicy(activeTabProfile.id, policy) : undefined}
              onOpenHostSafety={
                activeTabProfile && !activeTabProfile.demo
                  ? () => {
                      const p = activeTabProfile
                      openInventoryEditor({ profileId: p.id, host: p.host, label: p.label, hostInventoryId: p.hostInventoryId })
                      window.setTimeout(() => {
                        document.querySelector('[data-testid="host-safety-card"]')?.scrollIntoView({ block: 'center' })
                      }, 700)
                    }
                  : undefined
              }
              tempPolicy={activeTabId ? tempPolicyByTab[activeTabId] : undefined}
              onSetTempPolicy={
                activeTabId
                  ? (policy) =>
                      setTempPolicyByTab((prev) => {
                        const next = { ...prev }
                        if (policy) next[activeTabId] = policy
                        else delete next[activeTabId]
                        return next
                      })
                  : undefined
              }
              production={activeSessionId ? guardForSession(activeSessionId).level === 'production' && !guardForSession(activeSessionId).elevated : false}
              hostName={activeTab?.connectOpts.host ?? null}
              onSwitchToConversation={(key) => {
                const hit = convTabs.find((t) => convFor(t.tabId)?.key === key)
                if (hit) setActiveTabId(hit.tabId)
              }}
              onNeedSession={() => {
                const live = connectedSshSessions[0]
                if (live) {
                  const tab = tabs.find((t) => t.sessionId === live.sessionId)
                  if (tab) {
                    setActiveTabId(tab.tabId)
                    return
                  }
                }
                openConnectionEditor()
              }}
              initialPending={aiPending}
              onPendingChange={onAiPendingChange}
              focusPendingToken={aiFocusPendingToken}
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
          const slots = fitStatusSlots(
            statusBarSlots({
              syncEnabled: syncMeta.enabled,
              phase: syncMeta.phase,
              recording: Boolean(recordingSessionId),
              broadcastCount: broadcastSessions.length,
              disconnected: Boolean(bannerTab),
              host: bannerTab ? (bannerTab.connectOpts.label?.trim() || bannerTab.connectOpts.host || bannerTab.title) : '',
              tabId: bannerTab?.tabId
            }).slots
          )
          const connectedCount = tabs.filter(
            (t) => (!t.view || t.view === 'session') && t.status === 'connected' && t.kind !== 'local'
          ).length
          const quiet = statusQuietLabel({
            connected: connectedCount,
            disconnected: Boolean(bannerTab),
            locale: locale === 'en' ? 'en' : 'zh-CN'
          })
          return (
            <>
              {ro}
              {quiet ? (
                <span className="statusbar-quiet" data-testid="statusbar-quiet">
                  {quiet}
                </span>
              ) : null}
              {aiPending && (!layout.showAi || rightPane !== 'ai') ? (
                <button
                  type="button"
                  className="statusbar-slot statusbar-slot--ai-pending"
                  data-testid="statusbar-ai-pending"
                  title={aiPending.preview || tg('sb.aiPending')}
                  onClick={() => openAiPendingConfirm()}
                >
                  <span className="statusbar-glyph" aria-hidden>
                    <Icon name="sparkles" size={STATUS_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
                  </span>
                  <span className="statusbar-label">{tg('sb.aiPending')}</span>
                </button>
              ) : null}
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
                      title={tg('ux10.broadcastEdit')}
                      onClick={() => setBroadcastPickerOpen(true)}
                    >
                      <span className="statusbar-glyph" aria-hidden>
                        {statusSlotIconName(slot) ? (
                          <Icon name={statusSlotIconName(slot)!} size={STATUS_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
                        ) : (
                          slot.glyph
                        )}
                      </span>
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
                      <span className="statusbar-glyph" aria-hidden>
                        {statusSlotIconName(slot) ? (
                          <Icon name={statusSlotIconName(slot)!} size={STATUS_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
                        ) : (
                          slot.glyph
                        )}
                      </span>
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
                    <span className="statusbar-glyph" aria-hidden>
                        {statusSlotIconName(slot) ? (
                          <Icon name={statusSlotIconName(slot)!} size={STATUS_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
                        ) : (
                          slot.glyph
                        )}
                      </span>
                    <span className="statusbar-label">{tg(syncPhaseKey(phase))}</span>
                  </button>
                )
              })}
              {activeIsSsh ? (() => {
                const tab = activeTab && (!activeTab.view || activeTab.view === 'session') ? activeTab : null
                const hostLabel = statusHostChipLabel(
                  tab?.connectOpts.label?.trim() || tab?.connectOpts.host || tab?.title || tab?.customTitle
                )
                if (!hostLabel) return null
                return (
                  <button
                    type="button"
                    className="statusbar-slot statusbar-slot--host"
                    data-testid="statusbar-host"
                    title={`${tg('sb.hostTip')} · ${tg('sb.hostFocusTip')}`}
                    onDoubleClick={(e) => {
                      e.preventDefault()
                      const sid = activeSessionIdRef.current
                      if (!sid) return
                      updateLayout((p) => withPaneToggle(p, 'main', true))
                      window.dispatchEvent(new CustomEvent('aiss-focus-terminal', { detail: { sessionId: sid } }))
                    }}
                    onClick={() => {
                      const profile = profilesRef.current.find((p) => p.id === tab?.profileId)
                      const conn = formatConnectionString({
                        username: tab?.connectOpts.username ?? profile?.username,
                        host: tab?.connectOpts.host ?? profile?.host,
                        port: tab?.connectOpts.port ?? profile?.port
                      })
                      void navigator.clipboard.writeText(conn).then(
                        () => showToast(tg('sess.copiedConn', { conn })),
                        () => showToast(tg('ai.copyFailed'), { kind: 'error' })
                      )
                    }}
                  >
                    <span className="statusbar-label">{hostLabel}</span>
                  </button>
                )
              })() : null}
              {activeIsSsh && formatStatusLatency(statusLatencyMs, locale === 'en' ? 'en' : 'zh-CN') ? (
                <button
                  type="button"
                  className={`statusbar-slot statusbar-slot--latency session-latency-${classifyLatency(statusLatencyMs)}`}
                  data-testid="statusbar-latency"
                  title={`${tg('sb.latencyTip')} · ${tg('sb.latencyTipCopy')}`}
                  onClick={() => {
                    const clip = latencyClipboardText(statusLatencyMs)
                    if (!clip) return
                    const tab = tabsRef.current.find(
                      (row) => row.tabId === activeTabId && (!row.view || row.view === 'session')
                    )
                    const host =
                      statusHostChipLabel(
                        tab?.connectOpts.label?.trim() || tab?.connectOpts.host || tab?.title || tab?.customTitle
                      ) || tab?.title || tab?.connectOpts.host || '—'
                    void navigator.clipboard.writeText(clip).then(
                      () => showToast(tg('sb.latencyCopied', { ms: clip, host })),
                      () => showToast(tg('ai.copyFailed'), { kind: 'error' })
                    )
                  }}
                >
                  <span className="statusbar-label">{formatStatusLatency(statusLatencyMs, locale === 'en' ? 'en' : 'zh-CN')}</span>
                </button>
              ) : null}
              {(() => {
                const pid = activeTab?.profileId
                const noteRaw = pid ? profiles.find((p) => p.id === pid)?.note : undefined
                const preview = sessionNotePreview(noteRaw, 18)
                if (!preview) return null
                return (
                  <button
                    type="button"
                    className="statusbar-slot statusbar-slot--note"
                    data-testid="statusbar-note"
                    title={tg('sb.noteTip')}
                    onClick={() => handleTitlebarMenuAction('editSessionNote')}
                  >
                    <span className="statusbar-label">{tg('sb.note', { note: preview })}</span>
                  </button>
                )
              })()}
              {sftpComfort ? (
                <button
                  type="button"
                  className="statusbar-slot statusbar-slot--sftp-comfort"
                  data-testid="statusbar-sftp-comfort"
                  title={tg('sb.sftpComfortTip')}
                  onClick={() => {
                    saveSftpDensity('auto')
                    setSftpComfort(false)
                    window.dispatchEvent(new CustomEvent(SFTP_DENSITY_EVENT))
                    showToast(tg('sb.sftpComfortOff'))
                  }}
                >
                  <span className="statusbar-label">{tg('sb.sftpComfort')}</span>
                </button>
              ) : null}
              {splitEnabled ? (
                <SplitModeMenu variant="status" mode={splitModeOf(splitEnabled, splitOrientation)} onPick={pickSplitMode} />
              ) : null}
              {activeTab?.pinned ? (
                <button
                  type="button"
                  className="statusbar-slot statusbar-slot--pin"
                  data-testid="statusbar-pin"
                  title={tg('sb.pinTip')}
                  onClick={() => {
                    const tab = tabsRef.current.find((row) => row.tabId === activeTabId)
                    if (!tab?.pinned) return
                    const hostLabel =
                      statusHostChipLabel(
                        tab.connectOpts?.label?.trim() || tab.connectOpts?.host || tab.title || tab.customTitle
                      ) || tab.title || tab.connectOpts?.host || '—'
                    setTabs((prev) =>
                      prev.map((row, i) =>
                        row.tabId === tab.tabId ? { ...row, pinned: false, openSeq: row.openSeq ?? i + 1 } : row
                      )
                    )
                    showToast(tg('tab.unpinnedHost', { host: hostLabel }), { ms: 2000 })
                  }}
                >
                  <span className="statusbar-label">{tg('sb.pinned')}</span>
                </button>
              ) : null}
              {terminalPrefs.muteBell ? (
                <button
                  type="button"
                  className="statusbar-slot statusbar-slot--mute-bell"
                  data-testid="statusbar-mute-bell"
                  title={tg('sb.muteBellTip')}
                  onClick={() => {
                    void window.aiss.terminal.setPrefs({ muteBell: false }).then((p) => {
                      setTerminalPrefs(p)
                      showToast(tg('term.bellUnmuted'))
                    }).catch(() => undefined)
                  }}
                >
                  <span className="statusbar-label">{tg('sb.muteBell')}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="statusbar-slot"
                data-testid="statusbar-font-size"
                title={tg('sb.fontSizeTip')}
                onClick={(e) => {
                  const next =
                    e.shiftKey
                      ? bumpTerminalFontSize(terminalPrefs.fontSize, 1)
                      : e.altKey || e.ctrlKey || e.metaKey
                        ? bumpTerminalFontSize(terminalPrefs.fontSize, -1)
                        : resetTerminalFontSize()
                  void window.aiss.terminal.setPrefs({ fontSize: next }).then((p) => {
                    setTerminalPrefs(p)
                    showToast(tg('zoom.size', { n: p.fontSize }))
                  })
                }}
              >
                <span className="statusbar-label">{tg('sb.fontSize', { n: terminalPrefs.fontSize })}</span>
              </button>
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
      <WelcomeTour open={tourOpen} onClose={closeTour} ensureAiVisible={ensureAiVisible} />
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
      <KnownHostsModal
        open={knownHostsOpen}
        onClose={() => setKnownHostsOpen(false)}
        onUseKey={(path) => {
          setKnownHostsOpen(false)
          const existing = tabsRef.current.find((t) => t.view === 'connection')
          if (existing) {
            setActiveTabId(existing.tabId)
          } else {
            openConnectionEditor(undefined, 'cert')
          }
          setConnFocus(null)
          setPrivateKeyPath(path)
          setConnAuth('key')
          queueMicrotask(() => setConnFocus('cert'))
          const base = path.split(/[/\\]/).pop() || path
          showToast(tg('kh.useKeyDone', { name: base }))
        }}
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
      <QuickPick
        open={quickPick === 'history'}
        testId="qp-history"
        title={tg('qp.historyTitle')}
        placeholder={tg('qp.historyPlaceholder')}
        footer={tg('qp.historyFoot')}
        emptyTitle={tg('qp.historyEmpty')}
        emptyDesc={tg('qp.historyEmptyDesc')}
        rank={rankHistory}
        chord="r"
        onChord={() => {
          if (activeSessionId) void window.aiss.ssh.write(activeSessionId, '\x12')
        }}
        scopeToggle={
          activeTab && sessionHostKey(activeTab)
            ? {
                on: histHostOnly,
                label: tg('d38.hostOnly'),
                title: tg('d38.hostOnlyTip'),
                onToggle: () =>
                  setHistHostOnly((v) => {
                    saveHostOnly(!v)
                    return !v
                  })
              }
            : undefined
        }
        onClose={() => setQuickPick(null)}
        onPick={(it, opts) => {
          if (!activeSessionId) return
          // D33: Ctrl+Enter runs right away, but only plain commands on normal hosts; otherwise fill and say why
          if (opts?.run) {
            const tab = tabs.find((x) => x.sessionId === activeSessionId)
            const prof = tab?.profileId ? profiles.find((p) => p.id === tab.profileId) : undefined
            const level = stricterLevel(effectiveLevel(prof), Boolean(tab?.profileId && sessionRo[tab.profileId]))
            const risky = Boolean(assessCommandRisk(it.value))
            if (level === 'normal' && !risky) {
              dispatchInjectTerminal(activeSessionId, it.value, true)
              return
            }
            showToast(tg(risky ? 'd33.risky' : 'd33.protected'))
          }
          dispatchInjectTerminal(activeSessionId, it.value, false)
        }}
        onAskFailed={(it) => {
          if (activeSessionId && typeof it.failed === 'number') askAboutHistoryFailure(activeSessionId, it.value, it.failed)
        }}
        onForget={(it) => {
          // D43: app history only (the shell's own history file is untouched); undo restores the rows
          const hk = histHostOnly && activeTab ? sessionHostKey(activeTab) : undefined
          const dropped = forgetCommand(it.value, hk || undefined)
          if (!dropped.length) return
          showToast(tg('d43.forgot'), { ms: 8000, actions: [{ label: tg('d43.undo'), run: () => restoreSmartEntries(dropped) }] })
        }}
        currentCwd={quickPick === 'history' ? getSessionCwd(activeSessionId) : null}
        onRunInCwd={(it) => {
          // D31: filled, not run
          const line = activeSessionId ? runInCwdLine(it.cwd, it.value, getSessionCwd(activeSessionId)) : null
          if (activeSessionId && line) dispatchInjectTerminal(activeSessionId, line, false)
        }}
      />
      <QuickPick
        open={quickPick === 'switch'}
        testId="qp-switch"
        title={tg('qp.switchTitle')}
        placeholder={tg('qp.switchPlaceholder')}
        footer={tg('qp.switchFoot')}
        emptyTitle={tg('qp.switchEmpty')}
        emptyDesc={tg('qp.switchEmptyDesc')}
        rank={rankSwitch}
        chord="p"
        onChord={() => {
          if (activeSessionId) void window.aiss.ssh.write(activeSessionId, '\x10')
        }}
        onClose={() => setQuickPick(null)}
        onPick={(it: PickItem) => {
          if (it.kind === 'tab') setActiveTabId(it.value)
          else if (it.value.startsWith('qc:')) {
            const qt = parseQuickTarget(it.value.slice(3))
            if (qt) openQuickTarget(qt)
          } else {
            const p = profiles.find((x) => x.id === it.value)
            if (p) void connectProfile(p)
          }
        }}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAction={handleTitlebarMenuAction}
        activeSessionId={activeSessionId}
        hostEntries={cmdkHostEntries}
        onOpenHost={(id) => {
          const p = profiles.find((x) => x.id === id)
          if (p) void connectProfile(p)
        }}
        onQuickTarget={(text) => {
          const qt = parseQuickTarget(text)
          if (qt) openQuickTarget(qt)
        }}
        aiReady={aiConfigured}
        notes={{
          ...(syncReady ? {} : { syncNow: tg('m2.syncNeedSetup') }),
          ...(hasPlaybooks ? {} : { runPlaybook: tg('m2.noPlaybooks') }),
          ...(localShellAvailable ? {} : { localShell: tg('localShell.hintUnavailable') }),
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
          ...(tabs.some((tab) => tab.view === 'file-diff') ? {} : { explainDiff: tg('l8b.needDiff'), diffFixPlaybook: tg('l8b.needDiff') }),
          ...(reconnectAllBusy
            ? {
                reconnectNow: tg('palette.reconnectAllBusy'),
                reconnectAllDropped: tg('palette.reconnectAllBusy')
              }
            : tabs.some(
                  (t) => t.status === 'disconnected' && (!t.view || t.view === 'session') && t.kind !== 'local'
                )
              ? {}
              : {
                  reconnectNow: tg('palette.needDropped'),
                  reconnectAllDropped: tg('palette.needDropped')
                }),
          ...(aiConfigured ? {} : { askAgain: tg('ux37.notConfigured') })
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
      
      {broadcastPickerOpen ? (
        <BroadcastTargetPicker
          open={broadcastPickerOpen}
          tabs={broadcastPickerTabs}
          initialSelected={initialBroadcastSelection(broadcastTargets, broadcastLiveIds)}
          onCancel={() => setBroadcastPickerOpen(false)}
          onConfirm={(ids) => {
            const live = pruneBroadcastTargets(ids, broadcastLiveIds)
            setBroadcastTargets(live)
            setBroadcastEnabled(live.length >= 2)
            setBroadcastPickerOpen(false)
            if (live.length >= 2) showToast(tg('ux10.broadcasting', { n: live.length }))
          }}
          onStop={() => {
            setBroadcastEnabled(false)
            setBroadcastPickerOpen(false)
            // keep broadcastTargets so reopen restores the last set
          }}
        />
      ) : null}

      <SearchAllTermsModal open={searchAllOpen} onClose={() => setSearchAllOpen(false)} labelFor={searchAllLabel} onPick={searchAllPick} />
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
            showToast(tg('l2d.open'))
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
              showToast(tg('ctx.batch'))
            })()
            return
          }
          if (id === 'monitorBoard') {
            setSessionMenu(null)
            openDashboard()
            showToast(tg('l7.openDashboard'))
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
              showToast(tg('ctx.toolbox'))
            })
            return
          }
          if (id === 'edit') {
            openConnectionEditor(p)
            setSessionMenu(null)
            showToast(tg('pf5.editConn'))
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
            showToast(tg('menu.inventory'))
            return
          }
          if (id === 'tags') {
            void editProfileTags(p.id)
            return
          }
          if (id === 'rename') {
            void renameProfile(p)
            return
          }
          if (id === 'copyAddr') {
            setSessionMenu(null)
            // D84: a runnable ssh command (port, key path, jump hops; never secrets)
            const addr = formatSshCommand(connectOptsFromProfile(p))
            try {
              window.aiss.clipboard.writeText(addr)
              showToast(tg('d84.copied', { cmd: addr }))
            } catch {
              void navigator.clipboard.writeText(addr).then(() => showToast(tg('d84.copied', { cmd: addr })))
            }
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
