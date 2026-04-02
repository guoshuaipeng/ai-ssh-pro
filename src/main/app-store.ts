import Store from 'electron-store'
import type { SavedSessionProfile, AiSettings } from '../shared/ipc'

type StoreSchema = {
  savedSessions: SavedSessionProfile[]
  ai: AiSettings
}

export const AI_SETTINGS_DEFAULTS: AiSettings = {
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  temperature: 0.4,
  sshParseInstructions: ''
}

const defaults: StoreSchema = {
  savedSessions: [],
  ai: { ...AI_SETTINGS_DEFAULTS }
}

export const appStore = new Store<StoreSchema>({
  name: 'ai-ssh-pro',
  defaults
})

export function getAiSettings(): AiSettings {
  const stored = appStore.get('ai')
  return { ...AI_SETTINGS_DEFAULTS, ...stored }
}

export function setAiSettings(partial: Partial<AiSettings>): void {
  const cur = getAiSettings()
  appStore.set('ai', { ...cur, ...partial })
}
