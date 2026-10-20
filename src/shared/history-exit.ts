/** D22: history knows whether a command last failed, and ↑ walks this host's commands first. */
import type { HistoryEntry } from './smart-complete'

/** Record the exit code of the latest run of (host, command). Same array back when nothing matched. */
export function withExit<T extends HistoryEntry>(entries: T[], hostKey: string, command: string, code: number): T[] {
  const cmd = command.trim()
  const i = entries.findIndex((e) => e.hostKey === hostKey && e.command === cmd)
  if (i < 0 || entries[i]!.lastExit === code) return entries
  const next = entries.slice()
  next[i] = { ...entries[i]!, lastExit: code }
  return next
}

/** Last exit code for this command (this host first, else any host). */
export function lastExitOf(entries: HistoryEntry[], hostKey: string, command: string): number | undefined {
  const cmd = command.trim()
  const own = entries.find((e) => e.hostKey === hostKey && e.command === cmd)
  if (own) return own.lastExit
  return entries.find((e) => e.command === cmd && typeof e.lastExit === 'number')?.lastExit
}

/** ↑ / ↓ order: this host's commands (newest first), then the global list without duplicates. */
export function upHistoryList(hostKey: string, entries: HistoryEntry[], global: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  if (hostKey) {
    for (const e of [...entries].filter((x) => x.hostKey === hostKey).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))) {
      if (seen.has(e.command)) continue
      seen.add(e.command)
      out.push(e.command)
    }
  }
  for (const c of global) {
    if (seen.has(c)) continue
    seen.add(c)
    out.push(c)
  }
  return out
}
