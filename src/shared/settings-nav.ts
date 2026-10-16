/** UX-13: one settings surface. Scattered entries land on the same anchors. */

export const SETTINGS_SECTIONS = [
  'general',
  'appearance',
  'terminal',
  'connections',
  'ops',
  'ai',
  'shortcuts',
  'security',
  'files',
  'backup',
  'about'
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** Extra words so search hits 更新 / 主题 / 密钥 without matching only the nav label. */
export const SETTINGS_SEARCH_TERMS: Record<SettingsSection, readonly string[]> = {
  general: ['更新', 'update', '语言', 'language', '启动', 'startup', '布局', 'layout', 'restore'],
  appearance: ['主题', 'theme', '外观', 'appearance', '图标'],
  terminal: ['终端', 'terminal', '字体', 'font'],
  connections: ['连接', '密钥', 'key', 'agent', '保活', '重连', 'reconnect', 'keep-alive'],
  ops: ['采样', '告警', 'probe', '健康'],
  ai: ['密钥', 'key', 'api', '模型', 'model', '安全档', 'safety', '观察', '确认', '信任', '全自动'],
  shortcuts: ['快捷键', 'shortcut'],
  security: ['安全', '审计', '密钥', 'key', 'audit'],
  files: ['快照', 'snapshot', '文件'],
  backup: ['备份', '同步', 'backup', 'sync'],
  about: ['更新', 'update', '通道', 'channel', 'github', '版本', 'version', '许可证', 'license']
}

export const SETTINGS_PRIMARY: readonly SettingsSection[] = [
  'general',
  'appearance',
  'terminal',
  'connections',
  'ai',
  'shortcuts',
  'security',
  'backup',
  'about'
]

export const SETTINGS_ADVANCED: readonly SettingsSection[] = ['ops', 'files']

export function settingsSectionsForQuery(query: string, labels: Record<SettingsSection, string>): SettingsSection[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...SETTINGS_SECTIONS]
  return SETTINGS_SECTIONS.filter((id) => {
    const label = labels[id].toLowerCase()
    if (label.includes(needle) || id.includes(needle)) return true
    return SETTINGS_SEARCH_TERMS[id].some((term) => term.toLowerCase().includes(needle))
  })
}

const ACTION_SECTION: Record<string, SettingsSection> = {
  settings: 'general',
  startupSettings: 'general',
  toggleLanguage: 'general',
  uiTheme: 'appearance',
  terminalPrefs: 'terminal',
  smartComplete: 'terminal',
  ai: 'ai',
  mcpGuide: 'ai',
  shortcuts: 'shortcuts',
  updateChannel: 'about',
  checkUpdate: 'about',
  about: 'about',
  github: 'about',
  backup: 'backup',
  cloudSync: 'backup'
}

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return Boolean(value && (SETTINGS_SECTIONS as readonly string[]).includes(value))
}

/** Menu / palette action → settings anchor. Null means the action is not a settings entry. */
export function sectionForAction(action: string): SettingsSection | null {
  return ACTION_SECTION[action] ?? null
}

export const SETTINGS_SECTION_KEY = 'aiss.settings.section'

export function loadSettingsSection(store: Pick<Storage, 'getItem'> = globalThis.localStorage): SettingsSection {
  const raw = store.getItem(SETTINGS_SECTION_KEY)
  return isSettingsSection(raw) ? raw : 'general'
}

export function saveSettingsSection(section: SettingsSection, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  store.setItem(SETTINGS_SECTION_KEY, section)
}

/** Pairs that mean the same setting. They must not render as sibling rows. */
export const SETTINGS_SYNONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['keepalive', '保活'],
  ['keep-alive', '保活'],
  ['默认保活', '保活'],
  ['theme', '主题'],
  ['appearance', '外观']
]

export function settingsRowsAreSynonyms(a: string, b: string): boolean {
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (!left || !right) return false
  if (left === right) return true
  return SETTINGS_SYNONYM_PAIRS.some(([x, y]) => {
    const pair = [x.toLowerCase(), y.toLowerCase()]
    const hit = (label: string, word: string) => label.includes(word)
    return (hit(left, pair[0]!) && hit(right, pair[1]!)) || (hit(left, pair[1]!) && hit(right, pair[0]!))
  })
}

/** True when two labels in one group are the same setting said twice. */
export function settingsSynonymClash(labels: readonly string[]): boolean {
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (settingsRowsAreSynonyms(labels[i]!, labels[j]!)) return true
    }
  }
  return false
}

/**
 * P11-5: 1366×768 stays one column. Search stays. Advanced starts collapsed.
 * A narrow pane stacks the nav above the body; it does not turn sections into a sideways synonym strip.
 */
export function settingsComfortLayout(width: number, height: number): {
  singleColumn: boolean
  searchVisible: boolean
  advancedCollapsed: boolean
} {
  const w = Number.isFinite(width) ? width : 1366
  const h = Number.isFinite(height) ? height : 768
  return {
    singleColumn: w <= 1366 || h <= 768,
    searchVisible: w >= 320,
    advancedCollapsed: true
  }
}
