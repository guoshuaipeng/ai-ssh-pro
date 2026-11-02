/** Normalize terminal prefs from store / IPC (Electron + Tauri). */
import { TERMINAL_PREFS_DEFAULTS, type TerminalPrefs, type TerminalThemeId } from './ipc'
import { clampTerminalFontSize } from './terminal-zoom'

const THEMES: TerminalThemeId[] = [
  'github-dark',
  'solarized-dark',
  'monokai',
  'github-light',
  'solarized-light'
]

export function normalizeTerminalPrefs(raw: unknown): TerminalPrefs {
  const d = TERMINAL_PREFS_DEFAULTS
  if (!raw || typeof raw !== 'object') return { ...d }
  const o = raw as Record<string, unknown>
  const themeId = THEMES.includes(o.themeId as TerminalThemeId) ? (o.themeId as TerminalThemeId) : d.themeId
  const fontFamily = typeof o.fontFamily === 'string' && o.fontFamily.trim() ? o.fontFamily.trim() : d.fontFamily
  const fontSize =
    typeof o.fontSize === 'number' && Number.isFinite(o.fontSize) ? clampTerminalFontSize(o.fontSize) : d.fontSize
  const scrollback =
    typeof o.scrollback === 'number' && Number.isFinite(o.scrollback)
      ? Math.min(50000, Math.max(500, Math.floor(o.scrollback)))
      : d.scrollback
  const osc52Clipboard = typeof o.osc52Clipboard === 'boolean' ? o.osc52Clipboard : d.osc52Clipboard
  const muteBell = typeof o.muteBell === 'boolean' ? o.muteBell : d.muteBell
  const copyOnSelect = o.copyOnSelect === true
  return { themeId, fontFamily, fontSize, scrollback, osc52Clipboard, muteBell, copyOnSelect }
}
