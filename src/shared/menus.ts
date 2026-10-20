/**
 * Menu definition shared by the main-process application menu and the renderer titlebar menus (UX-03).
 * Shortcuts come from the keymap registry (UX-02); labels carry both languages so main and renderer stay in sync.
 */
import { keysFor } from './keymap'

export type MenuAction =
  | 'connection'
  | 'localShell'
  | 'serialPort'
  | 'newFolder'
  | 'importSessions'
  | 'importSshConfig'
  | 'knownHosts'
  | 'exportOpenssh'
  | 'exportJson'
  | 'backup'
  | 'cloudSync'
  | 'syncNow'
  | 'saveWorkspaceNow'
  | 'exportOpenTabsList'
  | 'settings'
  | 'quit'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'find'
  | 'commandPalette'
  | 'toggleSidebar'
  | 'toggleMain'
  | 'toggleAi'
  | 'focusAiPanel'
  | 'focusTerminal'
  | 'closeOtherTabs'
  | 'closeTabsToRight'
  | 'openAllTabs'
  | 'closeDisconnectedTabs'
  | 'reopenClosedTab'
  | 'clearAiChat'
  | 'copyLastAiReply'
  | 'copyLastOutput'
  | 'toggleSplit'
  | 'toggleHostStatus'
  | 'uiTheme'
  | 'toggleUiTheme'
  | 'terminalPrefs'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'clearScrollback'
  | 'toggleMuteBell'
  | 'toggleTabPin'
  | 'smartComplete'
  | 'clearHostHistory'
  | 'toggleLanguage'
  | 'reconnect'
  | 'disconnectSession'
  | 'disconnectAllSessions'
  | 'duplicateSession'
  | 'sftp'
  | 'sftpTransferQueue'
  | 'folderSync'
  | 'portForward'
  | 'toggleBroadcast'
  | 'toggleRecording'
  | 'toggleBlocks'
  | 'toggleShellIntegration'
  | 'resourceMonitor'
  | 'dashboard'
  | 'opsHome'
  | 'alertWorkbench'
  | 'alertRules'
  | 'alertHistory'
  | 'auditLog'
  | 'playbooks'
  | 'runPlaybook'
  | 'sessionRecordings'
  | 'startupSettings'
  | 'serverTools'
  | 'refreshDocker'
  | 'batchExec'
  | 'snippets'
  | 'inventory'
  | 'openAi'
  | 'aiExplainError'
  | 'aiCommand'
  | 'askAgain'
  | 'aiInspect'
  | 'broadcastTargets'
  | 'ai'
  | 'mcpGuide'
  | 'debug'
  | 'shortcuts'
  | 'whatsNew'
  | 'tour'
  | 'demoHost'
  | 'checkUpdate'
  | 'updateChannel'
  | 'taskCards'
  | 'sftpComfort'
  | 'github'
  | 'about'
  | 'setJumpHosts'
  | 'editSessionNote'
  | 'copyConnectionString'
  | 'checkCerts'
  | 'testJump'
  | 'openDocker'
  | 'syncConflicts'
  | 'syncPreview'
  | 'fixPlaybook'
  | 'dryRunPlaybook'
  | 'fileSnapshots'
  | 'exportPostmortem'
  | 'toggleBlockStrip'
  | 'refreshHomeHealth'
  | 'switchTab'
  | 'quickStart'
  | 'replayWelcome'
  | 'enableRuleTemplates'
  | 'retryFailedProbes'
  | 'exportPlaybookPack'
  | 'importPlaybookPack'
  | 'gateTimeline'
  | 'maintOpen'
  | 'maintEnd'
  | 'setDryRunReminder'
  | 'aiPostmortem'
  | 'explainDiff'
  | 'explainSelection'
  | 'diffFixPlaybook'
  | 'openProdGuard'
  | 'reconnectPolicy'
  | 'reconnectNow'
  | 'reconnectAllDropped'
  | 'readonlyOn'
  | 'readonlyOff'
  | 'setProtection'
  | 'batchConnect'
  | 'batchConnectGroup'
  | 'builtinSnippets'
  | 'builtinPlaybooks'
  | 'exportAudit'

