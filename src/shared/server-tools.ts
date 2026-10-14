/**
 * Server toolbox: process list, systemd services, listening ports and log tail for a connected Linux host.
 * Every remote command is built here from validated inputs (never from free text typed in the renderer),
 * so the main process can run it over an exec channel without shell-injection risk.
 */

export type ProcInfo = { pid: number; user: string; cpu: number; mem: number; rssKb: number; etime: string; command: string }
export type ServiceInfo = { unit: string; load: string; active: string; sub: string; description: string }
export type ListenPort = { proto: 'tcp' | 'udp'; address: string; port: number; process?: string; pid?: number }
export type KillSignal = 'TERM' | 'KILL' | 'HUP'
export type ServiceAction = 'start' | 'stop' | 'restart' | 'reload' | 'status'
export type LogSource = 'journal' | 'unit' | 'file'
export type LogRequest = { source: LogSource; unit?: string; path?: string; lines?: number; sudo?: boolean }
export type ExecOutcome = { code: number | null; output: string; timedOut: boolean }
export type LogLevel = 'error' | 'warn' | 'info'

export const PROCESS_LIST_CMD = 'LC_ALL=C ps -eo pid=,user=,pcpu=,pmem=,rss=,etime=,args= --sort=-pcpu 2>/dev/null | head -n 300'
export const SERVICE_LIST_CMD = 'LC_ALL=C systemctl list-units --type=service --all --no-pager --no-legend --plain 2>&1'
export const PORTS_CMD = 'LC_ALL=C ss -Htulnp 2>/dev/null || LC_ALL=C netstat -tulnp 2>/dev/null'
export const LOG_PRESETS: ReadonlyArray<string> = [
  '/var/log/syslog',
  '/var/log/messages',
  '/var/log/auth.log',
  '/var/log/secure',
  '/var/log/nginx/error.log',
  '/var/log/nginx/access.log',
  '/var/log/kern.log',
  '/var/log/dmesg'
]

const sudoPrefix = (sudo?: boolean) => (sudo ? 'sudo -n ' : '')

export function parseProcessList(text: string): ProcInfo[] {
  const out: ProcInfo[] = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(raw)
    if (!m) continue
    out.push({ pid: Number(m[1]), user: m[2], cpu: Number(m[3]), mem: Number(m[4]), rssKb: Number(m[5]), etime: m[6], command: m[7] })
  }
  return out
}

export type ProcSort = 'cpu' | 'mem' | 'pid'
/** Filter by substring (command, user or pid) and sort; returns a new array. */
export function filterProcesses(list: ProcInfo[], query: string, sort: ProcSort = 'cpu'): ProcInfo[] {
  const q = query.trim().toLowerCase()
  const hit = q ? list.filter((p) => p.command.toLowerCase().includes(q) || p.user.toLowerCase() === q || String(p.pid) === q) : list.slice()
  const key: Record<ProcSort, (a: ProcInfo, b: ProcInfo) => number> = {
    cpu: (a, b) => b.cpu - a.cpu || b.mem - a.mem,
    mem: (a, b) => b.mem - a.mem || b.rssKb - a.rssKb,
    pid: (a, b) => a.pid - b.pid
  }
  return hit.sort(key[sort])
}

export function isValidPid(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 1 && pid < 2 ** 22
}

export function buildKillCommand(pid: unknown, signal: unknown, sudo?: boolean): string {
  if (!isValidPid(pid)) throw new Error('invalid-pid')
  if (signal !== 'TERM' && signal !== 'KILL' && signal !== 'HUP') throw new Error('invalid-signal')
  return `${sudoPrefix(sudo)}kill -${signal} ${pid} 2>&1`
}

export function parseServiceList(text: string): ServiceInfo[] {
  const out: ServiceInfo[] = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/^[\s●*×]+/, '')
    const m = /^(\S+\.service)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line)
    if (!m) continue
    out.push({ unit: m[1], load: m[2], active: m[3], sub: m[4], description: m[5].trim() })
  }
  return out
}

