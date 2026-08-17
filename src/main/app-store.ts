import Store from 'electron-store'
import type {
  SavedSessionProfile,
  SavedSessionFolder,
  SavedSessionsState,
  AiProvider,
  AiSettings,
  TerminalPrefs,
  CommandSnippet,
  AiChatMessage,
  SshJumpHostOptions,
  LocalPortForward
} from '../shared/ipc'
import { TERMINAL_PREFS_DEFAULTS } from '../shared/ipc'
import { decryptOptional, encryptOptional, encryptSecret, decryptSecret, isEncryptedSecret } from './secret-crypto'

type AiChatHistoryStore = Record<string, AiChatMessage[]>

type StoreSchema = {
  savedSessions: SavedSessionsState
  ai: AiSettings
  terminalPrefs: TerminalPrefs
  snippets: CommandSnippet[]
  aiChatHistory: AiChatHistoryStore
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
  useOpenClaw: true,
  autoApproveLowRisk: false
}

function encryptJump(j: SshJumpHostOptions | undefined): SshJumpHostOptions | undefined {
  if (!j) return undefined
  const out: SshJumpHostOptions = {
    host: j.host,
    port: j.port,
    username: j.username,
    privateKeyPath: j.privateKeyPath
  }
  if (j.password) out.password = encryptOptional(j.password)
  if (j.passphrase) out.passphrase = encryptOptional(j.passphrase)
  return out
}

function decryptJump(j: SshJumpHostOptions | undefined): SshJumpHostOptions | undefined {
  if (!j) return undefined
  const out: SshJumpHostOptions = { ...j }
  try {
    if (out.password) out.password = decryptOptional(out.password)
    if (out.passphrase) out.passphrase = decryptOptional(out.passphrase)
  } catch (e) {
    console.error('[app-store] failed to decrypt jump secrets:', e)
    delete out.password
    delete out.passphrase
  }
  return out
}

function encryptProfileSecrets(profile: SavedSessionProfile): SavedSessionProfile {
  const row: SavedSessionProfile = { ...profile }
  if (row.password) row.password = encryptOptional(row.password)
  if (row.passphrase) row.passphrase = encryptOptional(row.passphrase)
  if (row.jumpHost) row.jumpHost = encryptJump(row.jumpHost)
  return row
}

function decryptProfileSecrets(profile: SavedSessionProfile): SavedSessionProfile {
  const row: SavedSessionProfile = { ...profile }
  try {
    if (row.password) row.password = decryptOptional(row.password)
    if (row.passphrase) row.passphrase = decryptOptional(row.passphrase)
  } catch (e) {
    console.error('[app-store] failed to decrypt session secrets:', e)
    delete row.password
    delete row.passphrase
  }
  if (row.jumpHost) row.jumpHost = decryptJump(row.jumpHost)
  return row
}

function encryptAiSettings(settings: AiSettings): AiSettings {
  return {
    ...settings,
    providers: settings.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? encryptSecret(p.apiKey) : ''
    }))
  }
}

function decryptAiSettings(settings: AiSettings): AiSettings {
  return {
    ...settings,
    providers: settings.providers.map((p) => {
      try {
        return { ...p, apiKey: p.apiKey ? decryptSecret(p.apiKey) : '' }
      } catch (e) {
        console.error('[app-store] failed to decrypt apiKey for provider', p.id, e)
        return { ...p, apiKey: '' }
      }
    })
  }
}

function normalizeForwards(raw: unknown): LocalPortForward[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: LocalPortForward[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const localPort = typeof o.localPort === 'number' ? Math.floor(o.localPort) : NaN
    const remotePort = typeof o.remotePort === 'number' ? Math.floor(o.remotePort) : NaN
    const remoteHost = typeof o.remoteHost === 'string' ? o.remoteHost.trim() : ''
    if (!remoteHost || !(localPort > 0 && localPort < 65536) || !(remotePort > 0 && remotePort < 65536)) continue
    out.push({ localPort, remoteHost, remotePort })
  }
  return out.length ? out : undefined
}

