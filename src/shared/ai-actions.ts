/**
 * c53 AA1: AI → app actions. The model may only PROPOSE an action (name + params);
 * the UI renders a prefilled card and runs the executor after the user confirms.
 * Secret fields (password, private key, passphrase) are never taken from the model
 * and never sent to it.
 */
import type { AlertMetric, AlertRulesState } from './alert-rules'
import type { AddForwardRequest, CommandSnippet, SavedSessionProfile } from './ipc'
import type { Playbook } from './playbook'

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
  /** c55: high-risk when this returns true -> the card needs a second confirm. */
  risk?: (values: Record<string, string>) => boolean
  /** c57: note shown while armed (defaults to the batch note). */
  riskNoteKey?: string
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
  hint: 'create, change, enable or disable an alert rule of THIS APP (metric cpu|mem|disk|offline; threshold % not needed for offline; enabled on|off). "turn off disk alerts" -> metric=disk, enabled=off',
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

const SFTP_OPEN: ActionDef = {
  name: 'sftp.open',
  titleKey: 'aa.sftp.title',
  hint: 'open the SFTP file browser for a saved connection (target = its name or host), optionally at a directory (path starts with / or ~)',
  fields: [
    { key: 'target', labelKey: 'aa.f.target', type: 'text', required: true, placeholder: 'web-01' },
    { key: 'path', labelKey: 'aa.f.path', type: 'text', placeholder: '/var/log' }
  ]
}

/** c55: three or more connections at once counts as a batch -> second confirm. */
export const BATCH_RISK_MIN = 3

const CONNECTION_OPEN: ActionDef = {
  name: 'connection.open',
  titleKey: 'aa.open.title',
  hint: 'connect to one or more saved connections (targets = names or hosts separated by commas)',
  fields: [{ key: 'targets', labelKey: 'aa.f.targets', type: 'text', required: true, placeholder: 'web-01, web-02' }],
  risk: (v) => parseTargets(v.targets ?? '').length >= BATCH_RISK_MIN
}

const HISTORY_FILL: ActionDef = {
  name: 'history.fill',
  titleKey: 'aa.hist.title',
  hint: 'find a command the user ran before in THIS APP\'s local history and put it in the command bar (never sent); query = 1-3 keywords. Do not run `history` on the server',
  fields: [{ key: 'query', labelKey: 'aa.f.query', type: 'text', required: true, placeholder: 'nginx' }]
}

const PLAYBOOK_CREATE: ActionDef = {
  name: 'playbook.create',
  titleKey: 'aa.pb.title',
  hint: 'save a multi-step playbook (runbook) in THIS APP; commands = shell commands separated by ";" or new lines, one step each. Saved only, never run. For a single command use snippet.create',
  fields: [
    { key: 'name', labelKey: 'aa.f.name', type: 'text', required: true },
    { key: 'commands', labelKey: 'aa.f.commands', type: 'text', required: true, placeholder: 'uptime; df -h' },
    { key: 'description', labelKey: 'aa.f.desc', type: 'text' }
  ]
}

const SFTP_TRANSFER: ActionDef = {
  name: 'sftp.transfer',
  titleKey: 'aa.xfer.title',
  hint: 'download a remote file to this computer, or upload a local file to the server, over THIS APP\'s SFTP; target = saved connection label/host, paths absolute. Upload needs a second confirmation',
  fields: [
    { key: 'target', labelKey: 'aa.f.target', type: 'text', required: true },
    {
      key: 'direction',
      labelKey: 'aa.f.direction',
      type: 'select',
      required: true,
      options: [
        { value: 'download', labelKey: 'aa.dir.download' },
        { value: 'upload', labelKey: 'aa.dir.upload' }
      ]
    },
    { key: 'remotePath', labelKey: 'aa.f.remotePath', type: 'text', required: true, placeholder: '/var/log/syslog' },
    { key: 'localPath', labelKey: 'aa.f.localPath', type: 'text', required: true, placeholder: 'C:\\Users\\me\\Downloads\\syslog' }
  ],
  risk: (v) => (v.direction ?? '').trim() === 'upload',
  riskNoteKey: 'aa.uploadNote'
}

const BATCH_PREFILL: ActionDef = {
  name: 'batch.prefill',
  titleKey: 'aa.batch.title',
  hint: 'open THIS APP\'s batch-execute panel with the hosts ticked and the command filled in; it is NOT run, the user reviews and presses Run. targets = saved connection names/hosts separated by commas',
  fields: [
    { key: 'targets', labelKey: 'aa.f.targets', type: 'text', required: true, placeholder: 'web-01, web-02' },
    { key: 'command', labelKey: 'aa.f.command', type: 'text', required: true, placeholder: 'uptime' }
  ],
  risk: () => true,
  riskNoteKey: 'aa.batchNote'
}

