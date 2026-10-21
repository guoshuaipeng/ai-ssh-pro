/**
 * c53 AA1: AI → app actions. The model may only PROPOSE an action (name + params);
 * the UI renders a prefilled card and runs the executor after the user confirms.
 * Secret fields (password, private key, passphrase) are never taken from the model
 * and never sent to it.
 */
import type { AlertMetric, AlertRulesState } from './alert-rules'
import type { SavedSessionProfile } from './ipc'

export type ActionFieldType = 'text' | 'number' | 'select' | 'secret'

export type ActionField = {
  key: string
  labelKey: string
  type: ActionFieldType
  required?: boolean
  options?: { value: string; labelKey: string }[]
  min?: number
  max?: number
  def?: string
  placeholder?: string
  /** Only shown (and validated) when this returns true. */
  showIf?: (values: Record<string, string>) => boolean
}

export type ActionDef = {
  name: string
  titleKey: string
  /** One line for the model: when to propose this action. */
  hint: string
  fields: ActionField[]
}

export type AppActionProposal = { name: string; params: Record<string, string> }

const CONNECTION_ADD: ActionDef = {
  name: 'connection.add',
  titleKey: 'aa.connAdd.title',
  hint: 'add a saved SSH connection (host, port, username, auth)',
  fields: [
    { key: 'label', labelKey: 'aa.f.label', type: 'text' },
    { key: 'host', labelKey: 'aa.f.host', type: 'text', required: true, placeholder: '192.0.2.10' },
    { key: 'port', labelKey: 'aa.f.port', type: 'number', min: 1, max: 65535, def: '22' },
    { key: 'username', labelKey: 'aa.f.username', type: 'text', required: true, placeholder: 'root' },
    {
      key: 'auth',
      labelKey: 'aa.f.auth',
      type: 'select',
      def: 'key',
      options: [
        { value: 'key', labelKey: 'aa.auth.key' },
        { value: 'password', labelKey: 'aa.auth.password' },
        { value: 'agent', labelKey: 'aa.auth.agent' }
      ]
    },
    { key: 'password', labelKey: 'aa.f.password', type: 'secret', showIf: (v) => v.auth === 'password' },
    { key: 'privateKeyPath', labelKey: 'aa.f.keyPath', type: 'secret', showIf: (v) => (v.auth || 'key') === 'key' }
  ]
}

const MONITOR_CONFIGURE: ActionDef = {
  name: 'monitor.configure',
  titleKey: 'aa.monitor.title',
  hint: 'set an alert threshold rule (metric cpu|mem|disk|offline, threshold %, sustain minutes)',
  fields: [
    {
      key: 'metric',
      labelKey: 'aa.f.metric',
      type: 'select',
      required: true,
      options: [
        { value: 'cpu', labelKey: 'aa.metric.cpu' },
        { value: 'mem', labelKey: 'aa.metric.mem' },
        { value: 'disk', labelKey: 'aa.metric.disk' },
        { value: 'offline', labelKey: 'aa.metric.offline' }
      ]
    },
    { key: 'threshold', labelKey: 'aa.f.threshold', type: 'number', required: true, min: 1, max: 100, showIf: (v) => v.metric !== 'offline' },
    { key: 'sustainMin', labelKey: 'aa.f.sustain', type: 'number', min: 0, max: 60, def: '5' },
    {
      key: 'enabled',
      labelKey: 'aa.f.enabled',
      type: 'select',
      def: 'on',
      options: [
        { value: 'on', labelKey: 'aa.on' },
        { value: 'off', labelKey: 'aa.off' }
      ]
    }
  ]
}

export const AI_ACTIONS: readonly ActionDef[] = [CONNECTION_ADD, MONITOR_CONFIGURE]

export function getAction(name: string): ActionDef | undefined {
  return AI_ACTIONS.find((a) => a.name === name)
}

export const SECRET_KEY_RE = /pass(word|phrase)?|secret|token|private|key(path)?$|credential/i

/** Keep only known, non-secret fields; strings only, trimmed and clipped. */
export function sanitizeProposal(raw: unknown): AppActionProposal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  const def = getAction(name)
  if (!def) return null
  const src = o.params && typeof o.params === 'object' && !Array.isArray(o.params) ? (o.params as Record<string, unknown>) : {}
  const params: Record<string, string> = {}
  for (const f of def.fields) {
    if (f.type === 'secret') continue
    const v = src[f.key]
    if (v === undefined || v === null) continue
    const s = String(typeof v === 'object' ? '' : v).trim().slice(0, 200)
    if (!s) continue
    if (f.type === 'select' && !f.options?.some((op) => op.value === s)) continue
    if (f.type === 'number' && !Number.isFinite(Number(s))) continue
    params[f.key] = s
  }
  return { name, params }
}

export function initialValues(def: ActionDef, params: Record<string, string>): Record<string, string> {
  const v: Record<string, string> = {}
  for (const f of def.fields) v[f.key] = f.type === 'secret' ? '' : (params[f.key] ?? f.def ?? '')
  return v
}

