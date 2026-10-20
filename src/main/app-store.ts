import { normalizeTags } from '../shared/workspace-features'
import { pushArchive, type AiArchivedConversation, type AiArchiveSummary } from '../shared/ai-conversation'
import { DEFAULT_AI_POLICY, migrateAiPolicy, policyTier } from '../shared/ai-policy'
import { normalizeAiMaxSteps } from '../shared/ai-run-control'
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
import { clampTerminalFontSize } from '../shared/terminal-zoom'
import { normalizeSnippetHotkey } from '../shared/snippet-hotkey'
import { normalizeAiChatHistory, serializeAiChatHistory } from '../shared/ai-chat-history'
import type { LocaleId, RecentConnection, RecentConnectionInput } from '../shared/workspace-features'
import {
  mergeRecentConnection,
  normalizeHistory,
  normalizeLocale,
  normalizeRecentList,
  pushCommandHistory as rememberCommand,
  removeRecent,
  setRecentPinned
} from '../shared/workspace-features'
import { decryptOptional, encryptOptional, encryptSecret, decryptSecret, isEncryptedSecret } from './secret-crypto'
import { archiveAndClearThreadContext } from './core-a-memory'
import { normalizeAllowHosts, normalizeTierMap } from '../shared/safety-tier'

type AiChatHistoryStore = Record<string, AiChatMessage[]>