export type Bilingual = { zh: string; en: string }

export type SharedMenuItem =
  | {
      type: 'item'
      id: MenuAction
      label: Bilingual
      shortcut?: string
      /** toggle items show a ☑ when on (UX-10) */
      toggle?: boolean
      /** needs an active SSH session (UX-09: opens host picker when none) */
      needsSession?: boolean
      /** Hidden from menus; still searchable in Ctrl+K (UX-31b). */
      menuHidden?: boolean
    }
  | { type: 'sep' }

export type SharedMenu = { id: string; label: Bilingual; items: SharedMenuItem[] }

const it = (
  id: MenuAction,
  zh: string,
  en: string,
  extra?: { toggle?: boolean; needsSession?: boolean; shortcut?: string; menuHidden?: boolean }
): SharedMenuItem => ({ type: 'item', id, label: { zh, en }, shortcut: extra?.shortcut ?? keysFor(id), ...extra })
const sep: SharedMenuItem = { type: 'sep' }

export const SHARED_MENUS: SharedMenu[] = [
  {
    id: 'file',
    label: { zh: '文件', en: 'File' },
    items: [
      it('connection', '新建连接…', 'New connection…'),
      it('localShell', '本机 Shell', 'Local shell'),
      it('serialPort', '串口…', 'Serial port…'),
      it('newFolder', '新建分组…', 'New group…'),
      it('batchConnect', '连接选中主机…', 'Connect selected hosts…'),
      it('batchConnectGroup', '连接当前分组…', 'Connect current group…'),
      sep,
      it('importSessions', '导入会话…', 'Import sessions…'),
      it('importSshConfig', '导入 OpenSSH config…', 'Import OpenSSH config…'),
      it('knownHosts', '主机密钥与本机密钥…', 'Known hosts & local keys…'),
      it('exportOpenssh', '导出为 OpenSSH', 'Export as OpenSSH'),
      it('exportJson', '导出为 JSON', 'Export as JSON'),
      it('backup', '加密备份与恢复…', 'Encrypted backup & restore…'),
      it('cloudSync', '云同步…', 'Cloud sync…'),
      it('syncNow', '立即同步', 'Sync now'),
      it('saveWorkspaceNow', '立即保存工作区', 'Save workspace now'),
      it('exportOpenTabsList', '复制打开的标签列表', 'Copy open tabs list'),
      sep,
      it('settings', '设置…', 'Settings…'),
      it('updateChannel', '更新…', 'Updates…'),
      it('quit', '退出', 'Quit', { shortcut: 'Alt+F4' })
    ]
  },
  {
    id: 'edit',
    label: { zh: '编辑', en: 'Edit' },
    items: [
      it('undo', '撤销', 'Undo', { shortcut: 'Ctrl+Z' }),
      it('redo', '重做', 'Redo', { shortcut: 'Ctrl+Y' }),
      sep,
      it('cut', '剪切', 'Cut', { shortcut: 'Ctrl+X' }),
      it('copy', '复制', 'Copy', { shortcut: 'Ctrl+Shift+C' }),
      it('paste', '粘贴', 'Paste', { shortcut: 'Ctrl+Shift+V' }),
      it('selectAll', '全选', 'Select all'),
      sep,
      it('find', '查找…', 'Find…')
    ]
  },
  {
    id: 'view',
    label: { zh: '查看', en: 'View' },
    items: [
      it('opsHome', '运维首页', 'Ops home'),
      it('refreshHomeHealth', '刷新首页健康', 'Refresh home health'),
      it('retryFailedProbes', '重试失败采样', 'Retry failed probes'),
      it('commandPalette', '命令面板…', 'Command palette…'),
      it('switchTab', '切换标签…', 'Switch tab…'),
      sep,
      it('toggleSidebar', '会话栏', 'Session sidebar', { toggle: true }),
      it('toggleMain', '终端区', 'Terminal area', { toggle: true }),
      it('toggleAi', 'AI 面板', 'AI panel', { toggle: true }),
      it('focusAiPanel', '聚焦 AI 面板', 'Focus AI panel'),
      it('focusTerminal', '聚焦终端', 'Focus terminal'),
      it('toggleBlockStrip', '输出分块条', 'Output block strip', { toggle: true }),
      it('clearAiChat', '清空 AI 对话…', 'Clear AI chat…'),
      it('copyLastAiReply', '复制上一条 AI 回复', 'Copy last AI reply'),
      it('closeOtherTabs', '关闭其他标签', 'Close other tabs'),
      it('closeTabsToRight', '关闭右侧标签', 'Close tabs to the right'),
      it('openAllTabs', '全部标签…', 'All tabs…'),
      it('closeDisconnectedTabs', '关闭已断开的标签', 'Close disconnected tabs'),
      it('reopenClosedTab', '重新打开关闭的标签', 'Reopen closed tab'),
      sep,
      it('toggleSplit', '分屏', 'Split view', { toggle: true }),
      it('toggleHostStatus', '显示主机在线状态', 'Show host status', { toggle: true }),
      sep,
      it('uiTheme', '界面主题…', 'UI theme…'),
      it('toggleUiTheme', '切换浅色/深色主题', 'Toggle light/dark theme'),
      it('terminalPrefs', '终端外观…', 'Terminal appearance…'),
      it('zoomIn', '放大终端字体', 'Zoom in terminal font'),
      it('zoomOut', '缩小终端字体', 'Zoom out terminal font'),
      it('zoomReset', '重置终端字体', 'Reset terminal font size'),
      it('clearScrollback', '清空终端回滚缓冲', 'Clear terminal scrollback'),
      it('copyLastOutput', '复制上一条命令的输出', 'Copy last command output'),
      it('toggleMuteBell', '静音终端铃', 'Mute terminal bell', { toggle: true }),
      it('toggleTabPin', '固定/取消固定当前标签', 'Pin/unpin current tab', { toggle: true }),
      it('smartComplete', '智能补全（基于命令历史）', 'Smart completion (from history)', { toggle: true }),
      it('sftpComfort', 'SFTP 舒适密度', 'SFTP comfort density', { toggle: true }),
      it('clearHostHistory', '清除本主机命令历史…', 'Clear history for this host…'),
      it('startupSettings', '启动设置…', 'Startup settings…'),
      it('toggleLanguage', '切换语言（English）', 'Switch language (Chinese)')
    ]
  },
  {
    id: 'session',
    label: { zh: '会话', en: 'Session' },
    items: [
      it('reconnect', '重新连接', 'Reconnect', { needsSession: true }),
      it('reconnectNow', '立即重连（已断开）', 'Reconnect now (if dropped)', { needsSession: true }),
      it('disconnectSession', '断开当前会话…', 'Disconnect current session…', { needsSession: true }),
      it('disconnectAllSessions', '断开全部会话…', 'Disconnect all sessions…'),
      it('reconnectAllDropped', '重连全部已断开的会话', 'Reconnect all dropped sessions'),
      it('reconnectPolicy', '重连策略…', 'Reconnect policy…'),
      it('duplicateSession', '复制会话', 'Duplicate session', { needsSession: true }),
      it('editSessionNote', '编辑会话备注…', 'Edit session note…', { needsSession: true }),
      it('openProdGuard', '生产防护…', 'Production guard…', { needsSession: true }),
      it('readonlyOn', '开启只读会话', 'Enable read-only session', { needsSession: true }),
      it('readonlyOff', '关闭只读会话', 'Disable read-only session', { needsSession: true }),
      it('copyConnectionString', '复制连接串', 'Copy connection string', { needsSession: true }),
      it('checkCerts', '检查证书…', 'Check certificates…', { needsSession: true }),
      it('setJumpHosts', '跳板主机…', 'Jump hosts…', { needsSession: true }),
      it('testJump', '测试跳板…', 'Test jump path…', { needsSession: true }),
      sep,
      it('sftp', 'SFTP 文件', 'SFTP files', { needsSession: true }),
      it('sftpTransferQueue', 'SFTP 传输队列', 'SFTP transfer queue', { needsSession: true }),
      it('folderSync', '同步文件夹…', 'Sync folder…', { needsSession: true }),
      it('syncConflicts', '同步冲突…', 'Sync conflicts…'),
      it('syncPreview', '同步预览…', 'Sync preview…'),
      it('fileSnapshots', '文件历史快照…', 'File history snapshots…'),
      it('portForward', '端口转发…', 'Port forwarding…', { needsSession: true }),
      sep,
      it('toggleBroadcast', '广播输入', 'Broadcast input', { toggle: true }),
      it('broadcastTargets', '选择广播目标…', 'Choose broadcast targets…'),
      it('toggleRecording', '录制', 'Recording', { toggle: true, needsSession: true }),
      it('sessionRecordings', '会话录制', 'Session recordings'),
      it('toggleBlocks', '输出分块', 'Output blocks', { toggle: true }),
      it('toggleShellIntegration', 'Shell 集成（bash/zsh）', 'Shell integration (bash/zsh)', { toggle: true })
    ]
  },
  {
    id: 'ops',
    label: { zh: '运维', en: 'Ops' },
    // PNG-2 / Polish-10: daily rows only. At least two low-frequency verbs stay menuHidden
    // so Ctrl+K still finds them, and the open menu stays under OPS_MENU_VISIBLE_CAP.
    items: [
      it('opsHome', '运维首页', 'Ops home'),
      it('alertWorkbench', '告警工作台', 'Alert workbench'),
      sep,
      it('playbooks', '运维剧本', 'Playbooks'),
      it('runPlaybook', '运行剧本…', 'Run playbook…', { menuHidden: true }),
      it('builtinPlaybooks', '内置运维剧本…', 'Built-in playbooks…', { menuHidden: true }),
      it('exportPlaybookPack', '导出剧本分享包…', 'Export playbook pack…', { menuHidden: true }),
      it('importPlaybookPack', '导入剧本分享包…', 'Import playbook pack…', { menuHidden: true }),
      it('dryRunPlaybook', '剧本演练（Dry-run）…', 'Dry-run playbook…', { menuHidden: true }),
      sep,
      it('resourceMonitor', '资源监控', 'Resource monitor', { needsSession: true }),
      it('dashboard', '多主机看板', 'Multi-host dashboard', { menuHidden: true }),
      it('serverTools', '服务器工具箱', 'Server toolbox', { needsSession: true }),
      it('openDocker', 'Docker 容器…', 'Docker containers…', { needsSession: true, menuHidden: true }),
      it('refreshDocker', '刷新 Docker', 'Refresh Docker', { menuHidden: true }),
      sep,
      it('batchExec', '批量执行…', 'Batch run…'),
      it('snippets', '命令片段', 'Snippets'),
      it('builtinSnippets', '内置命令片段…', 'Built-in snippets…', { menuHidden: true }),
      it('inventory', '主机档案', 'Host inventory'),
      sep,
      it('alertRules', '告警规则…', 'Alert rules…', { menuHidden: true }),
      it('enableRuleTemplates', '告警规则模板…', 'Alert rule templates…', { menuHidden: true }),
      it('alertHistory', '告警历史', 'Alert history', { menuHidden: true }),
      it('exportPostmortem', '导出复盘…', 'Export postmortem…', { menuHidden: true }),
      it('auditLog', '审计日志', 'Audit log', { menuHidden: true }),
      it('exportAudit', '导出审计（合规）', 'Export audit (compliance)', { menuHidden: true }),
      it('gateTimeline', '闸门时间线', 'Gate timeline', { menuHidden: true }),
      it('maintOpen', '维护窗口…', 'Maintenance window…', { menuHidden: true }),
      it('maintEnd', '结束维护…', 'End maintenance…', { menuHidden: true }),
      it('setDryRunReminder', '演练提醒筛选…', 'Dry-run reminder filter…', { menuHidden: true })
    ]
  },
  {
    id: 'ai',
    label: { zh: 'AI', en: 'AI' },
    items: [
      it('openAi', '打开 AI 助手', 'Open AI assistant'),
      it('aiExplainError', '解释最近的错误', 'Explain last error'),
      it('explainSelection', '解释选中内容', 'Explain selection'),
      it('explainDiff', '解释文件差异…', 'Explain file diff…'),
      it('diffFixPlaybook', '差异生成修复剧本…', 'Diff → fix playbook…'),
      it('aiCommand', '自然语言生成命令', 'Command from natural language', { needsSession: true }),
      it('askAgain', '重新提问', 'Ask again'),
      it('aiInspect', '多主机巡检报告…', 'Multi-host inspection…'),
      it('aiPostmortem', 'AI 复盘告警…', 'AI alert postmortem…'),
      sep,
      it('ai', 'AI 设置…', 'AI settings…'),
      sep,
      it('mcpGuide', 'MCP 安装指南…', 'MCP setup guide…'),
      it('debug', 'AI 调试…', 'AI debug…')
    ]
  },
  {
    id: 'help',
    label: { zh: '帮助', en: 'Help' },
    items: [
      it('shortcuts', '键盘快捷键', 'Keyboard shortcuts'),
      it('quickStart', '快速上手（3 步）', 'Quick start (3 steps)'),
      it('replayWelcome', '重新欢迎', 'Show welcome again'),
      it('tour', '重看完整引导', 'Replay full tour'),
      it('taskCards', '入门任务', 'Getting started tasks'),
      it('demoHost', '试用演示主机', 'Try demo host'),
      it('whatsNew', '更新内容', "What's new"),
      it('checkUpdate', '检查更新', 'Check for updates'),
      sep,
      it('github', 'GitHub', 'GitHub'),
      it('about', '关于 AI-SSH-Pro', 'About AI-SSH-Pro')
    ]
  }
]