export type ServiceFilter = 'all' | 'running' | 'failed' | 'inactive'
export function filterServices(list: ServiceInfo[], query: string, filter: ServiceFilter = 'all'): ServiceInfo[] {
  const q = query.trim().toLowerCase()
  return list.filter((s) => {
    if (filter === 'running' && s.sub !== 'running') return false
    if (filter === 'failed' && s.active !== 'failed') return false
    if (filter === 'inactive' && s.active !== 'inactive') return false
    return !q || s.unit.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  })
}

export function isValidUnitName(unit: unknown): unit is string {
  return typeof unit === 'string' && unit.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9@._:\\-]*\.service$/.test(unit)
}

export function buildServiceCommand(unit: unknown, action: unknown, sudo?: boolean): string {
  if (!isValidUnitName(unit)) throw new Error('invalid-unit')
  if (action === 'status') return `LC_ALL=C SYSTEMD_COLORS=0 systemctl status --no-pager --lines=30 -- '${unit}' 2>&1`
  if (action !== 'start' && action !== 'stop' && action !== 'restart' && action !== 'reload') throw new Error('invalid-action')
  return `${sudoPrefix(sudo)}systemctl ${action} -- '${unit}' 2>&1`
}

function splitHostPort(s: string): { address: string; port: number } | null {
  const i = s.lastIndexOf(':')
  if (i < 0) return null
  const port = Number(s.slice(i + 1))
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  let address = s.slice(0, i).replace(/^\[|\]$/g, '').replace(/%[^%]*$/, '')
  if (address === '' || address === '*') address = '0.0.0.0'
  return { address, port }
}

/** Parses `ss -Htulnp` (preferred) or `netstat -tulnp` output into unique listening sockets sorted by port. */
export function parseListenPorts(text: string): ListenPort[] {
  const seen = new Map<string, ListenPort>()
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const tok = raw.trim().split(/\s+/)
    if (tok.length < 5) continue
    const proto0 = tok[0].toLowerCase()
    if (!/^(tcp|udp)6?$/.test(proto0)) continue
    const proto = proto0.startsWith('tcp') ? 'tcp' : 'udp'
    let local: string, rest: string
    if (/^\d+$/.test(tok[1]) && /^\d+$/.test(tok[2])) {
      // netstat: Proto Recv-Q Send-Q Local Foreign [State] PID/Program
      local = tok[3]
      if (proto === 'tcp' && tok[5] && tok[5] !== 'LISTEN') continue
      rest = tok.slice(proto === 'tcp' ? 6 : 5).join(' ')
    } else {
      // ss: Netid State Recv-Q Send-Q Local Peer Process
      if (proto === 'tcp' && tok[1] !== 'LISTEN') continue
      local = tok[4]
      rest = tok.slice(6).join(' ')
    }
    const hp = splitHostPort(local)
    if (!hp) continue
    const item: ListenPort = { proto, ...hp }
    const ssm = /\(\("([^"]+)",pid=(\d+)/.exec(rest)
    const nsm = /^(\d+)\/(\S+)/.exec(rest)
    if (ssm) Object.assign(item, { process: ssm[1], pid: Number(ssm[2]) })
    else if (nsm) Object.assign(item, { process: nsm[2], pid: Number(nsm[1]) })
    const k = `${proto}|${item.address}|${item.port}`
    if (!seen.has(k)) seen.set(k, item)
  }
  return [...seen.values()].sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto) || a.address.localeCompare(b.address))
}

/** Remote host to forward to for a listening socket (wildcards become loopback). */
export function forwardTargetHost(address: string): string {
  if (address === '0.0.0.0' || address === '::' || address === '*') return '127.0.0.1'
  if (address === '::1') return '::1'
  return address
}

/** Suggested local port for forwarding a remote port (privileged ports move to 10000+). */
export function suggestLocalPort(remotePort: number): number {
  return remotePort >= 1024 ? remotePort : 10000 + remotePort
}

