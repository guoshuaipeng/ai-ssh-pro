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
