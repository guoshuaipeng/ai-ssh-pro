import Store from 'electron-store'
import type { SavedSessionProfile, SavedSessionFolder, SavedSessionsState, AiProvider, AiSettings } from '../shared/ipc'

type StoreSchema = {
  savedSessions: SavedSessionsState
  ai: AiSettings
}

/** 未配置过或缺字段时合并用；API Key 始终由用户在「AI 配置」中填写 */
const defaultModel = process.env.BBS_AI_AUDIT_MODEL?.trim() || 'qwen-max'

const DEFAULT_MODEL_LIST = [...new Set([defaultModel, 'qwen-max', 'qwen-turbo', 'qwen-plus'])]

function normalizeModelList(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out = [...new Set(list.map((m) => String(m).trim()).filter(Boolean))]
  return out
}

export const AI_SETTINGS_DEFAULTS: AiSettings = {
  // DashScope OpenAI 兼容：需带 /v1，与主进程里 `${baseURL}/chat/completions` 拼接
  providers: [
    {
      id: 'dashscope',
      name: 'DashScope（兼容 OpenAI）',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: '',
      modelList: DEFAULT_MODEL_LIST
    }
  ],
  activeProviderId: 'dashscope',
  model: defaultModel,
  temperature: 0.1,
  sshParseInstructions: '',
  useOpenClaw: true
}

function normalizeAi(merged: AiSettings): AiSettings {
  const anyMerged = merged as unknown as Record<string, unknown>

  const legacyBaseURL = typeof anyMerged.baseURL === 'string' ? anyMerged.baseURL : undefined
  const legacyModelList = anyMerged.modelList
  const legacyApiKey = typeof anyMerged.apiKey === 'string' ? anyMerged.apiKey : ''
  const legacyModel = typeof anyMerged.model === 'string' ? anyMerged.model : defaultModel

  // Prefer new shape.
  let providers: AiProvider[] = []
  if (Array.isArray(anyMerged.providers)) {
    providers = (anyMerged.providers as unknown[]).map((p) => {
      const o = (p ?? {}) as Record<string, unknown>
      return {
        id: String(o.id ?? '').trim(),
        name: String(o.name ?? '').trim(),
        baseURL: String(o.baseURL ?? '').trim(),
        apiKey: String(o.apiKey ?? ''),
        modelList: normalizeModelList(o.modelList)
      }
    })
  }

  // Legacy migration: baseURL/modelList/apiKey -> providers[0]
  if (providers.length === 0 && legacyBaseURL) {
    const legacyList = normalizeModelList(legacyModelList)
    const modelList = legacyList.length > 0 ? legacyList : [String(legacyModel).trim() || defaultModel]
    providers = [
      {
        id: 'default',
        name: '默认 Provider',
        baseURL: legacyBaseURL,
        apiKey: legacyApiKey,
        modelList
      }
    ]
  }

  // If legacy fields exist but we still have default providers injected from defaults,
  // attempt a best-effort override for the default provider.
  if (legacyBaseURL && providers.length > 0) {
    const defaultProv = AI_SETTINGS_DEFAULTS.providers[0]
    const activeProvIdx = providers.findIndex((p) => p.id === defaultProv.id)
    if (activeProvIdx >= 0) {
      const p0 = providers[activeProvIdx]!
      const isStillDefault =
        p0.baseURL === defaultProv.baseURL &&
        // 典型情况下旧版首次升级时默认 Provider 的 apiKey 仍是空
        String(p0.apiKey ?? '') === String(defaultProv.apiKey ?? '')
      if (isStillDefault) {
        const legacyList = normalizeModelList(legacyModelList)
        const modelList = legacyList.length > 0 ? legacyList : [String(legacyModel).trim() || defaultModel]
        providers[activeProvIdx] = {
          ...p0,
          baseURL: legacyBaseURL,
          apiKey: legacyApiKey,
          modelList,
          name: '默认 Provider'
        }
      }
    }
  }

  // Final fallback
  if (providers.length === 0) {
    providers = [...AI_SETTINGS_DEFAULTS.providers]
  }

  providers = providers
    .map((p, idx) => {
      const id = p.id?.trim() || `provider_${idx}`
      const name = p.name?.trim() || p.id || `Provider ${idx + 1}`
      const baseURL = p.baseURL?.trim() || AI_SETTINGS_DEFAULTS.providers[0]?.baseURL || ''
      const apiKey = String(p.apiKey ?? '')
      const modelList = normalizeModelList(p.modelList).length
        ? normalizeModelList(p.modelList)
        : [defaultModel]
      return { id, name, baseURL, apiKey, modelList }
    })
    .filter((p) => p.baseURL && p.modelList.length > 0)

  if (providers.length === 0) {
    providers = [...AI_SETTINGS_DEFAULTS.providers]
  }

  const activeProviderId = String(anyMerged.activeProviderId ?? AI_SETTINGS_DEFAULTS.activeProviderId ?? '')
  const normalizedActiveProviderId = providers.some((p) => p.id === activeProviderId)
    ? activeProviderId
    : providers[0]!.id

  const activeProvider = providers.find((p) => p.id === normalizedActiveProviderId) ?? providers[0]!
  const fallbackModel = activeProvider.modelList[0] ?? defaultModel
  const normalizedModel = String(anyMerged.model ?? '').trim()
  const model = activeProvider.modelList.includes(normalizedModel) ? normalizedModel : fallbackModel

  const temperature =
    typeof anyMerged.temperature === 'number' && Number.isFinite(anyMerged.temperature)
      ? Math.min(2, Math.max(0, anyMerged.temperature))
      : AI_SETTINGS_DEFAULTS.temperature

  const sshParseInstructions = typeof anyMerged.sshParseInstructions === 'string' ? anyMerged.sshParseInstructions : ''
  const useOpenClaw =
    typeof anyMerged.useOpenClaw === 'boolean'
      ? anyMerged.useOpenClaw
      : (AI_SETTINGS_DEFAULTS.useOpenClaw ?? true)

  // Only return the new-shape fields to avoid keeping legacy keys around.
  return {
    providers,
    activeProviderId: normalizedActiveProviderId,
    model,
    temperature,
    sshParseInstructions,
    useOpenClaw
  }
}