type StoreSchema = {
  savedSessions: SavedSessionsState
  ai: AiSettings
  terminalPrefs: TerminalPrefs
  snippets: CommandSnippet[]
  aiChatHistory: AiChatHistoryStore
  /** M23: conversations archived by 新对话, newest first, capped per host. */
  aiChatArchive: AiArchivedConversation[]
  /** Newest first, capped. Commands the user chose to run; local only. */
  commandHistory: string[]
  /** Successful connects without passwords, key paths, or passphrases. */
  recentConnections: RecentConnection[]
  /** UI language. Default zh-CN. */
  locale: LocaleId
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
      name: 'DashScope (OpenAI-compatible)',
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
  autoApproveLowRisk: false,
  safetyTier: 'confirm',
  aiPolicy: 'ask'
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

function encryptChain(chain: SavedSessionProfile['jumpChain']): SavedSessionProfile['jumpChain'] {
  if (!chain?.length) return chain
  return chain.map((hop) => ({
    ...hop,
    password: hop.password ? encryptOptional(hop.password) : hop.password,
    passphrase: hop.passphrase ? encryptOptional(hop.passphrase) : hop.passphrase
  }))
}

function decryptChain(chain: SavedSessionProfile['jumpChain']): SavedSessionProfile['jumpChain'] {
  if (!chain?.length) return chain
  return chain.map((hop) => {
    const next = { ...hop }
    try {
      if (next.password) next.password = decryptOptional(next.password)
      if (next.passphrase) next.passphrase = decryptOptional(next.passphrase)
    } catch (e) {
      console.error('[app-store] failed to decrypt jump chain secrets:', e)
      delete next.password
      delete next.passphrase
    }
    return next
  })
}

function encryptProfileSecrets(profile: SavedSessionProfile): SavedSessionProfile {
  const row: SavedSessionProfile = { ...profile }
  if (row.password) row.password = encryptOptional(row.password)
  if (row.passphrase) row.passphrase = encryptOptional(row.passphrase)
  if (row.jumpHost) row.jumpHost = encryptJump(row.jumpHost)
  if (row.jumpChain) row.jumpChain = encryptChain(row.jumpChain)
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
  if (row.jumpChain) row.jumpChain = decryptChain(row.jumpChain)
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
        name: 'Default provider',
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
          name: 'Default provider'
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
  // UX-64: the old low-risk switch stays off. The safety tier is the policy that can skip Agree.
  const autoApproveLowRisk = false
  const safetyTierHosts = normalizeTierMap(anyMerged.safetyTierHosts)
  const safetyTierSessions = normalizeTierMap(anyMerged.safetyTierSessions)
  const autopilotAllowHosts = normalizeAllowHosts(anyMerged.autopilotAllowHosts)
  const autopilotAllowHighRisk = anyMerged.autopilotAllowHighRisk === true
  // M21: three policies. Old tiers migrate (observe→suggest, confirm/trusted→ask, autopilot→auto);
  // safetyTier is kept as a mirror so older readers and the gate keep working.
  const aiPolicy = migrateAiPolicy(anyMerged.aiPolicy) ?? migrateAiPolicy(anyMerged.safetyTier) ?? DEFAULT_AI_POLICY
  const aiAutoHighRisk =
    typeof anyMerged.aiAutoHighRisk === 'boolean'
      ? anyMerged.aiAutoHighRisk
      : anyMerged.aiPolicy === undefined && anyMerged.safetyTier === 'autopilot' && autopilotAllowHighRisk

  const aiMaxSteps = normalizeAiMaxSteps(anyMerged.aiMaxSteps)

  return {
    providers,
    activeProviderId: normalizedActiveProviderId,
    model,
    temperature,
    sshParseInstructions,
    useOpenClaw,
    autoApproveLowRisk,
    safetyTier: policyTier(aiPolicy),
    aiPolicy,
    ...(aiAutoHighRisk ? { aiAutoHighRisk } : {}),
    ...(aiMaxSteps != null ? { aiMaxSteps } : {}),
    ...(safetyTierHosts ? { safetyTierHosts } : {}),
    ...(safetyTierSessions ? { safetyTierSessions } : {}),
    ...(autopilotAllowHosts ? { autopilotAllowHosts } : {}),
    ...(autopilotAllowHighRisk ? { autopilotAllowHighRisk } : {})
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
    if (o.demo === true) row.demo = true
    if (typeof o.hostInventoryId === 'string' && o.hostInventoryId.trim()) {
      row.hostInventoryId = o.hostInventoryId.trim()
    }
    const tags = normalizeTags(o.tags)
    if (Array.isArray(o.tags) && tags.length) row.tags = tags
    if (o.protection === 'normal' || o.protection === 'production' || o.protection === 'readonly') row.protection = o.protection
    const aiPolicy = migrateAiPolicy(o.aiPolicy)
    if (aiPolicy) row.aiPolicy = aiPolicy
    if (o.authMode === 'password' || o.authMode === 'key' || o.authMode === 'agent') row.authMode = o.authMode
    if (typeof o.certificatePath === 'string' && o.certificatePath.trim()) row.certificatePath = o.certificatePath.trim()
    if (o.autoRecord === true) row.autoRecord = true
    if (Array.isArray(o.jumpChain)) {
      const hops = o.jumpChain
        .map((rawHop) => {
          if (!rawHop || typeof rawHop !== 'object') return null
          const h = rawHop as Record<string, unknown>
          const hostName = typeof h.host === 'string' ? h.host.trim() : ''
          const userName = typeof h.username === 'string' ? h.username.trim() : ''
          if (!hostName || !userName) return null
          const portN = typeof h.port === 'number' && h.port > 0 ? Math.floor(h.port) : 22
          const auth = h.auth === 'agent' || h.auth === 'password' || h.auth === 'key' ? h.auth : undefined
          const hop: import('../shared/jump-chain').JumpHop = {
            id: typeof h.id === 'string' && h.id ? h.id : `hop-${hostName}`,
            profileId: typeof h.profileId === 'string' ? h.profileId : undefined,
            label: typeof h.label === 'string' ? h.label : undefined,
            host: hostName,
            port: portN,
            username: userName,
            password: typeof h.password === 'string' ? h.password : undefined,
            privateKeyPath: typeof h.privateKeyPath === 'string' ? h.privateKeyPath : undefined,
            passphrase: typeof h.passphrase === 'string' ? h.passphrase : undefined,
            auth
          }
          return hop
        })
        .filter((h): h is NonNullable<typeof h> => Boolean(h))
        .slice(0, 5)
      if (hops.length) row.jumpChain = hops
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
    o.themeId === 'github-dark' ||
    o.themeId === 'solarized-dark' ||
    o.themeId === 'monokai' ||
    o.themeId === 'github-light' ||
    o.themeId === 'solarized-light'
      ? o.themeId
      : d.themeId
  const fontFamily = typeof o.fontFamily === 'string' && o.fontFamily.trim() ? o.fontFamily.trim() : d.fontFamily
  const fontSize =
    typeof o.fontSize === 'number' && Number.isFinite(o.fontSize)
      ? clampTerminalFontSize(o.fontSize)
      : d.fontSize
  const scrollback =
    typeof o.scrollback === 'number' && Number.isFinite(o.scrollback)
      ? Math.min(50000, Math.max(500, Math.floor(o.scrollback)))
      : d.scrollback
  const osc52Clipboard = typeof o.osc52Clipboard === 'boolean' ? o.osc52Clipboard : d.osc52Clipboard
  const muteBell = typeof o.muteBell === 'boolean' ? o.muteBell : d.muteBell
  return { themeId, fontFamily, fontSize, scrollback, osc52Clipboard, muteBell }
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
    if (id.startsWith('builtin:snip:')) continue
    const row: CommandSnippet = { id, title, body }
    if (typeof o.hotkey === 'string' && o.hotkey.trim()) {
      const hk = normalizeSnippetHotkey(o.hotkey)
      if (hk) row.hotkey = hk
    }
    out.push(row)
  }
  return out
}

const defaults: StoreSchema = {
  savedSessions: { folders: [], profiles: [] },
  ai: { ...AI_SETTINGS_DEFAULTS },
  terminalPrefs: { ...TERMINAL_PREFS_DEFAULTS },
  snippets: [],
  aiChatHistory: {},
  aiChatArchive: [],
  commandHistory: [],
  recentConnections: [],
  locale: 'zh-CN'
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
  return normalizeAiChatHistory(all[k])
}

export function setAiChatHistory(key: string, messages: AiChatMessage[]): void {
  const k = key.trim()
  if (!k) return
  const all = { ...(appStore.get('aiChatHistory') ?? {}) }
  const cleaned = serializeAiChatHistory(messages)
  if (cleaned.length === 0) {
    delete all[k]
    archiveAndClearThreadContext(k)
  } else all[k] = cleaned
  appStore.set('aiChatHistory', all)
}

/** M23: list archived conversations without their messages. */
export function listAiChatArchive(): AiArchiveSummary[] {
  const all = appStore.get('aiChatArchive') ?? []
  return (Array.isArray(all) ? all : []).map(({ messages, ...rest }) => ({ ...rest, count: Array.isArray(messages) ? messages.length : 0 }))
}

export function addAiChatArchive(entry: AiArchivedConversation): void {
  if (!entry || typeof entry.id !== 'string' || typeof entry.group !== 'string') return
  const messages = serializeAiChatHistory(Array.isArray(entry.messages) ? entry.messages : [])
  if (messages.length === 0) return
  const row: AiArchivedConversation = {
    id: entry.id,
    group: entry.group,
    hostLabel: String(entry.hostLabel ?? entry.group),
    key: String(entry.key ?? entry.group),
    title: String(entry.title ?? '').slice(0, 80),
    savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : Date.now(),
    messages
  }
  const all = appStore.get('aiChatArchive') ?? []
  appStore.set('aiChatArchive', pushArchive(Array.isArray(all) ? all : [], row))
}

/** Remove an archived conversation and hand back its messages (restore). */
export function takeAiChatArchive(id: string): AiChatMessage[] {
  const all = appStore.get('aiChatArchive') ?? []
  const list = Array.isArray(all) ? all : []
  const hit = list.find((e) => e.id === id)
  if (!hit) return []
  appStore.set('aiChatArchive', list.filter((e) => e.id !== id))
  return normalizeAiChatHistory(hit.messages)
}

export function getCommandHistory(): string[] {
  return normalizeHistory(appStore.get('commandHistory'))
}

export function setCommandHistory(list: string[]): string[] {
  const next = normalizeHistory(list)
  appStore.set('commandHistory', next)
  return next
}

export function pushCommandHistory(command: string): string[] {
  const next = rememberCommand(getCommandHistory(), command)
  appStore.set('commandHistory', next)
  return next
}

export function getRecentConnections(): RecentConnection[] {
  return normalizeRecentList(appStore.get('recentConnections'))
}

/** Persist host, user, port, label, and time. Secret fields on the input are ignored. */
export function recordRecentConnection(input: RecentConnectionInput): RecentConnection[] {
  const next = mergeRecentConnection(getRecentConnections(), {
    host: input.host,
    port: input.port,
    username: input.username,
    label: input.label,
    lastConnectedAt: input.lastConnectedAt
  })
  appStore.set('recentConnections', next)
  return next
}

export function removeRecentConnection(id: string): RecentConnection[] {
  const next = removeRecent(getRecentConnections(), id)
  appStore.set('recentConnections', next)
  return next
}

export function pinRecentConnection(id: string, pinned: boolean): RecentConnection[] {
  const next = setRecentPinned(getRecentConnections(), id, pinned)
  appStore.set('recentConnections', next)
  return next
}

export function getLocale(): LocaleId {
  return normalizeLocale(appStore.get('locale'))
}

export function setLocale(locale: LocaleId): LocaleId {
  const next = normalizeLocale(locale)
  appStore.set('locale', next)
  return next
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
        (p.jumpHost?.passphrase && !isEncryptedSecret(p.jumpHost.passphrase)) ||
        (p.jumpChain ?? []).some(
          (h) => (h.password && !isEncryptedSecret(h.password)) || (h.passphrase && !isEncryptedSecret(h.passphrase))
        )
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
