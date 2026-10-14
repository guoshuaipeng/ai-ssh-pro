import type { MenuAction } from './menus'

/**
 * In-app "What's new" entries (V3). CHANGELOG.md holds the same release in markdown for GitHub Release notes (R1).
 * `where` tells the user where to find the feature; when `action` is set the entry is a clickable link.
 */
export type ChangelogEntry = {
  icon: string
  text: { zh: string; en: string }
  where?: { zh: string; en: string }
  action?: MenuAction
}

export const CHANGELOG: Readonly<Record<string, ReadonlyArray<ChangelogEntry>>> = {
  '0.3.12': [
    {
      icon: '🏷',
      text: { zh: '标题栏显示当前版本号，点击查看更新内容', en: 'The title bar shows the current version; click it to see what is new' },
      where: { zh: '标题栏 → 版本号', en: 'Title bar → version' }
    },
    {
      icon: '⬆',
      text: { zh: '自动提示新版本，可下载、稍后或跳过此版本', en: 'New versions are announced automatically: download, later, or skip' },
      where: { zh: '帮助 → 检查更新…', en: 'Help → Check for updates…' },
      action: 'checkUpdate'
    },
    {
      icon: '🖱',
      text: { zh: '主机右键直接打开 SFTP、资源监控、服务器工具箱，多选可批量执行', en: 'Right-click a host to open SFTP, monitor or toolbox; multi-select to batch run' },
      where: { zh: '会话栏 → 右键主机（Ctrl/Shift 多选）', en: 'Sidebar → right-click a host (Ctrl/Shift to multi-select)' }
    },
    {
      icon: '🟢',
      text: { zh: '主机在线状态与延迟，连接前先看一眼', en: 'Host online status and latency before you connect' },
      where: { zh: '查看 → 显示主机在线状态', en: 'View → Show host status' }
    },
    {
      icon: '⌨',
      text: {
        zh: '快捷键调整：SFTP→Ctrl+Alt+F，工具箱→Ctrl+Alt+T，侧栏→Ctrl+Alt+1；终端里 Ctrl+B 等按键交还给 shell（tmux 可用），Ctrl+Shift+F 终端内查找',
        en: 'Shortcut changes: SFTP→Ctrl+Alt+F, toolbox→Ctrl+Alt+T, sidebar→Ctrl+Alt+1; Ctrl+B etc. now reach the shell (tmux works); Ctrl+Shift+F finds in terminal'
      },
      where: { zh: '帮助 → 键盘快捷键 (F1)', en: 'Help → Keyboard shortcuts (F1)' },
      action: 'shortcuts'
    },
    {
      icon: '🧭',
      text: { zh: '菜单重排为 文件/编辑/查看/会话/运维/AI/帮助，开关项显示勾选；工具栏分组更清爽', en: 'Menus reorganised into File/Edit/View/Session/Ops/AI/Help with check marks; a tidier grouped toolbar' },
      where: { zh: '查看 → 命令面板 (Ctrl+K)', en: 'View → Command palette (Ctrl+K)' },
      action: 'commandPalette'
    }
  ]
}

export function changelogFor(version: string): ReadonlyArray<ChangelogEntry> {
  return CHANGELOG[version.replace(/^v/i, '').replace(/-.*$/, '')] ?? []
}