export function isValidLogPath(p: unknown): p is string {
  return typeof p === 'string' && p.length <= 300 && /^\/[A-Za-z0-9._\/@+-]+$/.test(p) && !p.split('/').includes('..')
}

export function clampLogLines(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 200
  return Math.max(10, Math.min(2000, v))
}

export function buildLogCommand(req: LogRequest): string {
  const n = clampLogLines(req.lines)
  const pre = sudoPrefix(req.sudo)
  if (req.source === 'journal') return `${pre}journalctl --no-pager -o short-iso -n ${n} 2>&1`
  if (req.source === 'unit') {
    if (!isValidUnitName(req.unit)) throw new Error('invalid-unit')
    return `${pre}journalctl --no-pager -o short-iso -n ${n} -u '${req.unit}' 2>&1`
  }
  if (req.source === 'file') {
    if (!isValidLogPath(req.path)) throw new Error('invalid-path')
    return `${pre}tail -n ${n} -- '${req.path}' 2>&1`
  }
  throw new Error('invalid-source')
}

export function logLevel(line: string): LogLevel {
  if (/\b(error|err|fatal|crit(ical)?|panic|emerg|alert|failed|failure|denied)\b/i.test(line)) return 'error'
  if (/\b(warn(ing)?|deprecated|timeout|timed out|retry)\b/i.test(line)) return 'warn'
  return 'info'
}

export type LogFilter = { query: string; level?: 'all' | 'warn' | 'error' }
/** Keeps lines matching the (case-insensitive) query and minimum level. */
export function filterLogLines(text: string, f: LogFilter): string[] {
  const q = f.query.trim().toLowerCase()
  const min = f.level ?? 'all'
  return String(text ?? '')
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .filter((l) => !q || l.toLowerCase().includes(q))
    .filter((l) => {
      if (min === 'all') return true
      const lv = logLevel(l)
      return min === 'error' ? lv === 'error' : lv !== 'info'
    })
}

/** Splits a line into plain / highlighted pieces for a case-insensitive query. */
export function highlightSegments(line: string, query: string): Array<{ text: string; hit: boolean }> {
  const q = query.trim()
  if (!q) return [{ text: line, hit: false }]
  const out: Array<{ text: string; hit: boolean }> = []
  const lower = line.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  for (;;) {
    const j = lower.indexOf(ql, i)
    if (j < 0) break
    if (j > i) out.push({ text: line.slice(i, j), hit: false })
    out.push({ text: line.slice(j, j + q.length), hit: true })
    i = j + q.length
  }
  if (i < line.length) out.push({ text: line.slice(i), hit: false })
  return out
}

/** SVG polyline points for values in 0..100 drawn into a w×h box (oldest left). */
export function sparklinePoints(values: number[], w: number, h: number): string {
  if (values.length === 0) return ''
  if (values.length === 1) values = [values[0], values[0]]
  const step = values.length > 1 ? w / (values.length - 1) : 0
  return values
    .map((v, i) => {
      const c = Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0))
      const x = values.length > 1 ? i * step : w
      const y = h - (c / 100) * h
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
    })
    .join(' ')
}

/** Pushes a sample keeping at most `max` entries (returns a new array). */
export function pushSample<T>(list: T[], sample: T, max = 60): T[] {
  const next = list.concat([sample])
  return next.length > max ? next.slice(next.length - max) : next
}

/** Maps raw stderr from a toolbox command to a short reason code. */
export function classifyToolError(output: string): 'sudo-password' | 'permission' | 'not-found' | 'no-systemd' | null {
  const o = output.toLowerCase()
  if (o.includes('a password is required') || o.includes('sudo: a terminal is required')) return 'sudo-password'
  if (o.includes('system has not been booted with systemd') || o.includes('systemctl: command not found') || o.includes('systemctl: not found')) return 'no-systemd'
  if (o.includes('operation not permitted') || o.includes('permission denied') || o.includes('access denied') || o.includes('interactive authentication required')) return 'permission'
  if (o.includes('no such file') || o.includes('not found') || o.includes('no such process')) return 'not-found'
  return null
}
