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
    label: '深色',
    swatch: { bg: '#0f1117', panel: '#161b22', accent: '#58a6ff', text: '#e6edf3' }
  },
  {
    id: 'slate',
    label: '石墨',
    swatch: { bg: '#1c1f26', panel: '#252a33', accent: '#7aa2f7', text: '#e8ecf1' }
  },
  {
    id: 'ocean',
    label: '海雾',
    swatch: { bg: '#0b1220', panel: '#121a2b', accent: '#38bdf8', text: '#e2e8f0' }
  },
  {
    id: 'forest',
    label: '松林',
    swatch: { bg: '#0f1410', panel: '#171e18', accent: '#3fb950', text: '#e6ede6' }
  },
  {
    id: 'light',
    label: '浅色',
    swatch: { bg: '#f4f6f8', panel: '#ffffff', accent: '#0969da', text: '#1f2328' }
  },
  {
    id: 'sand',
    label: '暖沙',
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

/** 应用到 <html data-ui-theme="…"> */
export function applyUiTheme(id: UiThemeId): void {
  const next = isUiThemeId(id) ? id : UI_THEME_DEFAULT
  document.documentElement.setAttribute('data-ui-theme', next)
  saveUiThemeId(next)
  window.dispatchEvent(new CustomEvent('aiss-ui-theme', { detail: next }))
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
