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

  '0.3.16': [
    {
      icon: '🔎',
      text: { zh: '标题栏搜索框文字不再被竖直裁切', en: 'Titlebar search label no longer clipped vertically' },
      where: { zh: '标题栏右侧「搜索功能… Ctrl+K」', en: 'Titlebar search button' }
    },
    {
      icon: '➕',
      text: { zh: '新建连接始终空白表单，不带入侧栏选中主机；智能填表置顶', en: 'New connection always blank; smart fill moved to top' },
      where: { zh: '＋ 新建连接', en: '+ New connection' },
      action: 'connection'
    },
    {
      icon: '📋',
      text: { zh: '主机档案页重设计：概览头、只读基本信息、紧凑服务列表、备注预览', en: 'Host profile redesign: overview header, read-only basics, compact services, notes preview' },
      where: { zh: '主机右键 → 主机档案', en: 'Host right-click → Host profile' },
      action: 'inventory'
    },
    {
      icon: '🧰',
      text: { zh: '工具箱危险操作默认隐藏，日志页自动读取', en: 'Toolbox dangerous actions hidden until hover; Logs auto-load' },
      action: 'serverTools'
    },
    {
      icon: '📈',
      text: { zh: '监控趋势图更大更清晰，超 85% 标红警告', en: 'Larger monitor trend charts with 85% warning' },
      action: 'resourceMonitor'
    },
    {
      icon: '✨',
      text: { zh: '命令栏默认收起，点右下角 ✨ 展开', en: 'Command bar collapsed by default; expand with the ✨ button' }
    },
    {
      icon: '🗺',
      text: { zh: '多主机监控看板：一屏看 CPU/内存/磁盘', en: 'Multi-host dashboard: CPU/mem/disk cards at a glance' },
      where: { zh: '运维 → 多主机看板（Ctrl+Alt+M）', en: 'Ops → Multi-host dashboard (Ctrl+Alt+M)' },
      action: 'dashboard'
    },
    {
      icon: '🖱',
      text: { zh: '输入框与终端统一右键菜单', en: 'Unified right-click menus for inputs and the terminal' }
    },
    {
      icon: '📁',
      text: { zh: '演示主机 SFTP 显示模拟文件树，写操作置灰', en: 'Demo host SFTP shows a simulated tree; writes disabled' },
      action: 'demoHost'
    }
  ],

  '0.3.15': [
    {
      icon: '🧰',
      text: { zh: '服务器工具箱所有入口都在中间标签页打开（工具箱 · 主机），不再弹窗', en: 'Every server toolbox entry opens a center tab (Toolbox · host), no more dialog' },
      where: { zh: '运维 → 服务器工具箱（Ctrl+Alt+T）', en: 'Ops → Server toolbox (Ctrl+Alt+T)' },
      action: 'serverTools'
    },
    {
      icon: '🔀',
      text: { zh: '端口转发、批量执行也改为标签页', en: 'Port forwarding and Batch run open as tabs too' }
    },
    {
      icon: '🎯',
      text: { zh: '主机右键刚连上就打开监控/工具箱时，指向正确的主机', en: 'Host right-click Monitor / Toolbox targets the right host right after connecting' }
    },
    {
      icon: '📑',
      text: { zh: '标签很多时在标签栏内滚动，关闭工具标签回到对应主机终端', en: 'Many tabs scroll inside the tab bar; closing a tool tab returns to its host' }
    }
  ],

  '0.3.14': [
    {
      icon: '📑',
      text: { zh: '监控与工具箱改为中间标签页打开，同一主机不重复', en: 'Monitor and toolbox open as center tabs (deduped per host)' }
    },
    {
      icon: '🧰',
      text: { zh: '极简默认工具栏：新建连接 · 监控 · 工具箱 · SFTP · 搜索', en: 'Minimal default toolbar: New · Monitor · Toolbox · SFTP · Search' }
    },
    {
      icon: '🔐',
      text: { zh: '新建连接占位改用文档 IP 192.0.2.10，单列分组表单', en: 'Connection placeholder uses documentation IP 192.0.2.10; single-column form' }
    },
    {
      icon: '🤖',
      text: { zh: 'AI 面板未配置时默认收起并显示配置空状态；默认宽度 320px', en: 'AI panel collapses when unconfigured with empty-state; default width 320px' }
    },
    {
      icon: '📁',
      text: { zh: 'SFTP 工具条与文件行不换行', en: 'SFTP toolbar and file rows no longer wrap' }
    }
  ],  '0.3.13': [
    {
      icon: '🧪',
      text: { zh: '内置演示主机：不用服务器也能试终端、资源监控和工具箱（数据为模拟）', en: 'Built-in demo host: try the terminal, monitor and toolbox without a server (simulated data)' },
      where: { zh: '帮助 → 试用演示主机', en: 'Help → Try demo host' },
      action: 'demoHost'
    },
    {
      icon: '🧭',
      text: { zh: '5 步新手引导，随时可以跳过或重看', en: 'A 5-step welcome tour you can skip or replay any time' },
      where: { zh: '帮助 → 新手引导', en: 'Help → Welcome tour' },
      action: 'tour'
    },
    {
      icon: '✨',
      text: { zh: 'AI 解释报错：命令失败时点「✨ AI 解释」，给出原因和修复命令，可插入或确认后执行', en: 'Explain errors with AI: click "✨ Explain with AI" when a command fails to get the cause and fix commands to insert or run' },
      where: { zh: '终端右下角 / 终端右键 / AI → AI：解释最近的错误', en: 'Terminal corner / terminal right-click / AI → AI: Explain the last error' },
      action: 'aiExplainError'
    },
    {
      icon: '💬',
      text: { zh: '用自然语言生成命令：命令栏输入 # 或按 Ctrl+Shift+Space，带风险标记，执行前确认', en: 'Natural language → command: type # in the command bar or press Ctrl+Shift+Space; risk-labelled and confirmed before running' },
      where: { zh: '命令栏 / AI → 用自然语言生成命令', en: 'Command bar / AI → Natural language → command' },
      action: 'aiCommand'
    },
    {
      icon: '🧹',
      text: { zh: '体验打磨：统一的确认弹窗、空状态引导、未连接时先选主机、广播/录制状态一眼可见、菜单命名统一', en: 'Polish: one dialog style, helpful empty states, host picker when nothing is connected, visible broadcast/recording state, consistent names' }
    }
  ],
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