export function menuLabel(b: Bilingual, locale: string): string {
  return locale === 'zh-CN' ? b.zh : b.en
}

export function visibleMenuItems(menu: SharedMenu): SharedMenuItem[] {
  const items = menu.items.filter((it) => it.type === 'sep' || !it.menuHidden)
  const out: SharedMenuItem[] = []
  for (const it of items) {
    if (it.type === 'sep' && (out.length === 0 || out[out.length - 1]?.type === 'sep')) continue
    out.push(it)
  }
  while (out.length && out[out.length - 1]?.type === 'sep') out.pop()
  return out
}

export function visibleActionIds(menu: SharedMenu): string[] {
  return visibleMenuItems(menu).flatMap((it) => (it.type === 'item' ? [it.id] : []))
}

/** PNG-2: open Ops rows stay at or under this count. Polish-1 keeps the list strictly under it. */
export const OPS_MENU_VISIBLE_CAP = 12

export type OpsMenuRow = {
  id: MenuAction
  zh: string
  en: string
  /** Rare action: still defined for Ctrl+K, omitted from the open menu. */
  lowFrequency: boolean
}

/** Inventory of the Ops menu. `lowFrequency` is the menuHidden flag, not a second menu. */
export function opsMenuInventory(): OpsMenuRow[] {
  const ops = SHARED_MENUS.find((m) => m.id === 'ops')
  if (!ops) return []
  return ops.items.flatMap((item) =>
    item.type === 'item' ? [{ id: item.id, zh: item.label.zh, en: item.label.en, lowFrequency: item.menuHidden === true }] : []
  )
}