export function visibleFields(def: ActionDef, values: Record<string, string>): ActionField[] {
  return def.fields.filter((f) => !f.showIf || f.showIf(values))
}

/** Required fields still empty or out of range -> the card asks for them. */
export function missingFields(def: ActionDef, values: Record<string, string>): ActionField[] {
  return visibleFields(def, values).filter((f) => {
    const s = (values[f.key] ?? '').trim()
    if (!s) return Boolean(f.required)
    if (f.type === 'number') {
      const n = Number(s)
      if (!Number.isFinite(n)) return true
      if (f.min !== undefined && n < f.min) return true
      if (f.max !== undefined && n > f.max) return true
    }
    return false
  })
}

/** Lines for the system prompt: names and non-secret params only. */
export function actionsPrompt(): string {
  const lines = AI_ACTIONS.map((a) => {
    const ps = a.fields
      .filter((f) => f.type !== 'secret')
      .map((f) => `${f.key}${f.required ? '*' : ''}${f.options ? '=' + f.options.map((o) => o.value).join('|') : ''}`)
    return `- ${a.name}: ${a.hint}; params { ${ps.join(', ')} }`
  })
  return [
    'App actions: when the user asks to operate this app itself (not the remote server), reply with action=end, completed=true and an "appAction" object { "name": string, "params": object }.',
    'The UI shows a prefilled form; nothing runs until the user confirms. Leave unknown params out (the form asks the user).',
    'Never include passwords, private keys, passphrases or tokens in params.',
    ...lines
  ].join('\n')
}

/** Context sent to the model: strip secrets first. */
export function redactForAi(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[redacted-key]')
    .replace(/\b(api[_-]?key|token|password|passwd|passphrase|secret)\b(\s*[:=]\s*|\s+)("[^"]*"|'[^']*'|\S+)/gi, '$1=[redacted]')
    .replace(/(密码|口令|私钥|密钥)(\s*[:：=]\s*|\s+)\S+/g, '$1：[redacted]')
    .replace(/\bsshpass\s+-p\s*\S+/gi, 'sshpass -p [redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
}

// ---- card state machine (shared so it is unit-tested) ----
export type CardPhase = 'editing' | 'running' | 'done' | 'cancelled' | 'error'
export type CardState = { phase: CardPhase; values: Record<string, string>; showMissing: boolean; message?: string }
export type CardEvent =
  | { type: 'edit'; key: string; value: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'finish'; ok: boolean; message?: string }

export function cardReducer(def: ActionDef, s: CardState, e: CardEvent): CardState {
  const open = s.phase === 'editing' || s.phase === 'error'
  switch (e.type) {
    case 'edit':
      return open ? { ...s, phase: 'editing', values: { ...s.values, [e.key]: e.value } } : s
    case 'confirm':
      if (!open) return s
      if (missingFields(def, s.values).length) return { ...s, phase: 'editing', showMissing: true }
      return { ...s, phase: 'running', message: undefined }
    case 'cancel':
      return open ? { ...s, phase: 'cancelled' } : s
    case 'finish':
      return s.phase === 'running' ? { ...s, phase: e.ok ? 'done' : 'error', message: e.message } : s
  }
}

// ---- executors (pure parts) ----
export type ActionResult = { ok: boolean; message?: string }

export function buildProfileFromAction(
  v: Record<string, string>,
  profiles: readonly SavedSessionProfile[],
  newId: () => string
): { profiles: SavedSessionProfile[]; profile: SavedSessionProfile; updated: boolean } {
  const host = (v.host ?? '').trim()
  const username = (v.username ?? '').trim()
  const port = Number(v.port) || 22
  const auth = (v.auth === 'password' || v.auth === 'agent' ? v.auth : 'key') as 'password' | 'key' | 'agent'
  const existing = profiles.find((p) => p.host === host && p.port === port && p.username === username)
  const profile: SavedSessionProfile = {
    ...existing,
    id: existing?.id ?? newId(),
    label: (v.label ?? '').trim() || `${username}@${host}`,
    host,
    port,
    username,
    authMode: auth,
    password: auth === 'password' && v.password ? v.password : existing?.password,
    privateKeyPath: auth === 'key' && v.privateKeyPath?.trim() ? v.privateKeyPath.trim() : existing?.privateKeyPath
  }
  const next = existing ? profiles.map((p) => (p.id === existing.id ? profile : p)) : [...profiles, profile]
  return { profiles: next, profile, updated: Boolean(existing) }
}

export function applyMonitorAction(state: AlertRulesState, v: Record<string, string>): AlertRulesState {
  const id = v.metric as AlertMetric
  const enabled = v.enabled !== 'off'
  const sustainMin = Math.max(0, Math.min(60, Number(v.sustainMin) || 0))
  const rules = state.rules.some((r) => r.id === id)
    ? state.rules.map((r) =>
        r.id === id
          ? { ...r, enabled, sustainMin, ...(id !== 'offline' ? { threshold: Number(v.threshold) } : {}), customized: true }
          : r
      )
    : [...state.rules, { id, enabled, sustainMin, threshold: id === 'offline' ? 0 : Number(v.threshold), customized: true }]
  return { ...state, rules }
}
