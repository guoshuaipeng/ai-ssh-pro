/**
 * Agent safety tiers. Orthogonal to the low / medium / high risk badge:
 * the badge still labels a command, and the tier decides which labels skip Agree.
 * High risk does not auto-run unless autopilot is on and the high-risk switch
 * is explicitly enabled, and never on a production host.
 * Interactive tools (ncdu, top, vim, less, …) never auto-run. The same in-flight
 * command is not asked to Agree again.
 */
import { assessCommandRisk } from './command-risk'

export const SAFETY_TIERS = ['observe', 'confirm', 'trusted', 'autopilot'] as const

export type SafetyTier = (typeof SAFETY_TIERS)[number]

export const DEFAULT_SAFETY_TIER: SafetyTier = 'confirm'

export type SafetyMode = 'auto' | 'agree' | 'strong' | 'suggest' | 'hold'

export type CommandKind = 'read' | 'write' | 'high' | 'interactive'

export type SafetySettings = {
  safetyTier?: unknown
  safetyTierHosts?: Record<string, unknown> | null
  safetyTierSessions?: Record<string, unknown> | null
  autopilotAllowHosts?: readonly string[] | null
  autopilotAllowHighRisk?: boolean | null
  /** M21 policy fields (see ai-policy.ts). */
  aiPolicy?: unknown
  aiAutoHighRisk?: boolean | null
}

export type SafetyScope = {
  tier: SafetyTier
  command: string
  riskLevel?: string | null
  production?: boolean
  hostId?: string | null
  hostName?: string | null
  allowHosts?: readonly string[] | null
  allowHighRisk?: boolean
  book?: InFlightBook | null
}

export type SafetyDecision = {
  mode: SafetyMode
  kind: CommandKind
  tier: SafetyTier
  /** Tier whose rules ran. Autopilot falls back to confirm when it is not permitted. */
  appliedTier: SafetyTier
  warn: boolean
  alternative: string | null
  offerAgree: boolean
  strong: boolean
  /** Pre-approval: the command may be written without waiting. */
  write: boolean
  /** Pre-approval: the existing Agree / Decline path must run. */
  waitForAgree: boolean
}

const INTERACTIVE =
  /(?:^|[;&|]\s*)(?:sudo(?:\s+-[\w-]+|\s+--\S+|\s+-u\s+\S+)*\s+)?(?:ncdu|htop|btop|atop|nmon|iotop|iftop|nmtui|nvim|vim|vi|nano|emacs|less|more|most|watch|man|tmux|screen|ranger|mc|top)\b/

const READ_BIN = new Set([
  'ls', 'll', 'dir', 'cat', 'tac', 'head', 'tail', 'df', 'du', 'free', 'uptime', 'pwd', 'whoami', 'id',
  'uname', 'date', 'hostname', 'echo', 'printf', 'ps', 'pgrep', 'pstree', 'grep', 'egrep', 'fgrep', 'rg',
  'wc', 'true', 'false', 'which', 'whereis', 'type', 'file', 'stat', 'readlink', 'realpath', 'basename',
  'dirname', 'env', 'printenv', 'who', 'w', 'last', 'lastlog', 'lsblk', 'lscpu', 'lsmem', 'lsmod', 'lsusb',
  'lspci', 'dmesg', 'mount', 'findmnt', 'journalctl', 'dmidecode', 'vmstat', 'iostat', 'mpstat', 'sar',
  'lsof', 'ss', 'netstat', 'ping', 'traceroute', 'tracepath', 'dig', 'nslookup', 'host', 'getent',
  'timedatectl', 'hostnamectl', 'localectl', 'loginctl', 'nproc', 'arch', 'lsb_release', 'swapon', 'blkid',
  'find', 'awk', 'cut', 'sort', 'uniq', 'tr', 'column', 'nl', 'od', 'hexdump', 'sha256sum', 'md5sum',
  'ip', 'ifconfig'
])

const SYSTEMCTL_READ = new Set([
  'status', 'is-active', 'is-enabled', 'is-failed', 'show', 'list-units', 'list-unit-files', 'cat', 'help', '--version'
])

const GIT_READ = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'branch', 'remote', 'ls-files', 'describe'])

const DOCKER_READ = new Set(['ps', 'images', 'image', 'inspect', 'logs', 'version', 'info'])

export function isSafetyTier(value: unknown): value is SafetyTier {
  return typeof value === 'string' && (SAFETY_TIERS as readonly string[]).includes(value)
}

