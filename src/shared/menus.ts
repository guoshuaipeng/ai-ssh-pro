/**
 * Menu definition shared by the main-process application menu and the renderer titlebar menus (UX-03).
 * Shortcuts come from the keymap registry (UX-02); labels carry both languages so main and renderer stay in sync.
 */
import { keysFor } from './keymap'

export type MenuAction =
  | 'connection'
  | 'localShell'
  | 'newFolder'
  | 'importSessions'
  | 'exportOpenssh'
  | 'exportJson'
  | 'backup'
  | 'cloudSync'
  | 'syncNow'
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
  | 'toggleSplit'
  | 'toggleHostStatus'
  | 'uiTheme'
  | 'terminalPrefs'
  | 'smartComplete'
  | 'clearHostHistory'
  | 'toggleLanguage'
  | 'reconnect'
  | 'duplicateSession'
  | 'sftp'
  | 'folderSync'
  | 'portForward'
  | 'toggleBroadcast'
  | 'toggleRecording'
  | 'toggleBlocks'
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
  | 'checkCerts'
  | 'testJump'
  | 'openDocker'
  | 'syncConflicts'
  | 'syncPreview'

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
    }
  | { type: 'sep' }

export type SharedMenu = { id: string; label: Bilingual; items: SharedMenuItem[] }

const it = (
  id: MenuAction,
  zh: string,
  en: string,
  extra?: { toggle?: boolean; needsSession?: boolean; shortcut?: string }
): SharedMenuItem => ({ type: 'item', id, label: { zh, en }, shortcut: extra?.shortcut ?? keysFor(id), ...extra })
const sep: SharedMenuItem = { type: 'sep' }

export const SHARED_MENUS: SharedMenu[] = [
  {
    id: 'file',
    label: { zh: '文件', en: 'File' },
    items: [
      it('connection', '新建连接…', 'New connection…'),
      it('localShell', '本机 Shell', 'Local shell'),
      it('newFolder', '新建分组…', 'New group…'),
      sep,
      it('importSessions', '导入会话…', 'Import sessions…'),
      it('exportOpenssh', '导出为 OpenSSH', 'Export as OpenSSH'),
      it('exportJson', '导出为 JSON', 'Export as JSON'),
      it('backup', '加密备份与恢复…', 'Encrypted backup & restore…'),
      it('cloudSync', '云同步…', 'Cloud sync…'),
      it('syncNow', '立即同步', 'Sync now'),
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
      it('commandPalette', '命令面板…', 'Command palette…'),
      sep,
      it('toggleSidebar', '会话栏', 'Session sidebar', { toggle: true }),
      it('toggleMain', '终端区', 'Terminal area', { toggle: true }),
      it('toggleAi', 'AI 面板', 'AI panel', { toggle: true }),
      sep,
      it('toggleSplit', '分屏', 'Split view', { toggle: true }),
      it('toggleHostStatus', '显示主机在线状态', 'Show host status', { toggle: true }),
      sep,
      it('uiTheme', '界面主题…', 'UI theme…'),
      it('terminalPrefs', '终端外观…', 'Terminal appearance…'),
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
      it('duplicateSession', '复制会话', 'Duplicate session', { needsSession: true }),
      sep,
      it('sftp', 'SFTP 文件', 'SFTP files', { needsSession: true }),
      it('folderSync', '文件夹同步…', 'Folder sync…', { needsSession: true }),
      it('portForward', '端口转发…', 'Port forwarding…', { needsSession: true }),
      sep,
      it('toggleBroadcast', '广播输入', 'Broadcast input', { toggle: true }),
      it('broadcastTargets', '选择广播目标…', 'Choose broadcast targets…'),
      it('toggleRecording', '录制', 'Recording', { toggle: true, needsSession: true }),
      it('sessionRecordings', '会话录制', 'Session recordings'),
      it('toggleBlocks', '输出分块', 'Output blocks', { toggle: true })
    ]
  },
  {
    id: 'ops',
    label: { zh: '运维', en: 'Ops' },
    items: [
      it('opsHome', '运维首页', 'Ops home'),
      it('alertWorkbench', '告警工作台', 'Alert workbench'),
      sep,
      it('playbooks', '运维剧本', 'Playbooks'),
      it('runPlaybook', '运行剧本…', 'Run playbook…'),
      sep,
      it('resourceMonitor', '资源监控', 'Resource monitor', { needsSession: true }),
      it('dashboard', '多主机看板', 'Multi-host dashboard'),
      it('serverTools', '服务器工具箱', 'Server toolbox', { needsSession: true }),
      it('refreshDocker', '刷新 Docker', 'Refresh Docker'),
      sep,
      it('batchExec', '批量执行…', 'Batch run…'),
      it('snippets', '命令片段', 'Snippets'),
      it('inventory', '主机档案', 'Host inventory'),
      sep,
      it('alertRules', '告警规则…', 'Alert rules…'),
      it('alertHistory', '告警历史', 'Alert history'),
      it('auditLog', '审计日志', 'Audit log')
    ]
  },
  {
    id: 'ai',
    label: { zh: 'AI', en: 'AI' },
    items: [
      it('openAi', '打开 AI 助手', 'Open AI assistant'),
      it('aiExplainError', 'AI：解释最近的错误', 'AI: Explain the last error'),
      it('aiCommand', '用自然语言生成命令', 'Natural language → command', { needsSession: true }),
      it('aiInspect', '多主机巡检报告…', 'Multi-host AI inspection…'),
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
      it('tour', '新手引导', 'Welcome tour'),
      it('taskCards', '入门任务', 'Getting started tasks'),
      it('demoHost', '试用演示主机', 'Try demo host'),
      it('whatsNew', '更新内容', "What's new"),
      it('checkUpdate', '检查更新…', 'Check for updates…'),
      sep,
      it('github', 'GitHub', 'GitHub'),
      it('about', '关于 AI-SSH-Pro', 'About AI-SSH-Pro')
    ]
  }
]

export function menuLabel(b: Bilingual, locale: string): string {
  return locale === 'zh-CN' ? b.zh : b.en
}