const MONITOR_OPEN: ActionDef = {
  name: 'monitor.open',
  titleKey: 'aa.mon.title',
  hint: 'open THIS APP\'s resource monitor (CPU / memory / disk) for one saved connection; for alert thresholds use monitor.configure',
  fields: [{ key: 'target', labelKey: 'aa.f.target', type: 'text', required: true }]
}

const SNIPPET_CREATE: ActionDef = {
  name: 'snippet.create',
  titleKey: 'aa.snippet.title',
  hint: 'save a reusable command snippet in THIS APP (title, command, optional category); never write it to the server',
  fields: [
    { key: 'title', labelKey: 'aa.f.title', type: 'text', required: true },
    { key: 'command', labelKey: 'aa.f.command', type: 'text', required: true, placeholder: 'df -h' },
    { key: 'category', labelKey: 'aa.f.category', type: 'text' }
  ]
}

const FORWARD_CREATE: ActionDef = {
  name: 'forward.create',
  titleKey: 'aa.forward.title',
  hint: 'add a local port forward on the active SSH session (localPort -> remoteHost:remotePort)',
  fields: [
    { key: 'localPort', labelKey: 'aa.f.localPort', type: 'number', required: true, min: 1, max: 65535 },
    { key: 'remoteHost', labelKey: 'aa.f.remoteHost', type: 'text', def: '127.0.0.1' },
    { key: 'remotePort', labelKey: 'aa.f.remotePort', type: 'number', required: true, min: 1, max: 65535 }
  ]
}

export const AI_ACTIONS: readonly ActionDef[] = [CONNECTION_ADD, MONITOR_CONFIGURE, SFTP_OPEN, SNIPPET_CREATE, FORWARD_CREATE, CONNECTION_OPEN, HISTORY_FILL, PLAYBOOK_CREATE, SFTP_TRANSFER, BATCH_PREFILL, MONITOR_OPEN]

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
    'PRIORITY: requests about this app\'s own features (alert/monitor rules, snippets, the app\'s command history, opening saved connections or SFTP, port forwards, adding connections) are app actions. Answer them with appAction right away; do NOT use tool_call or command for them and do not inspect the server first.',
    'App actions: when the user asks to operate this app itself (not the remote server), reply with action=end, completed=true and an "appAction" object { "name": string, "params": object }. Never put the action name into the action field. Example: {"description":"...","action":"end","completed":true,"riskLevel":"low","appAction":{"name":"sftp.open","params":{"target":"web-01","path":"/var/log"}}}',
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
export type CardState = { phase: CardPhase; values: Record<string, string>; showMissing: boolean; message?: string; armed?: boolean }
export type CardEvent =
  | { type: 'edit'; key: string; value: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'finish'; ok: boolean; message?: string }
  | { type: 'disarm' }