function normalizeJump(raw: unknown): SshJumpHostOptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const host = typeof o.host === 'string' ? o.host.trim() : ''
  const username = typeof o.username === 'string' ? o.username.trim() : ''
  if (!host || !username) return undefined
  const port = typeof o.port === 'number' && Number.isFinite(o.port) ? Math.floor(o.port) : 22
  const jump: SshJumpHostOptions = { host, port: port > 0 ? port : 22, username }
  if (typeof o.password === 'string' && o.password) jump.password = o.password
  if (typeof o.privateKeyPath === 'string' && o.privateKeyPath.trim()) jump.privateKeyPath = o.privateKeyPath.trim()
  if (typeof o.passphrase === 'string' && o.passphrase) jump.passphrase = o.passphrase
  return jump
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

  if (legacyBaseURL && providers.length > 0) {
    const defaultProv = AI_SETTINGS_DEFAULTS.providers[0]
    const activeProvIdx = providers.findIndex((p) => p.id === defaultProv.id)
    if (activeProvIdx >= 0) {
      const p0 = providers[activeProvIdx]!
      const isStillDefault =
        p0.baseURL === defaultProv.baseURL &&
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
  const autoApproveLowRisk =
    typeof anyMerged.autoApproveLowRisk === 'boolean'
      ? anyMerged.autoApproveLowRisk
      : (AI_SETTINGS_DEFAULTS.autoApproveLowRisk ?? false)

  return {
    providers,
    activeProviderId: normalizedActiveProviderId,
    model,
    temperature,
    sshParseInstructions,
    useOpenClaw,
    autoApproveLowRisk
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
    const jump = normalizeJump(o.jumpHost)
    if (jump) row.jumpHost = jump
    const forwards = normalizeForwards(o.forwards)
    if (forwards) row.forwards = forwards
    if (typeof o.hostInventoryId === 'string' && o.hostInventoryId.trim()) {
      row.hostInventoryId = o.hostInventoryId.trim()
    }
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

function normalizeTerminalPrefs(raw: unknown): TerminalPrefs {
  const d = TERMINAL_PREFS_DEFAULTS
  if (!raw || typeof raw !== 'object') return { ...d }
  const o = raw as Record<string, unknown>
  const themeId =
    o.themeId === 'github-dark' || o.themeId === 'solarized-dark' || o.themeId === 'monokai'
      ? o.themeId
      : d.themeId
  const fontFamily = typeof o.fontFamily === 'string' && o.fontFamily.trim() ? o.fontFamily.trim() : d.fontFamily
  const fontSize =
    typeof o.fontSize === 'number' && Number.isFinite(o.fontSize)
      ? Math.min(32, Math.max(10, Math.floor(o.fontSize)))
      : d.fontSize
  const scrollback =
    typeof o.scrollback === 'number' && Number.isFinite(o.scrollback)
      ? Math.min(50000, Math.max(500, Math.floor(o.scrollback)))
      : d.scrollback
  return { themeId, fontFamily, fontSize, scrollback }
}

function normalizeSnippets(raw: unknown): CommandSnippet[] {
  if (!Array.isArray(raw)) return []
  const out: CommandSnippet[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
    const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null
    const body = typeof o.body === 'string' ? o.body : null
    if (!id || !title || body == null) continue
    out.push({ id, title, body })
  }
  return out
}

const defaults: StoreSchema = {
  savedSessions: { folders: [], profiles: [] },
  ai: { ...AI_SETTINGS_DEFAULTS },
  terminalPrefs: { ...TERMINAL_PREFS_DEFAULTS },
  snippets: [],
  aiChatHistory: {}
}

export const appStore = new Store<StoreSchema>({
  name: 'ai-ssh-pro',
  defaults
})

/** 读取并（必要时）从旧版「仅数组」迁移为含分组结构；解密敏感字段供 UI 使用 */
export function getSavedSessionsState(): SavedSessionsState {
  const raw = appStore.get('savedSessions') as unknown
  const next = normalizeSavedSessionsRaw(raw)
  if (Array.isArray(raw)) {
    appStore.set('savedSessions', {
      folders: next.folders,
      profiles: next.profiles.map(encryptProfileSecrets)
    })
  }
  return {
    folders: next.folders,
    profiles: next.profiles.map(decryptProfileSecrets)
  }
}

export function setSavedSessionsState(state: SavedSessionsState): void {
  appStore.set('savedSessions', {
    folders: state.folders,
    profiles: state.profiles.map(encryptProfileSecrets)
  })
}

export function getAiSettings(): AiSettings {
  const stored = appStore.get('ai')
  const normalized = normalizeAi({ ...AI_SETTINGS_DEFAULTS, ...stored })
  return decryptAiSettings(normalized)
}

export function setAiSettings(partial: Partial<AiSettings>): void {
  const cur = getAiSettings()
  const next = normalizeAi({ ...cur, ...partial })
  appStore.set('ai', encryptAiSettings(next))
}

export function getTerminalPrefs(): TerminalPrefs {
  return normalizeTerminalPrefs(appStore.get('terminalPrefs'))
}

export function setTerminalPrefs(partial: Partial<TerminalPrefs>): TerminalPrefs {
  const next = normalizeTerminalPrefs({ ...getTerminalPrefs(), ...partial })
  appStore.set('terminalPrefs', next)
  return next
}

export function getSnippets(): CommandSnippet[] {
  return normalizeSnippets(appStore.get('snippets'))
}

export function setSnippets(list: CommandSnippet[]): void {
  appStore.set('snippets', normalizeSnippets(list))
}

export function getAiChatHistory(key: string): AiChatMessage[] {
  const k = key.trim()
  if (!k) return []
  const all = appStore.get('aiChatHistory') ?? {}
  const rows = all[k]
  if (!Array.isArray(rows)) return []
  return rows
    .filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '') }))
    .slice(-200)
}

