import Store from 'electron-store'
import type { SavedSessionProfile, AiSettings } from '../shared/ipc'

type StoreSchema = {
  savedSessions: SavedSessionProfile[]
  ai: AiSettings
}

const defaults: StoreSchema = {
  savedSessions: [],
  ai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: ''
  }
}

export const appStore = new Store<StoreSchema>({
  name: 'ai-ssh-pro',
  defaults
})

export function getAiSettings(): AiSettings {
  return { ...appStore.get('ai') }
}

export function setAiSettings(partial: Partial<AiSettings>): void {
  const cur = appStore.get('ai')
  appStore.set('ai', { ...cur, ...partial })
}
