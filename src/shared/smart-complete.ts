/** X1 command-history completion. Terminal Tab is never consumed. */

export type HistorySource = 'host' | 'common' | 'snippet'

export type HistoryEntry = {
  command: string
  hostKey: string
  count: number
  lastUsed: number
}

export type Suggestion = {
  command: string
  source: HistorySource
  count: number
  lastUsed: number
}

export type SmartPrefs = {
  enabled: boolean
  ghost: boolean
  sourceHost: boolean
  sourceCommon: boolean
  sourceSnippets: boolean
  autoResume: boolean
}

export const SMART_PREFS_DEFAULT: SmartPrefs = {
  enabled: true,
  ghost: true,
  sourceHost: true,
  sourceCommon: true,
  sourceSnippets: true,
  autoResume: true
}

/** Twenty everyday commands so the demo host can show completion immediately. */
export const DEMO_HISTORY_COMMANDS: readonly string[] = [
  'ls -la',
  'pwd',
  'cd /var/log',
  'tail -n 100 /var/log/syslog',
  'df -h',
  'free -h',
  'uptime',
  'ps aux | head',
  'ss -ltnp',
  'ss -ltnp | grep :80',
  'journalctl -u nginx -n 50',
  'systemctl status nginx',
  'docker ps',
  'git status',
  'git pull',
  'cat /etc/os-release',
  'whoami',
  'uname -a',
  'du -sh * | sort -h',
  'grep -R "error" /var/log | head'
]

export type KeyAction = 'passthrough' | 'accept-ghost'

/**
 * Terminal focus: Tab always reaches the shell.
 * Ghost text is accepted with End, or → when the cursor is at the end of the line.
 */
export function terminalKeyAction(key: string, opts: { atEnd: boolean; hasGhost: boolean }): KeyAction {
  if (key === 'Tab') return 'passthrough'
  if (!opts.hasGhost) return 'passthrough'
  if (key === 'End') return 'accept-ghost'
  if (key === 'ArrowRight' && opts.atEnd) return 'accept-ghost'
  return 'passthrough'
}

/** Pull the command being typed after a bash/zsh-style prompt. Null when no prompt is on the line. */
export function extractPromptCommand(lineBeforeCursor: string): string | null {
  const line = String(lineBeforeCursor ?? '').replace(/\s+$/, '')
  const m = /(?:^|[\s~\]:])(?:\$|#|%|❯)\s?(.*)$/.exec(line)
  if (!m) return null
  return m[1] ?? ''
}

export function ghostSuffix(query: string, commands: string[]): string | null {
  const q = query
  if (!q) return null
  const hit = commands.find((c) => c.startsWith(q) && c.length > q.length)
  return hit ? hit.slice(q.length) : null
}

export function highlightMatch(command: string, query: string): { before: string; match: string; after: string } {
  const q = query.trim()
  const i = q ? command.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return { before: command, match: '', after: '' }
  return { before: command.slice(0, i), match: command.slice(i, i + q.length), after: command.slice(i + q.length) }
}

export function rankSuggestions(input: {
  query: string
  hostKey: string
  entries: HistoryEntry[]
  snippets?: { command: string }[]
  sources?: { host?: boolean; common?: boolean; snippets?: boolean }
  limit?: number
  minChars?: number
}): Suggestion[] {
  const q = input.query.trim().toLowerCase()
  const min = input.minChars ?? 2
  if (q.length < min) return []
  const sources = {
    host: input.sources?.host !== false,
    common: input.sources?.common !== false,
    snippets: input.sources?.snippets !== false
  }
  const limit = Math.min(6, Math.max(1, input.limit ?? 6))
  type Acc = Suggestion & { hostCount: number; globalCount: number }
  const map = new Map<string, Acc>()
  const touch = (command: string, source: HistorySource, count: number, lastUsed: number, hostHit: boolean) => {
    const prev = map.get(command)
    if (!prev) {
      map.set(command, {
        command,
        source,
        count,
        lastUsed,
        hostCount: hostHit ? count : 0,
        globalCount: count
      })
      return
    }
    prev.globalCount += count
    if (hostHit) {
      prev.hostCount += count
      prev.source = 'host'
      prev.lastUsed = Math.max(prev.lastUsed, lastUsed)
      prev.count = prev.hostCount
    } else if (prev.source !== 'host') {
      prev.count = prev.globalCount
      prev.lastUsed = Math.max(prev.lastUsed, lastUsed)
    }
  }
  for (const e of input.entries) {
    const cmd = e.command
    if (!cmd || cmd.toLowerCase() === q) continue
    const lower = cmd.toLowerCase()
    if (!lower.startsWith(q) && !lower.includes(q)) continue
    const hostHit = Boolean(input.hostKey) && e.hostKey === input.hostKey
    if (hostHit && sources.host) touch(cmd, 'host', e.count || 1, e.lastUsed || 0, true)
    else if (!hostHit && sources.common) touch(cmd, 'common', e.count || 1, e.lastUsed || 0, false)
    else if (hostHit && !sources.host && sources.common) touch(cmd, 'common', e.count || 1, e.lastUsed || 0, false)
  }
  if (sources.snippets) {
    for (const s of input.snippets ?? []) {
      const cmd = String(s.command ?? '').trim()
      if (!cmd || cmd.includes('\n') || cmd.toLowerCase() === q) continue
      const lower = cmd.toLowerCase()
      if (!lower.startsWith(q) && !lower.includes(q)) continue
      if (!map.has(cmd)) {
        map.set(cmd, { command: cmd, source: 'snippet', count: 0, lastUsed: 0, hostCount: 0, globalCount: 0 })
      }
    }
  }
  const list = [...map.values()]
  list.sort((a, b) => {
    const tier = (s: Acc) => (s.source === 'host' ? 0 : s.source === 'common' ? 1 : 2)
    const ta = tier(a)
    const tb = tier(b)
    if (ta !== tb) return ta - tb
    if (a.source === 'host' && b.source === 'host') {
      if (b.lastUsed !== a.lastUsed) return b.lastUsed - a.lastUsed
      return b.hostCount - a.hostCount
    }
    return b.globalCount - a.globalCount || a.command.localeCompare(b.command)
  })
  return list.slice(0, limit).map(({ command, source, count, lastUsed }) => ({ command, source, count, lastUsed }))
}

export function normalizeSmartPrefs(raw: unknown): SmartPrefs {
  const d = SMART_PREFS_DEFAULT
  if (!raw || typeof raw !== 'object') return { ...d }
  const o = raw as Partial<SmartPrefs>
  return {
    enabled: o.enabled !== false,
    ghost: o.ghost !== false,
    sourceHost: o.sourceHost !== false,
    sourceCommon: o.sourceCommon !== false,
    sourceSnippets: o.sourceSnippets !== false,
    autoResume: o.autoResume !== false
  }
}
