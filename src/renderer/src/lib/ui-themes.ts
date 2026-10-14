import { tg } from './i18n'

export type UiThemeId =
  | 'github-dark'
  | 'slate'
  | 'ocean'
  | 'forest'
  | 'light'
  | 'sand'

export type UiThemeDef = {
  id: UiThemeId
  label: string
  /** 选择器上的色块预览 */
  swatch: { bg: string; panel: string; accent: string; text: string }
}

export const UI_THEME_OPTIONS: UiThemeDef[] = [
  {
    id: 'github-dark',
    get label() { return tg('ui.283') },
    swatch: { bg: '#0f1117', panel: '#161b22', accent: '#58a6ff', text: '#e6edf3' }
  },
  {
    id: 'slate',
    get label() { return tg('ui.284') },
    swatch: { bg: '#1c1f26', panel: '#252a33', accent: '#7aa2f7', text: '#e8ecf1' }
  },
  {
    id: 'ocean',
    get label() { return tg('ui.285') },
    swatch: { bg: '#0b1220', panel: '#121a2b', accent: '#38bdf8', text: '#e2e8f0' }
  },
  {
    id: 'forest',
    get label() { return tg('ui.286') },
    swatch: { bg: '#0f1410', panel: '#171e18', accent: '#3fb950', text: '#e6ede6' }
  },
  {
    id: 'light',
    get label() { return tg('ui.287') },
    swatch: { bg: '#f4f6f8', panel: '#ffffff', accent: '#0969da', text: '#1f2328' }
  },
  {
    id: 'sand',
    get label() { return tg('ui.288') },
    swatch: { bg: '#f3eee6', panel: '#faf7f2', accent: '#b45309', text: '#292524' }
  }
]

const KEY = 'aiss-ui-theme-v1'
export const UI_THEME_DEFAULT: UiThemeId = 'github-dark'

export function isUiThemeId(v: unknown): v is UiThemeId {
  return typeof v === 'string' && UI_THEME_OPTIONS.some((t) => t.id === v)
}

export function loadUiThemeId(): UiThemeId {
  try {
    const raw = localStorage.getItem(KEY)
    if (isUiThemeId(raw)) return raw
  } catch {
    /* ignore */
  }
  return UI_THEME_DEFAULT
}

export function saveUiThemeId(id: UiThemeId): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* ignore */
  }
}

export type UiChromeColors = {
  /** BrowserWindow 背景 */
  backgroundColor: string
  /** Windows titleBarOverlay 底色 */
  overlayColor: string
  /** 窗控按钮符号色 */
  symbolColor: string
}

const UI_CHROME: Record<UiThemeId, UiChromeColors> = {
  'github-dark': { backgroundColor: '#0f1117', overlayColor: '#161b22', symbolColor: '#e6edf3' },
  slate: { backgroundColor: '#1c1f26', overlayColor: '#252a33', symbolColor: '#e8ecf1' },
  ocean: { backgroundColor: '#0b1220', overlayColor: '#121a2b', symbolColor: '#e2e8f0' },
  forest: { backgroundColor: '#0f1410', overlayColor: '#171e18', symbolColor: '#e6ede6' },
  light: { backgroundColor: '#f4f6f8', overlayColor: '#ffffff', symbolColor: '#1f2328' },
  sand: { backgroundColor: '#f3eee6', overlayColor: '#faf7f2', symbolColor: '#292524' }
}

export function getUiChromeColors(id: UiThemeId): UiChromeColors {
  return UI_CHROME[isUiThemeId(id) ? id : UI_THEME_DEFAULT]
}

/** 应用到 <html data-ui-theme="…">，并同步 Windows 窗控底色 */
export function applyUiTheme(id: UiThemeId): void {
  const next = isUiThemeId(id) ? id : UI_THEME_DEFAULT
  document.documentElement.setAttribute('data-ui-theme', next)
  saveUiThemeId(next)
  window.dispatchEvent(new CustomEvent('aiss-ui-theme', { detail: next }))
  // 窗控 overlay 在主进程，切主题时必须跟着改，否则浅色下右上角仍是黑底
  const chrome = getUiChromeColors(next)
  const sync = window.aiss?.app?.setUiChrome
  if (typeof sync === 'function') {
    void sync(chrome).catch(() => {
      /* ignore */
    })
  }
}

export function isLightUiTheme(id: UiThemeId): boolean {
  return id === 'light' || id === 'sand'
}

/** 在浅色 / 深色之间切换（浅色 ↔ 默认深色） */
export function toggleLightDarkTheme(current: UiThemeId = loadUiThemeId()): UiThemeId {
  const next: UiThemeId = isLightUiTheme(current) ? 'github-dark' : 'light'
  applyUiTheme(next)
  return next
}
