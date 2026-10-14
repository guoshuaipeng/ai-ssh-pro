/** Local workspace helpers shared by main and renderer. No secrets, no network. */

export const COMMAND_HISTORY_CAP = 200
export const RECENT_CONNECTIONS_CAP = 40
export const BATCH_MAX_SESSIONS = 32
export const BATCH_MAX_COMMAND_CHARS = 4000
export const BATCH_DEFAULT_TIMEOUT_MS = 20_000
export const BATCH_MAX_TIMEOUT_MS = 60_000
export const BATCH_MAX_OUTPUT_BYTES = 32_768

export type LocaleId = 'zh-CN' | 'en'

export type BatchExecRequest = {
  sessionIds: string[]
  command: string
  timeoutMs?: number
}

export type BatchExecSessionResult = {
  sessionId: string
  label: string
  host: string
  port: number
  username: string
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  /** Stable code: not-connected | child-session | timeout | exec-failed, or a short ssh2 message */
  error?: string
  elapsedMs: number
  truncated?: boolean
  timedOut?: boolean
}

export type BatchExecResult = {
  command: string
  startedAt: number
  results: BatchExecSessionResult[]
  /** Set when the request is rejected before any session runs */
  error?: 'empty-command' | 'no-sessions'
}

/**
 * A successful SSH connect, kept for quick reconnect.
 * Passwords, key paths, and passphrases are never stored here.
 */
export type RecentConnection = {
  id: string
  host: string
  port: number
  username: string
  label?: string
  lastConnectedAt: number
  pinned?: boolean
}

export type RecentConnectionInput = {
  host: string
  port?: number
  username: string
  label?: string
  lastConnectedAt?: number
}

/** Single-line shell command, or null when empty / multiline / too long. */
export function normalizeCommandLine(raw: string): string | null {
  const s = String(raw ?? '').replace(/\r\n/g, '\n').trim()
  if (!s || s.includes('\n') || s.includes('\r')) return null
  if (s.length > BATCH_MAX_COMMAND_CHARS) return null
  return s
}

const SENSITIVE_PATTERNS: RegExp[] = [
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[=:]\s*\S+/i,
  /--(?:password|passwd|token|secret|api-key|access-key)(?:=|\s+)\S+/i,
  /\b(?:export|set)\s+\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY)\w*\s*=/i,
  /\bmysql(?:dump|admin)?\b.*\s-p\S+/,
  /\bsshpass\s+-p\s*\S+/,
  /\bAuthorization:\s*(?:Bearer|Basic)\s+\S+/i,
  /:\/\/[^\s/:@]+:[^\s/@]+@/
]

/** True when a command line likely carries a credential and must not be stored in history. */
export function isSensitiveCommand(command: string): boolean {
  const s = String(command ?? '')
  return SENSITIVE_PATTERNS.some((re) => re.test(s))
}

/** Remove ANSI/VT escape sequences (colors, cursor moves, OSC titles) from captured output. */
export function stripAnsi(text: string): string {
  return String(text ?? '')
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '')
}

export function pushCommandHistory(list: string[], command: string): string[] {
  const base = normalizeHistory(list)
  // Same convention as bash HISTCONTROL=ignorespace: a leading space means "do not record".
  if (/^[ \t]/.test(String(command ?? ''))) return base
  const cmd = normalizeCommandLine(command)
  if (!cmd || isSensitiveCommand(cmd)) return base
  return [cmd, ...base.filter((row) => row !== cmd)].slice(0, COMMAND_HISTORY_CAP)
}

export function normalizeHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const cmd = normalizeCommandLine(item)
    if (!cmd || seen.has(cmd) || isSensitiveCommand(cmd)) continue
    seen.add(cmd)
    out.push(cmd)
    if (out.length >= COMMAND_HISTORY_CAP) break
  }
  return out
}

export function filterCommandHistory(list: string[], query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase()
  const cap = Math.min(20, Math.max(1, limit))
  if (!q) return list.slice(0, cap)
  const starts: string[] = []
  const includes: string[] = []
  for (const cmd of list) {
    const lower = cmd.toLowerCase()
    if (lower === q) continue
    if (lower.startsWith(q)) starts.push(cmd)
    else if (lower.includes(q)) includes.push(cmd)
  }
  return [...starts, ...includes].slice(0, cap)
}

export function recentConnectionId(host: string, port: number, username: string): string {
  return `${username.trim().toLowerCase()}@${host.trim().toLowerCase()}:${port}`
}