export function normalizeSafetyTier(value: unknown): SafetyTier {
  return isSafetyTier(value) ? value : DEFAULT_SAFETY_TIER
}

/** True when saved settings name a tier. A missing field keeps the legacy confirm-all path. */
export function safetyTierEngaged(settings: SafetySettings | null | undefined): boolean {
  if (!settings) return false
  if (isSafetyTier(settings.safetyTier)) return true
  if (settings.safetyTierHosts && Object.keys(settings.safetyTierHosts).some((k) => isSafetyTier(settings.safetyTierHosts?.[k]))) {
    return true
  }
  if (settings.safetyTierSessions && Object.keys(settings.safetyTierSessions).some((k) => isSafetyTier(settings.safetyTierSessions?.[k]))) {
    return true
  }
  return false
}

export function effectiveSafetyTier(
  settings: SafetySettings | null | undefined,
  scope?: { hostId?: string | null; sessionId?: string | null }
): SafetyTier {
  const sessionId = scope?.sessionId?.trim()
  const hostId = scope?.hostId?.trim()
  const session = sessionId ? settings?.safetyTierSessions?.[sessionId] : undefined
  if (isSafetyTier(session)) return session
  const host = hostId ? settings?.safetyTierHosts?.[hostId] : undefined
  if (isSafetyTier(host)) return host
  return normalizeSafetyTier(settings?.safetyTier)
}

export function commandKey(command: string): string {
  return String(command ?? '').replace(/\s+/g, ' ').trim()
}

export type InFlightBook = {
  note(command: string): void
  release(command: string): void
  holds(command: string): boolean
  keys(): string[]
}

export function createInFlightBook(): InFlightBook {
  const keys = new Set<string>()
  return {
    note(command: string) {
      const key = commandKey(command)
      if (key && isInteractiveCommand(command)) keys.add(key)
    },
    release(command: string) {
      keys.delete(commandKey(command))
    },
    holds(command: string) {
      return keys.has(commandKey(command))
    },
    keys() {
      return [...keys]
    }
  }
}

const sessionBooks = new Map<string, InFlightBook>()

/** Renderer / session book. A new user turn should release it. */
export function sessionInFlightBook(scope: string | null | undefined): InFlightBook {
  const id = scope?.trim() || 'global'
  let book = sessionBooks.get(id)
  if (!book) {
    book = createInFlightBook()
    sessionBooks.set(id, book)
  }
  return book
}

export function releaseSessionInFlight(scope: string | null | undefined): void {
  sessionBooks.delete(scope?.trim() || 'global')
}

export function isInteractiveCommand(command: string): boolean {
  return INTERACTIVE.test(String(command ?? ''))
}

export function nonInteractiveAlternative(command: string): string | null {
  const s = String(command ?? '')
  if (/\btop\b|\bhtop\b|\bbtop\b/.test(s)) return 'ps aux --sort=-%cpu | head'
  if (/\bncdu\b/.test(s)) return 'du -h --max-depth=1'
  if (/\bless\b|\bmore\b|\bmost\b/.test(s)) return 'tail -n 80'
  if (/\bman\b/.test(s)) return null
  return null
}

function stripSudo(segment: string): string {
  let s = segment.trim()
  if (!/^sudo\b/.test(s)) return s
  const parts = s.split(/\s+/)
  let i = 1
  while (i < parts.length) {
    const p = parts[i] ?? ''
    if (p === '-u' || p === '-g' || p === '--user' || p === '--group') {
      i += 2
      continue
    }
    if (p.startsWith('-')) {
      i += 1
      continue
    }
    break
  }
  return parts.slice(i).join(' ')
}

