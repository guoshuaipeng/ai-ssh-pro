import Store from 'electron-store'
import type { SavedSessionProfile, AiSettings } from '../shared/ipc'

type StoreSchema = {
  savedSessions: SavedSessionProfile[]
  ai: AiSettings
}

/** 未配置过或缺字段时合并用；API Key 始终由用户在「AI 配置」中填写 */
const defaultModel = process.env.BBS_AI_AUDIT_MODEL?.trim() || 'qwen-max'

const DEFAULT_MODEL_LIST = [...new Set([defaultModel, 'qwen-max', 'qwen-turbo', 'qwen-plus'])]

export const AI_SETTINGS_DEFAULTS: AiSettings = {
  // DashScope OpenAI 兼容：需带 /v1，与主进程里 `${baseURL}/chat/completions` 拼接
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: defaultModel,
  modelList: DEFAULT_MODEL_LIST,
  apiKey: '',
  temperature: 0.1,
  sshParseInstructions: ''
}

function normalizeAi(merged: AiSettings): AiSettings {
  let modelList: string[] = []
  if (Array.isArray(merged.modelList)) {
    modelList = [...new Set(merged.modelList.map((m) => String(m).trim()).filter(Boolean))]
  }
  const fallback = defaultModel
  if (modelList.length === 0) {
    const m = merged.model?.trim() || fallback
    modelList = [m]
  }
  let model = merged.model?.trim() || ''
  if (!modelList.includes(model)) {
    model = modelList[0]!
  }
  return {
    ...merged,
    modelList,
    model
  }
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
  return normalizeAi({ ...AI_SETTINGS_DEFAULTS, ...stored })
}

export function setAiSettings(partial: Partial<AiSettings>): void {
  const cur = getAiSettings()
  const next = normalizeAi({ ...cur, ...partial })
  appStore.set('ai', next)
}
