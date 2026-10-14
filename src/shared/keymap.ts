/**
 * Single source of truth for keyboard shortcuts (UX-02).
 * Menus, the F1 panel and the command palette all read from here.
 *
 * scope:
 *  - 'global'      fires everywhere, including while a terminal has focus
 *  - 'nonTerminal' only when focus is NOT inside a terminal (so Ctrl+letter reaches the shell)
 *  - 'display'     handled elsewhere (xterm / Electron role); listed for the F1 panel only
 *  - 'terminalBlocks' only while a block is focused and blocks are on; not a global binding
 */
export type KeymapScope = 'global' | 'nonTerminal' | 'display' | 'terminalBlocks'
export type KeymapGroup = 'general' | 'session' | 'terminal' | 'view'

export type KeymapEntry = {
  /** action id (same ids as menu actions) */
  id: string
  keys: string
  scope: KeymapScope
  group: KeymapGroup
  /** label for the F1 panel */
  label: { zh: string; en: string }
}

export const KEYMAP: ReadonlyArray<KeymapEntry> = [
  { id: 'shortcuts', keys: 'F1', scope: 'global', group: 'general', label: { zh: '键盘快捷键', en: 'Keyboard shortcuts' } },
  { id: 'commandPalette', keys: 'Ctrl+K', scope: 'nonTerminal', group: 'general', label: { zh: '命令面板（终端外）', en: 'Command palette (outside a terminal)' } },
  { id: 'commandPaletteAlt', keys: 'Ctrl+Shift+P', scope: 'global', group: 'general', label: { zh: '命令面板', en: 'Command palette' } },
  { id: 'settings', keys: 'Ctrl+,', scope: 'global', group: 'general', label: { zh: '设置', en: 'Settings' } },
  { id: 'connection', keys: 'Ctrl+Shift+N', scope: 'global', group: 'session', label: { zh: '新建连接', en: 'New connection' } },
  { id: 'sftp', keys: 'Ctrl+Alt+F', scope: 'global', group: 'session', label: { zh: 'SFTP 文件', en: 'SFTP files' } },
  { id: 'serverTools', keys: 'Ctrl+Alt+T', scope: 'global', group: 'session', label: { zh: '服务器工具箱', en: 'Server toolbox' } },
  { id: 'resourceMonitor', keys: 'Ctrl+Shift+M', scope: 'global', group: 'session', label: { zh: '资源监控', en: 'Resource monitor' } },
  { id: 'dashboard', keys: 'Ctrl+Alt+M', scope: 'global', group: 'session', label: { zh: '多主机看板', en: 'Multi-host dashboard' } },
  { id: 'opsHome', keys: 'Ctrl+Alt+H', scope: 'global', group: 'view', label: { zh: '运维首页', en: 'Ops home' } },
  { id: 'playbooks', keys: 'Ctrl+Alt+P', scope: 'global', group: 'session', label: { zh: '运维剧本', en: 'Playbooks' } },
  { id: 'toggleRecording', keys: 'Ctrl+Alt+R', scope: 'global', group: 'session', label: { zh: '录制', en: 'Recording' } },
  { id: 'explainBlock', keys: 'Ctrl+Shift+E', scope: 'terminalBlocks', group: 'terminal', label: { zh: '解释此块', en: 'Explain this block' } },
  { id: 'alertWorkbench', keys: 'Ctrl+Alt+A', scope: 'global', group: 'session', label: { zh: '告警工作台', en: 'Alert workbench' } },
  { id: 'portForward', keys: 'Ctrl+Shift+O', scope: 'global', group: 'session', label: { zh: '端口转发', en: 'Port forwarding' } },
  { id: 'batchExec', keys: 'Ctrl+Shift+B', scope: 'global', group: 'session', label: { zh: '批量执行', en: 'Batch run' } },
  { id: 'snippets', keys: 'Ctrl+Shift+S', scope: 'global', group: 'session', label: { zh: '命令片段', en: 'Snippets' } },
  { id: 'inventory', keys: 'Ctrl+Shift+H', scope: 'global', group: 'session', label: { zh: '主机档案', en: 'Host inventory' } },
  { id: 'find', keys: 'Ctrl+Shift+F', scope: 'global', group: 'terminal', label: { zh: '终端内查找', en: 'Find in terminal' } },
  { id: 'aiCommand', keys: 'Ctrl+Shift+Space', scope: 'global', group: 'terminal', label: { zh: 'AI 模式：用自然语言生成命令', en: 'AI mode: natural language → command' } },
  { id: 'copy', keys: 'Ctrl+Shift+C', scope: 'display', group: 'terminal', label: { zh: '复制', en: 'Copy' } },
  { id: 'paste', keys: 'Ctrl+Shift+V', scope: 'display', group: 'terminal', label: { zh: '粘贴', en: 'Paste' } },
  { id: 'pasteAlt', keys: 'Shift+Insert', scope: 'display', group: 'terminal', label: { zh: '粘贴（备选）', en: 'Paste (alternative)' } },
  { id: 'toggleSidebar', keys: 'Ctrl+Alt+1', scope: 'global', group: 'view', label: { zh: '显示/隐藏会话栏', en: 'Show/hide session sidebar' } },
  { id: 'toggleAi', keys: 'Ctrl+Alt+B', scope: 'global', group: 'view', label: { zh: '显示/隐藏 AI 面板', en: 'Show/hide AI panel' } },
  { id: 'nextTab', keys: 'Ctrl+Tab', scope: 'display', group: 'view', label: { zh: '下一个标签', en: 'Next tab' } },
  { id: 'gotoTab', keys: 'Ctrl+1…9', scope: 'display', group: 'view', label: { zh: '切换到第 N 个标签（9 = 最后一个）', en: 'Go to tab N (9 = last)' } },
  { id: 'toggleBroadcast', keys: 'Ctrl+Alt+I', scope: 'global', group: 'session', label: { zh: '广播输入开/关', en: 'Toggle broadcast input' } }
]