function splitSegments(command: string): string[] {
  return command
    .split(/\s*(?:&&|\|\||[|;])\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function redirectIsWrite(segment: string): boolean {
  const re = /(^|[^<])>>?\s*(\S+)/g
  for (const match of segment.matchAll(re)) {
    const target = match[2] ?? ''
    if (!target || target.startsWith('&')) continue
    if (target === '/dev/null' || target === '/dev/stdout' || target === '/dev/stderr') continue
    return true
  }
  return /\btee\b/.test(segment)
}

function isReadSegment(segment: string): boolean {
  const body = stripSudo(segment)
  if (!body) return true
  if (redirectIsWrite(body)) return false
  const parts = body.split(/\s+/)
  const bin = parts[0] ?? ''
  const sub = parts[1] ?? ''
  if (bin === 'systemctl' || bin === 'service') {
    if (bin === 'service') return sub === 'status' || parts[2] === 'status'
    return SYSTEMCTL_READ.has(sub)
  }
  if (bin === 'git') return GIT_READ.has(sub)
  if (bin === 'docker' || bin === 'podman') return DOCKER_READ.has(sub)
  if (bin === 'sed') return !/(^|\s)-[^\s]*i/.test(body)
  if (bin === 'find') return !/\s-(?:delete|exec|ok|fprint)\b/.test(body)
  if (bin === 'du') return !/\s--delete\b/.test(body)
  return READ_BIN.has(bin)
}

function isLocalHigh(command: string): boolean {
  if (assessCommandRisk(command)) return true
  if (/(?:^|[;&|]\s*)(?:sudo(?:\s+\S+)*\s+)?(?:shutdown|reboot|halt|poweroff|init\s+[06])\b/.test(command)) return true
  if (/\bmkfs(?:\.\w+)?\b/.test(command)) return true
  if (/\bdd\b[^|;&]*\bof=\/dev\/(?!null\b|zero\b)/.test(command)) return true
  if (/>\s*\/dev\/(?:sd[a-z]|nvme\d|vd[a-z]|xvd[a-z]|hd[a-z])/.test(command)) return true
  return false
}

/** Local kind. The badge is a separate label; a high badge or a local high rule both count as high. */
export function classifyCommand(command: string, riskLevel?: string | null): CommandKind {
  const text = String(command ?? '').trim()
  if (!text) return 'write'
  if (isInteractiveCommand(text)) return 'interactive'
  if (riskLevel === 'high' || isLocalHigh(text)) return 'high'
  const segments = splitSegments(text)
  if (segments.length === 0) return 'write'
  if (segments.every(isReadSegment)) return 'read'
  return 'write'
}

function hostListed(scope: SafetyScope): boolean {
  const allow = (scope.allowHosts ?? []).map((row) => row.trim()).filter(Boolean)
  if (allow.length === 0) return false
  const ids = [scope.hostId, scope.hostName].map((row) => row?.trim()).filter((row): row is string => Boolean(row))
  return ids.some((id) => allow.includes(id))
}

function autopilotPermitted(scope: SafetyScope): { ok: boolean; warn: boolean } {
  const allow = (scope.allowHosts ?? []).map((row) => row.trim()).filter(Boolean)
  const listed = hostListed(scope)
  if (scope.production && !listed) return { ok: false, warn: true }
  if (allow.length > 0 && !listed) return { ok: false, warn: true }
  return { ok: true, warn: false }
}

function modeFor(applied: SafetyTier, kind: CommandKind, scope: SafetyScope): SafetyMode {
  if (kind === 'interactive') {
    if (scope.book?.holds(scope.command)) return 'hold'
    return 'agree'
  }
  if (kind === 'high') {
    if (
      applied === 'autopilot' &&
      scope.allowHighRisk === true &&
      scope.production !== true
    ) {
      return 'auto'
    }
    if (applied === 'observe') return 'suggest'
    if (applied === 'confirm') return 'strong'
    return 'agree'
  }
  if (kind === 'read') return 'auto'
  if (applied === 'observe') return 'suggest'
  if (applied === 'confirm') return 'agree'
  return 'auto'
}

export function decideSafetyGate(scope: SafetyScope): SafetyDecision {
  const command = String(scope.command ?? '')
  const kind = classifyCommand(command, scope.riskLevel)
  let applied = scope.tier
  let warn = false
  if (scope.tier === 'autopilot') {
    const permit = autopilotPermitted(scope)
    warn = permit.warn
    if (!permit.ok) applied = 'confirm'
  }
  const mode = command.trim() ? modeFor(applied, kind, { ...scope, command }) : 'agree'
  const alternative = kind === 'interactive' ? nonInteractiveAlternative(command) : null
  return {
    mode,
    kind,
    tier: scope.tier,
    appliedTier: applied,
    warn,
    alternative,
    offerAgree: mode === 'agree' || mode === 'strong',
    strong: mode === 'strong',
    write: mode === 'auto',
    waitForAgree: mode === 'agree' || mode === 'strong'
  }
}

export function planCommandConfirm(scope: SafetyScope): SafetyDecision {
  return decideSafetyGate(scope)
}

export function normalizeTierMap(raw: unknown): Record<string, SafetyTier> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, SafetyTier> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = key.trim()
    if (!id || !isSafetyTier(value)) continue
    out[id] = value
  }
  return Object.keys(out).length ? out : undefined
}

export function normalizeAllowHosts(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = [...new Set(raw.map((row) => String(row).trim()).filter(Boolean))]
  return out.length ? out : undefined
}
