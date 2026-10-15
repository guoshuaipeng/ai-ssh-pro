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
  general: ['更新', 'update', '语言', 'language', '启动', 'startup'],
  appearance: ['主题', 'theme', '外观', 'appearance', '图标'],
  terminal: ['终端', 'terminal', '字体', 'font'],
  connections: ['连接', '密钥', 'key', 'agent', '保活', '重连', 'reconnect', 'keep-alive'],
  ops: ['采样', '告警', 'probe', '健康'],
  ai: ['密钥', 'key', 'api', '模型', 'model'],
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
