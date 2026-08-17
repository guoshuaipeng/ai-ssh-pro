import type { ITheme } from '@xterm/xterm'
import type { TerminalThemeId } from '@shared/ipc'

const githubDark: ITheme = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#e6edf3',
  cursorAccent: '#0d1117',
  selectionBackground: '#264f78',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc'
}

const solarizedDark: ITheme = {
  background: '#002b36',
  foreground: '#839496',
  cursor: '#839496',
  cursorAccent: '#002b36',
  selectionBackground: '#073642',
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#002b36',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3'
}

const monokai: ITheme = {
  background: '#272822',
  foreground: '#f8f8f2',
  cursor: '#f8f8f0',
  cursorAccent: '#272822',
  selectionBackground: '#49483e',
  black: '#272822',
  red: '#f92672',
  green: '#a6e22e',
  yellow: '#f4bf75',
  blue: '#66d9ef',
  magenta: '#ae81ff',
  cyan: '#a1efe4',
  white: '#f8f8f2',
  brightBlack: '#75715e',
  brightRed: '#f92672',
  brightGreen: '#a6e22e',
  brightYellow: '#f4bf75',
  brightBlue: '#66d9ef',
  brightMagenta: '#ae81ff',
  brightCyan: '#a1efe4',
  brightWhite: '#f9f8f5'
}

const THEMES: Record<TerminalThemeId, ITheme> = {
  'github-dark': githubDark,
  'solarized-dark': solarizedDark,
  monokai
}

export function getXtermTheme(themeId: TerminalThemeId): ITheme {
  return THEMES[themeId] ?? THEMES['github-dark']
}

export const TERMINAL_THEME_OPTIONS: { id: TerminalThemeId; label: string }[] = [
  { id: 'github-dark', label: 'GitHub Dark' },
  { id: 'solarized-dark', label: 'Solarized Dark' },
  { id: 'monokai', label: 'Monokai' }
]