export function setAiChatHistory(key: string, messages: AiChatMessage[]): void {
  const k = key.trim()
  if (!k) return
  const all = { ...(appStore.get('aiChatHistory') ?? {}) }
  const cleaned = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 20000) }))
    .slice(-200)
  if (cleaned.length === 0) delete all[k]
  else all[k] = cleaned
  appStore.set('aiChatHistory', all)
}

/** 一次性把磁盘上的明文密码 / API Key 升级为加密存储（启动时调用） */
export function migratePlaintextSecretsToEncrypted(): void {
  try {
    const rawSessions = normalizeSavedSessionsRaw(appStore.get('savedSessions') as unknown)
    let sessionsDirty = false
    const encryptedProfiles = rawSessions.profiles.map((p) => {
      const needs =
        (p.password && !isEncryptedSecret(p.password)) ||
        (p.passphrase && !isEncryptedSecret(p.passphrase)) ||
        (p.jumpHost?.password && !isEncryptedSecret(p.jumpHost.password)) ||
        (p.jumpHost?.passphrase && !isEncryptedSecret(p.jumpHost.passphrase))
      if (needs) sessionsDirty = true
      return encryptProfileSecrets(decryptProfileSecrets(p))
    })
    if (sessionsDirty) {
      appStore.set('savedSessions', { folders: rawSessions.folders, profiles: encryptedProfiles })
    }

    const rawAi = normalizeAi({ ...AI_SETTINGS_DEFAULTS, ...appStore.get('ai') })
    const needsAi = rawAi.providers.some((p) => p.apiKey && !isEncryptedSecret(p.apiKey))
    if (needsAi) {
      appStore.set('ai', encryptAiSettings(decryptAiSettings(rawAi)))
    }
  } catch (e) {
    console.error('[app-store] migratePlaintextSecretsToEncrypted failed:', e)
  }
}