export function normalizeRecentInput(input: RecentConnectionInput): RecentConnection | null {
  const host = typeof input?.host === 'string' ? input.host.trim() : ''
  const username = typeof input?.username === 'string' ? input.username.trim() : ''
  const port =
    typeof input?.port === 'number' && Number.isFinite(input.port) ? Math.floor(input.port) : 22
  if (!host || !username || !(port > 0 && port < 65536)) return null
  const labelRaw = typeof input.label === 'string' ? input.label.trim() : ''
  const fallback = `${username}@${host}`
  const label = labelRaw && labelRaw !== fallback ? labelRaw.slice(0, 80) : undefined
  const lastConnectedAt =
    typeof input.lastConnectedAt === 'number' && Number.isFinite(input.lastConnectedAt)
      ? input.lastConnectedAt
      : Date.now()
  const row: RecentConnection = {
    id: recentConnectionId(host, port, username),
    host,
    port,
    username,
    lastConnectedAt
  }
  if (label) row.label = label
  return row
}

export function normalizeRecentList(raw: unknown): RecentConnection[] {
  if (!Array.isArray(raw)) return []
  const out: RecentConnection[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const host = typeof o.host === 'string' ? o.host.trim() : ''
    const username = typeof o.username === 'string' ? o.username.trim() : ''
    const port = typeof o.port === 'number' && Number.isFinite(o.port) ? Math.floor(o.port) : 22
    if (!host || !username || !(port > 0 && port < 65536)) continue
    const id = recentConnectionId(host, port, username)
    if (seen.has(id)) continue
    seen.add(id)
    const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 80) : undefined
    const lastConnectedAt =
      typeof o.lastConnectedAt === 'number' && Number.isFinite(o.lastConnectedAt) ? o.lastConnectedAt : 0
    const row: RecentConnection = {
      id,
      host,
      port,
      username,
      lastConnectedAt
    }
    if (label && label !== `${username}@${host}`) row.label = label
    if (o.pinned === true) row.pinned = true
    out.push(row)
  }
  out.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
    return b.lastConnectedAt - a.lastConnectedAt
  })
  return out.slice(0, RECENT_CONNECTIONS_CAP)
}

export function mergeRecentConnection(list: RecentConnection[], input: RecentConnectionInput): RecentConnection[] {
  const row = normalizeRecentInput(input)
  const current = normalizeRecentList(list)
  if (!row) return current
  const prev = current.find((item) => item.id === row.id)
  const merged: RecentConnection = {
    ...row,
    label: row.label ?? prev?.label
  }
  if (prev?.pinned) merged.pinned = true
  return normalizeRecentList([merged, ...current.filter((item) => item.id !== row.id)])
}

export function setRecentPinned(list: RecentConnection[], id: string, pinned: boolean): RecentConnection[] {
  const key = id.trim()
  return normalizeRecentList(
    normalizeRecentList(list).map((row) => {
      if (row.id !== key) return row
      if (pinned) return { ...row, pinned: true }
      const next: RecentConnection = { ...row }
      delete next.pinned
      return next
    })
  )
}

export function removeRecent(list: RecentConnection[], id: string): RecentConnection[] {
  const key = id.trim()
  return normalizeRecentList(normalizeRecentList(list).filter((row) => row.id !== key))
}

export function normalizeLocale(raw: unknown): LocaleId {
  return raw === 'en' ? 'en' : 'zh-CN'
}

export function clampBatchTimeout(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return BATCH_DEFAULT_TIMEOUT_MS
  return Math.min(BATCH_MAX_TIMEOUT_MS, Math.max(1000, Math.floor(raw)))
}

export function normalizeBatchRequest(
  raw: unknown
): { command: string; sessionIds: string[]; timeoutMs: number } | { error: 'empty-command' | 'no-sessions' } {
  if (!raw || typeof raw !== 'object') return { error: 'empty-command' }
  const o = raw as Record<string, unknown>
  const command = typeof o.command === 'string' ? normalizeCommandLine(o.command) : null
  if (!command) return { error: 'empty-command' }
  if (!Array.isArray(o.sessionIds)) return { error: 'no-sessions' }
  const sessionIds = [
    ...new Set(o.sessionIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean))
  ].slice(0, BATCH_MAX_SESSIONS)
  if (sessionIds.length === 0) return { error: 'no-sessions' }
  return { command, sessionIds, timeoutMs: clampBatchTimeout(o.timeoutMs) }
}

