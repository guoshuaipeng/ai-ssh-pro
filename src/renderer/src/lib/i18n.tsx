import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { normalizeLocale, type LocaleId } from '@shared/workspace-features'

const zhCN = {
  'menu.session': '会话',
  'menu.edit': '编辑',
  'menu.view': '查看',
  'menu.file': '文件',
  'menu.help': '帮助',
  'menu.newConnection': '新建连接',
  'menu.localShell': '本机 Shell',
  'menu.sftp': '文件传输',
  'menu.refreshDocker': '刷新 Docker',
  'menu.newFolder': '新建文件夹',
  'menu.importSessions': '导入会话…',
  'menu.exportOpenssh': '导出 OpenSSH…',
  'menu.exportJson': '导出 JSON…',
  'menu.split': '分屏',
  'menu.broadcast': '切换广播输入',
  'menu.recording': '开始/停止录制',
  'menu.ai': 'AI 配置',
  'menu.debug': 'AI 助手调试…',
  'menu.snippets': '命令片段',
  'menu.inventory': '主机档案',
  'menu.mcpGuide': 'MCP 安装指南…',
  'menu.batchExec': '批量执行…',
  'menu.undo': '撤销',
  'menu.redo': '重做',
  'menu.cut': '剪切',
  'menu.copy': '复制',
  'menu.paste': '粘贴',
  'menu.selectAll': '全选',
  'menu.toggleSidebar': '切换左侧会话栏',
  'menu.toggleMain': '切换中间终端区',
  'menu.toggleAi': '切换右侧 AI 面板',
  'menu.uiTheme': '界面主题',
  'menu.terminalPrefs': '终端外观',
  'menu.quit': '退出',
  'menu.about': '关于 AI-SSH-Pro',
  'toolbar.checkUpdate': '检查更新（当前 v{version}）',
  'toolbar.checkUpdatePlain': '检查更新',
  'toolbar.checking': '检查中…',
  'toolbar.update': '更新',
  'toolbar.openGithub': '在浏览器打开 GitHub 仓库',
  'toolbar.github': 'GitHub',
  'toolbar.toDark': '切换为深色模式',
  'toolbar.toLight': '切换为浅色模式',
  'toolbar.dark': '深色',
  'toolbar.light': '浅色',
  'toolbar.layout': '布局显隐',
  'toolbar.hideSidebar': '隐藏左侧会话栏',
  'toolbar.showSidebar': '显示左侧会话栏',
  'toolbar.hideMain': '隐藏中间终端区',
  'toolbar.showMain': '显示中间终端区',
  'toolbar.hideAi': '隐藏右侧 AI 面板',
  'toolbar.showAi': '显示右侧 AI 面板',
  'toolbar.batch': '批量',
  'toolbar.batchTitle': '在多个已连接 SSH 会话上执行同一条命令',
  'toolbar.recent': '最近',
  'toolbar.recentTitle': '最近连接与书签',
  'toolbar.appActions': '应用操作',
  'toolbar.localeTitle': '界面语言：{locale}',
  'update.available': '{message}\n\n点击「确定」打开下载页并安装新版本。',
  'update.noRelease': '{message}\n\n是否打开 GitHub Releases 页面？',
  'update.failed': '检查更新失败：{message}\n\n是否打开 GitHub 仓库？',
  'sidebar.saved': '已保存会话',
  'sidebar.searchPlaceholder': '搜索会话 / 容器（名称 / 主机 / 用户）',
  'sidebar.searchLabel': '搜索会话或容器',
  'sidebar.empty': '暂无',
  'tab.none': '未打开会话',
  'tab.connecting': '{title} (连接中…)',
  'tab.disconnected': '{title} (已断开)',
  'tab.close': '关闭',
  'tab.closeLabel': '关闭标签',
  'banner.connecting': '正在连接 {target}…',
  'banner.disconnected': '会话已断开（连接失败、keepalive 超时或对端关闭）。',
  'banner.reconnect': '重新连接',
  'banner.reconnecting': '重连中…',
  'term.connecting': '正在建立 SSH 连接…',
  'term.disconnected': '连接已断开，可点击上方「重新连接」。',
  'about.title': '关于 AI-SSH-Pro',
  'about.desc': '类 Xshell 的多会话 SSH 客户端，集成 AI 对话',
  'about.version': '当前版本',
  'about.github': '打开 GitHub 仓库',
  'about.ok': '确定',
  'history.placeholder': '输入命令，↑ 翻历史，Enter 发送到当前终端',
  'history.aria': '命令输入',
  'history.send': '发送',
  'history.clear': '清空历史',
  'latency.title': '连接延迟（每 15 秒测一次）',
  'latency.down': '无响应',
  'history.suggestions': '最近命令',
  'history.sendFailed': '发送失败：会话可能已断开',
  'history.multiline': '请使用单行命令',
  'batch.title': '批量执行',
  'batch.hint': '勾选已连接的 SSH 会话，填写一条命令，然后点击「执行」。按 Enter 不会发送。',
  'batch.command': '命令',
  'batch.commandPlaceholder': '例如 uname -a',
  'batch.run': '执行',
  'batch.running': '执行中…',
  'batch.selectAll': '全选',
  'batch.clearSelection': '清除选择',
  'batch.noSessions': '没有已连接的 SSH 会话。请先连上主机。',
  'batch.needSelection': '请至少选择一个会话。',
  'batch.needCommand': '请输入单行命令（不要换行）。',
  'batch.emptyResult': '尚未执行。',
  'batch.exit': '退出码 {code}',
  'batch.stdout': '标准输出',
  'batch.stderr': '标准错误',
  'batch.truncated': '输出已截断',
  'batch.ok': '成功',
  'batch.failed': '失败',
  'batch.elapsed': '{ms} ms',
  'batch.close': '关闭',
  'batch.errNotConnected': '会话不存在或未连接',
  'batch.errChild': '这是复用父连接的子终端（例如 docker exec）。请在父 SSH 会话上执行。',
  'batch.errTimeout': '超时，已取消该会话上的命令',
  'batch.errExec': '执行失败',
  'batch.errEmpty': '命令为空、包含换行，或超过长度限制。',
  'batch.errNoSessions': '没有可执行的会话。',
  'recent.title': '最近连接',
  'recent.empty': '成功连接后会出现在这里。只保存主机、用户、端口、标签和时间，不保存密码或密钥。',
  'recent.pin': '设为书签',
  'recent.unpin': '取消书签',
  'recent.remove': '移除',
  'recent.connect': '连接',
  'recent.bookmark': '书签',
  'recent.quickHint': '若已保存同主机的会话，将直接使用其中的凭据；否则打开连接表单（需重新填写密码或密钥）。'
} as const

