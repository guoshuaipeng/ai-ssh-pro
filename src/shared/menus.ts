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
  | 'toggleLanguage'
  | 'reconnect'
  | 'duplicateSession'
  | 'sftp'
  | 'portForward'
  | 'toggleBroadcast'
  | 'toggleRecording'
  | 'resourceMonitor'
  | 'serverTools'
  | 'refreshDocker'
  | 'batchExec'
  | 'snippets'
  | 'inventory'
  | 'openAi'
  | 'ai'
  | 'mcpGuide'
  | 'debug'
  | 'shortcuts'
  | 'whatsNew'
  | 'checkUpdate'
  | 'github'
  | 'about'

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
      sep,
      it('settings', '设置…', 'Settings…'),
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
      it('portForward', '端口转发…', 'Port forwarding…', { needsSession: true }),
      sep,
      it('toggleBroadcast', '广播输入', 'Broadcast input', { toggle: true }),
      it('toggleRecording', '录制', 'Recording', { toggle: true, needsSession: true })
    ]
  },
  {
    id: 'ops',
    label: { zh: '运维', en: 'Ops' },
    items: [
      it('resourceMonitor', '资源监控', 'Resource monitor', { needsSession: true }),
      it('serverTools', '服务器工具箱', 'Server toolbox', { needsSession: true }),
      it('refreshDocker', 'Docker 刷新', 'Refresh Docker'),
      sep,
      it('batchExec', '批量执行…', 'Batch run…'),
      it('snippets', '命令片段', 'Snippets'),
      it('inventory', '主机档案', 'Host inventory')
    ]
  },
  {
    id: 'ai',
    label: { zh: 'AI', en: 'AI' },
    items: [
      it('openAi', '打开 AI 助手', 'Open AI assistant'),
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