function normalizeSavedSessionsRaw(raw: unknown): SavedSessionsState {
  const normalizeFolder = (x: unknown): SavedSessionFolder | null => {
    if (!x || typeof x !== 'object') return null
    const o = x as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null
    if (!id || !name) return null
    return { id, name }
  }

  const normalizeProfile = (x: unknown): SavedSessionProfile | null => {
    if (!x || typeof x !== 'object') return null
    const o = x as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
    const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : null
    const host = typeof o.host === 'string' && o.host.trim() ? o.host.trim() : null
    const username = typeof o.username === 'string' && o.username.trim() ? o.username.trim() : null
    const port = typeof o.port === 'number' && Number.isFinite(o.port) ? Math.floor(o.port) : 22
    if (!id || !label || !host || !username) return null
    const folderId = typeof o.folderId === 'string' && o.folderId.trim() ? o.folderId.trim() : undefined
    const row: SavedSessionProfile = { id, label, host, port: port > 0 ? port : 22, username }
    if (folderId) row.folderId = folderId
    if (typeof o.password === 'string' && o.password) row.password = o.password
    if (typeof o.privateKeyPath === 'string' && o.privateKeyPath.trim()) row.privateKeyPath = o.privateKeyPath.trim()
    if (typeof o.passphrase === 'string' && o.passphrase) row.passphrase = o.passphrase
    return row
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    const folders = Array.isArray(o.folders) ? (o.folders.map(normalizeFolder).filter(Boolean) as SavedSessionFolder[]) : []
    const profiles = Array.isArray(o.profiles)
      ? (o.profiles.map(normalizeProfile).filter(Boolean) as SavedSessionProfile[])
      : []
    return { folders, profiles }
  }

  if (Array.isArray(raw)) {
    const profiles = raw.map(normalizeProfile).filter(Boolean) as SavedSessionProfile[]
    return { folders: [], profiles }
  }

  return { folders: [], profiles: [] }
}

const defaults: StoreSchema = {
  savedSessions: { folders: [], profiles: [] },
  ai: { ...AI_SETTINGS_DEFAULTS }
}

export const appStore = new Store<StoreSchema>({
  name: 'ai-ssh-pro',
  defaults
})

/** 读取并（必要时）从旧版「仅数组」迁移为含分组结构 */
export function getSavedSessionsState(): SavedSessionsState {
  const raw = appStore.get('savedSessions') as unknown
  const next = normalizeSavedSessionsRaw(raw)
  if (Array.isArray(raw)) {
    appStore.set('savedSessions', next)
  }
  return next
}

export function setSavedSessionsState(state: SavedSessionsState): void {
  appStore.set('savedSessions', state)
}

export function getAiSettings(): AiSettings {
  const stored = appStore.get('ai')
  return normalizeAi({ ...AI_SETTINGS_DEFAULTS, ...stored })
}

export function setAiSettings(partial: Partial<AiSettings>): void {
  const cur = getAiSettings()
  const next = normalizeAi({ ...cur, ...partial })
  appStore.set('ai', next)
}