export type LatencyLevel = 'good' | 'fair' | 'poor' | 'down'
export const LATENCY_TIMEOUT_MS = 5000
export const LATENCY_POLL_MS = 15_000

/** Round-trip of a no-op exec on the session's SSH connection; null means unreachable / timed out. */
export function classifyLatency(ms: number | null | undefined): LatencyLevel {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return 'down'
  if (ms < 150) return 'good'
  if (ms < 500) return 'fair'
  return 'poor'
}

/** IPC input guard: a non-empty session id of sane length, else null. */
export function normalizeSessionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return id && id.length <= 128 ? id : null
}

/** Backoff for automatic reconnect after an unexpected drop. attempt is 1-based; null = give up. */
export const AUTO_RECONNECT_DELAYS_MS = [2000, 5000, 10_000] as const

export function autoReconnectDelay(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 1) return null
  return AUTO_RECONNECT_DELAYS_MS[attempt - 1] ?? null
}

// ---------- snippets: {{variable}} placeholders ----------
const SNIPPET_VAR_RE = /\{\{\s*([A-Za-z_][\w-]{0,31})\s*\}\}/g

/** Unique placeholder names in first-seen order, e.g. "tail -n {{lines}} {{file}}" -> ["lines","file"]. */
export function extractSnippetVars(body: string): string[] {
  const out: string[] = []
  for (const m of String(body ?? '').matchAll(SNIPPET_VAR_RE)) {
    const name = m[1]!
    if (!out.includes(name)) out.push(name)
  }
  return out.slice(0, 12)
}

/** Replace placeholders; missing values are left as-is so nothing is silently dropped. */
export function fillSnippetVars(body: string, values: Record<string, string>): string {
  return String(body ?? '').replace(SNIPPET_VAR_RE, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole
  )
}

export type SnippetLike = { title: string; body: string }

/** Case-insensitive AND search over title + body. */
export function filterSnippets<T extends SnippetLike>(items: T[], query: string): T[] {
  const tokens = searchTokens(query)
  if (!tokens.length) return items
  return items.filter((s) => {
    const hay = `${s.title}\n${s.body}`.toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}

// ---------- search ----------
export function searchTokens(query: string): string[] {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
}

// ---------- batch report ----------
export function formatBatchReport(result: BatchExecResult): string {
  const lines: string[] = [`# ${result.command}`, `# ${new Date(result.startedAt).toISOString()}`, '']
  for (const r of result.results) {
    const who = r.username ? `${r.username}@${r.host}:${r.port}` : r.sessionId
    const status = r.ok ? 'OK' : 'FAILED'
    const code = r.code != null ? ` exit=${r.code}` : ''
    lines.push(`== ${r.label || r.sessionId} (${who}) ${status}${code} ${r.elapsedMs}ms${r.error ? ` error=${r.error}` : ''}`)
    if (r.stdout) lines.push(r.stdout.replace(/\s+$/, ''))
    if (r.stderr) lines.push('[stderr]', r.stderr.replace(/\s+$/, ''))
    if (r.truncated) lines.push('[truncated]')
    lines.push('')
  }
  return lines.join('\n')
}

// ---------- keyboard shortcuts reference ----------
export type ShortcutGroup = 'general' | 'session' | 'terminal' | 'view'
export const SHORTCUTS: ReadonlyArray<{ keys: string; group: ShortcutGroup; id: string }> = [
  { keys: 'F1', group: 'general', id: 'shortcuts' },
  { keys: 'Ctrl+,', group: 'general', id: 'ai' },
  { keys: 'Ctrl+Shift+N', group: 'session', id: 'newConnection' },
  { keys: 'Ctrl+Shift+F', group: 'session', id: 'sftp' },
  { keys: 'Ctrl+Shift+D', group: 'session', id: 'refreshDocker' },
  { keys: 'Ctrl+Shift+H', group: 'session', id: 'inventory' },
  { keys: 'Ctrl+Shift+C', group: 'terminal', id: 'copy' },
  { keys: 'Ctrl+Shift+V', group: 'terminal', id: 'paste' },
  { keys: 'Shift+Insert', group: 'terminal', id: 'pasteAlt' },
  { keys: 'Ctrl+B', group: 'view', id: 'toggleSidebar' },
  { keys: 'Ctrl+Alt+B', group: 'view', id: 'toggleAi' }
]