/** Actions that open the palette (both key combos map to the same action). */
export const KEYMAP_ACTION_ALIAS: Readonly<Record<string, string>> = {
  commandPaletteAlt: 'commandPalette'
}

export function keysFor(id: string): string | undefined {
  return KEYMAP.find((k) => k.id === id || KEYMAP_ACTION_ALIAS[k.id] === id)?.keys
}

type KeyLike = { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }

function parseCombo(keys: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = keys.split('+')
  const key = parts[parts.length - 1]!
  return { ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt'), key }
}

function eventKeyName(e: KeyLike): string {
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3)
  if (e.code && /^Digit[0-9]$/.test(e.code)) return e.code.slice(5)
  if (e.code === 'Comma') return ','
  if (e.code === 'Space' || e.key === ' ') return 'Space'
  if (e.key.length === 1) return e.key.toUpperCase()
  return e.key
}

/** Returns the action id for a keyboard event, honouring terminal focus (UX-01). */
export function matchKeymap(e: KeyLike, inTerminal: boolean): string | undefined {
  if (e.metaKey) return undefined
  const name = eventKeyName(e)
  for (const k of KEYMAP) {
    if (k.scope === 'display' || k.scope === 'terminalBlocks') continue
    if (k.scope === 'nonTerminal' && inTerminal) continue
    const c = parseCombo(k.keys)
    if (c.ctrl !== e.ctrlKey || c.shift !== e.shiftKey || c.alt !== e.altKey) continue
    if (c.key.toUpperCase() !== name.toUpperCase()) continue
    return KEYMAP_ACTION_ALIAS[k.id] ?? k.id
  }
  return undefined
}

/** Plain Ctrl+letter (no Shift/Alt) must always reach the shell while a terminal has focus. */
export function isShellReservedKey(e: KeyLike): boolean {
  return e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && /^Key[A-Z]$/.test(e.code ?? '')
}