export type MessageKey = keyof typeof zhCN

const en: Record<MessageKey, string> = {
  'menu.session': 'Session',
  'menu.edit': 'Edit',
  'menu.view': 'View',
  'menu.file': 'File',
  'menu.help': 'Help',
  'menu.newConnection': 'New connection',
  'menu.localShell': 'Local shell',
  'menu.sftp': 'File transfer',
  'menu.refreshDocker': 'Refresh Docker',
  'menu.newFolder': 'New folder',
  'menu.importSessions': 'Import sessions…',
  'menu.exportOpenssh': 'Export OpenSSH…',
  'menu.exportJson': 'Export JSON…',
  'menu.split': 'Split view',
  'menu.broadcast': 'Toggle broadcast input',
  'menu.recording': 'Start/stop recording',
  'menu.ai': 'AI settings',
  'menu.debug': 'AI debug…',
  'menu.snippets': 'Snippets',
  'menu.inventory': 'Host inventory',
  'menu.mcpGuide': 'MCP setup guide…',
  'menu.batchExec': 'Batch execute…',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',
  'menu.cut': 'Cut',
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.selectAll': 'Select all',
  'menu.toggleSidebar': 'Toggle session sidebar',
  'menu.toggleMain': 'Toggle terminal area',
  'menu.toggleAi': 'Toggle AI panel',
  'menu.uiTheme': 'UI theme',
  'menu.terminalPrefs': 'Terminal appearance',
  'menu.quit': 'Quit',
  'menu.about': 'About AI-SSH-Pro',
  'toolbar.checkUpdate': 'Check for updates (current v{version})',
  'toolbar.checkUpdatePlain': 'Check for updates',
  'toolbar.checking': 'Checking…',
  'toolbar.update': 'Update',
  'toolbar.openGithub': 'Open the GitHub repository in a browser',
  'toolbar.github': 'GitHub',
  'toolbar.toDark': 'Switch to dark mode',
  'toolbar.toLight': 'Switch to light mode',
  'toolbar.dark': 'Dark',
  'toolbar.light': 'Light',
  'toolbar.layout': 'Layout visibility',
  'toolbar.hideSidebar': 'Hide session sidebar',
  'toolbar.showSidebar': 'Show session sidebar',
  'toolbar.hideMain': 'Hide terminal area',
  'toolbar.showMain': 'Show terminal area',
  'toolbar.hideAi': 'Hide AI panel',
  'toolbar.showAi': 'Show AI panel',
  'toolbar.batch': 'Batch',
  'toolbar.batchTitle': 'Run one command on multiple connected SSH sessions',
  'toolbar.recent': 'Recent',
  'toolbar.recentTitle': 'Recent connections and bookmarks',
  'toolbar.appActions': 'App actions',
  'toolbar.localeTitle': 'Interface language: {locale}',
  'update.available': '{message}\n\nOK opens the download page so you can install the new version.',
  'update.noRelease': '{message}\n\nOpen the GitHub Releases page?',
  'update.failed': 'Update check failed: {message}\n\nOpen the GitHub repository?',
  'sidebar.saved': 'Saved sessions',
  'sidebar.searchPlaceholder': 'Search sessions / containers (name / host / user)',
  'sidebar.searchLabel': 'Search sessions or containers',
  'sidebar.empty': 'None yet',
  'tab.none': 'No session open',
  'tab.connecting': '{title} (connecting…)',
  'tab.disconnected': '{title} (disconnected)',
  'tab.close': 'Close',
  'tab.closeLabel': 'Close tab',
  'banner.connecting': 'Connecting to {target}…',
  'banner.disconnected': 'Session disconnected (connect failed, keepalive timeout, or the peer closed it).',
  'banner.reconnect': 'Reconnect',
  'banner.reconnecting': 'Reconnecting…',
  'term.connecting': 'Opening SSH connection…',
  'term.disconnected': 'Disconnected. Use Reconnect above.',
  'about.title': 'About AI-SSH-Pro',
  'about.desc': 'A multi-session SSH client with an AI assistant',
  'about.version': 'Version',
  'about.github': 'Open GitHub repository',
  'about.ok': 'OK',
  'history.placeholder': 'Command — ↑ for history, Enter sends to the current terminal',
  'history.aria': 'Command input',
  'history.send': 'Send',
  'history.clear': 'Clear history',
  'latency.title': 'Connection latency (checked every 15s)',
  'latency.down': 'No response',
  'history.suggestions': 'Recent commands',
  'history.sendFailed': 'Send failed: the session may be disconnected',
  'history.multiline': 'Use a single-line command',
  'batch.title': 'Batch execute',
  'batch.hint': 'Select connected SSH sessions, enter one command, then click Run. Enter does not send it.',
  'batch.command': 'Command',
  'batch.commandPlaceholder': 'e.g. uname -a',
  'batch.run': 'Run',
  'batch.running': 'Running…',
  'batch.selectAll': 'Select all',
  'batch.clearSelection': 'Clear selection',
  'batch.noSessions': 'No connected SSH sessions. Connect to a host first.',
  'batch.needSelection': 'Select at least one session.',
  'batch.needCommand': 'Enter a single-line command (no line breaks).',
  'batch.emptyResult': 'Nothing has been run yet.',
  'batch.exit': 'exit {code}',
  'batch.stdout': 'stdout',
  'batch.stderr': 'stderr',
  'batch.truncated': 'Output truncated',
  'batch.ok': 'OK',
  'batch.failed': 'Failed',
  'batch.elapsed': '{ms} ms',
  'batch.close': 'Close',
  'batch.errNotConnected': 'Session is missing or not connected',
  'batch.errChild': 'This tab reuses a parent connection (for example docker exec). Run the command on the parent SSH session.',
  'batch.errTimeout': 'Timed out. The command was cancelled on this session.',
  'batch.errExec': 'Execution failed',
  'batch.errEmpty': 'The command is empty, contains a newline, or is too long.',
  'batch.errNoSessions': 'There is no session to run on.',
  'recent.title': 'Recent connections',
  'recent.empty': 'Successful connections show up here. Only host, user, port, label, and time are stored — never passwords or keys.',
  'recent.pin': 'Bookmark',
  'recent.unpin': 'Remove bookmark',
  'recent.remove': 'Remove',
  'recent.connect': 'Connect',
  'recent.bookmark': 'Bookmark',
  'recent.quickHint':
    'If a saved session matches this host, its stored credentials are used. Otherwise the connection form opens and you enter a password or key again.'
}

const catalogs: Record<LocaleId, Record<MessageKey, string>> = {
  'zh-CN': zhCN,
  en
}

export function translate(
  locale: LocaleId,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const template = catalogs[locale][key] ?? catalogs['zh-CN'][key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`
  )
}

type I18nValue = {
  locale: LocaleId
  setLocale: (locale: LocaleId) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>('zh-CN')

  useEffect(() => {
    const api = window.aiss?.workspace?.locale
    if (!api) return
    let cancelled = false
    void api
      .get()
      .then((value) => {
        if (!cancelled) setLocaleState(normalizeLocale(value))
      })
      .catch(() => {
        /* keep default */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: LocaleId) => {
    const value = normalizeLocale(next)
    setLocaleState(value)
    void window.aiss?.workspace?.locale.set(value).catch(() => {
      /* preference stays in memory for this window */
    })
  }, [])

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (ctx) return ctx
  return {
    locale: 'zh-CN',
    setLocale: () => {
      /* provider missing */
    },
    t: (key, vars) => translate('zh-CN', key, vars)
  }
}