export function cardReducer(def: ActionDef, s: CardState, e: CardEvent): CardState {
  const open = s.phase === 'editing' || s.phase === 'error'
  switch (e.type) {
    case 'edit':
      return open ? { ...s, phase: 'editing', values: { ...s.values, [e.key]: e.value }, armed: false } : s
    case 'confirm':
      if (!open) return s
      if (missingFields(def, s.values).length) return { ...s, phase: 'editing', showMissing: true, armed: false }
      // c55: high-risk -> first confirm only arms; the second one runs
      if (def.risk?.(s.values) && !s.armed) return { ...s, armed: true }
      return { ...s, phase: 'running', message: undefined, armed: false }
    case 'disarm':
      return s.armed ? { ...s, armed: false } : s
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

/** c54: resolve a saved connection by name, user@host or host (case-insensitive, exact first). */
export function findProfileForAction(profiles: readonly SavedSessionProfile[], target: string): SavedSessionProfile | undefined {
  const t = target.trim().toLowerCase()
  if (!t) return undefined
  return (
    profiles.find((p) => p.label.toLowerCase() === t) ??
    profiles.find((p) => `${p.username}@${p.host}`.toLowerCase() === t) ??
    profiles.find((p) => p.host.toLowerCase() === t) ??
    profiles.find((p) => p.label.toLowerCase().includes(t))
  )
}

export function buildSnippetFromAction(v: Record<string, string>, list: readonly CommandSnippet[], newId: () => string): { list: CommandSnippet[]; snippet: CommandSnippet } {
  const title = (v.title ?? '').trim()
  const body = (v.command ?? '').trim()
  const category = (v.category ?? '').trim() || undefined
  const snippet: CommandSnippet = { id: newId(), title, body, ...(category ? { category } : {}) }
  return { list: [...list, snippet], snippet }
}

export function forwardRequestFromAction(v: Record<string, string>, sessionId: string): AddForwardRequest {
  return { sessionId, direction: 'L', localPort: Number(v.localPort), remoteHost: (v.remoteHost ?? '').trim() || '127.0.0.1', remotePort: Number(v.remotePort) }
}

/** Audit line for an executed action: action name + non-secret values only. */
export function auditDetailForAction(name: string, v: Record<string, string>): string {
  const def = getAction(name)
  const parts = (def?.fields ?? []).filter((f) => f.type !== 'secret' && (v[f.key] ?? '').trim()).map((f) => `${f.key}=${v[f.key].trim()}`)
  return `${name} ${parts.join(' ')}`.trim()
}

/** c57: playbook.create commands -> steps (split on ; / ； / newline; max 30). */
export function splitPlaybookCommands(raw: string): string[] {
  return raw
    .split(/[;；\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30)
}

/** c57: every AI-made step asks before running (lockedConfirm) and stops on error. */
export function buildPlaybookFromAction(v: Record<string, string>, id: string, now: number): Playbook | null {
  const name = (v.name ?? '').trim()
  const cmds = splitPlaybookCommands(v.commands ?? '')
  if (!name || !cmds.length) return null
  return {
    id,
    name,
    description: (v.description ?? '').trim(),
    steps: cmds.map((command, i) => ({ id: `${id}-s${i + 1}`, type: 'command' as const, command, confirm: true, lockedConfirm: true, stopOnError: true, timeoutSec: 60, aiGenerated: true })),
    updatedAt: now
  }
}

/** c57: sftp.transfer path check. remote: absolute or ~; local: absolute (Windows drive / UNC / posix); no control chars, no ".." segment. */
export function transferPathsOk(v: Record<string, string>): boolean {
  const r = (v.remotePath ?? '').trim()
  const l = (v.localPath ?? '').trim()
  const clean = (x: string) => !/[\u0000-\u001f]/.test(x) && !x.split(/[\\/]/).includes('..')
  return /^[~/]/.test(r) && /^([A-Za-z]:[\\/]|\\\\|\/)/.test(l) && clean(r) && clean(l) && ['download', 'upload'].includes((v.direction ?? '').trim())
}

/** c55: split "a, b，c d" into unique targets (max 20). */
export function parseTargets(raw: string): string[] {
  const out: string[] = []
  for (const t of raw.split(/[,，;；\s]+/)) {
    const x = t.trim()
    if (x && !out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x)
  }
  return out.slice(0, 20)
}

export function resolveTargets(profiles: readonly SavedSessionProfile[], raw: string): { found: SavedSessionProfile[]; missing: string[] } {
  const found: SavedSessionProfile[] = []
  const missing: string[] = []
  for (const t of parseTargets(raw)) {
    const p = findProfileForAction(profiles, t)
    if (!p) missing.push(t)
    else if (!found.includes(p)) found.push(p)
  }
  return { found, missing }
}

/** c55: SFTP start dir must be absolute or home-relative, no control chars. Empty = default. */
export function sftpPathOk(path: string): boolean {
  const t = path.trim()
  return !t || (/^[~/]/.test(t) && !/[\u0000-\u001f]/.test(t))
}

/** c55: best history match. All keywords must appear; same host first, then most recent, then most used. */
export function pickHistoryForAction(
  entries: readonly { command: string; hostKey: string; count: number; lastUsed: number }[],
  query: string,
  hostKey: string
): string | undefined {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return undefined
  const hits = entries.filter((e) => words.every((w) => e.command.toLowerCase().includes(w)))
  hits.sort((a, b) => Number(b.hostKey === hostKey) - Number(a.hostKey === hostKey) || b.lastUsed - a.lastUsed || b.count - a.count)
  return hits[0]?.command
}

/** c55: "Error invoking remote method 'x': Error: msg" -> "msg" for the card. */
export function cleanIpcError(err: unknown): string {
  const raw = String((err as Error)?.message ?? err)
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
}

/** c55 (real-model eval): models sometimes reply {"action":"sftp.open","params":{...}}. Accept that shape too. */
export function proposalFromReply(obj: Record<string, unknown>): AppActionProposal | null {
  const direct = sanitizeProposal(obj.appAction)
  if (direct) return direct
  if (typeof obj.action === 'string' && getAction(obj.action)) return sanitizeProposal({ name: obj.action, params: obj.params ?? {} })
  return null
}
