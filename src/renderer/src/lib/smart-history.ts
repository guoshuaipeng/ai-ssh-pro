import { isSensitiveCommand, normalizeCommandLine } from '@shared/workspace-features'
import {
  DEMO_HISTORY_COMMANDS,
  normalizeSmartPrefs,
  type HistoryEntry,
  type SmartPrefs,
  SMART_PREFS_DEFAULT
} from '@shared/smart-complete'

const HIST_KEY = 'aiss.smartHistory'
const PREF_KEY = 'aiss.smartPrefs'
export const SMART_PREFS_EVENT = 'aiss-smart-prefs'

export function loadSmartPrefs(): SmartPrefs {
  try {
    return normalizeSmartPrefs(JSON.parse(localStorage.getItem(PREF_KEY) || 'null'))
  } catch {
    return { ...SMART_PREFS_DEFAULT }
  }
}

export function saveSmartPrefs(next: SmartPrefs): SmartPrefs {
  const value = normalizeSmartPrefs(next)
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(SMART_PREFS_EVENT, { detail: value }))
  return value
}

export function loadSmartHistory(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HIST_KEY) || '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((x) => x && typeof x === 'object' && typeof (x as HistoryEntry).command === 'string')
      .map((x) => {
        const e = x as HistoryEntry
        return {
          command: e.command,
          hostKey: typeof e.hostKey === 'string' ? e.hostKey : '',
          count: typeof e.count === 'number' ? e.count : 1,
          lastUsed: typeof e.lastUsed === 'number' ? e.lastUsed : 0,
          ...(typeof e.lastExit === 'number' ? { lastExit: e.lastExit } : {})
        }
      })
  } catch {
    return []
  }
}

export function saveSmartHistory(entries: HistoryEntry[]): void {
  save(entries)
}

function save(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(entries.slice(0, 2000)))
  } catch {
    /* ignore */
  }
}

export function recordSmartCommand(hostKey: string, command: string): HistoryEntry[] {
  const cmd = normalizeCommandLine(command)
  if (!cmd || isSensitiveCommand(cmd) || /^[ \t]/.test(command)) return loadSmartHistory()
  const all = loadSmartHistory()
  const i = all.findIndex((e) => e.hostKey === hostKey && e.command === cmd)
  if (i >= 0) {
    const prev = all[i]!
    all.splice(i, 1)
    all.unshift({ ...prev, count: prev.count + 1, lastUsed: Date.now() })
    // D22: lastExit stays until this run reports its own code
  } else {
    all.unshift({ command: cmd, hostKey, count: 1, lastUsed: Date.now() })
  }
  save(all)
  return all
}

export function clearHostHistory(hostKey: string): { removed: number; left: HistoryEntry[]; dropped: HistoryEntry[] } {
  const all = loadSmartHistory()
  const dropped = all.filter((e) => e.hostKey === hostKey)
  const left = all.filter((e) => e.hostKey !== hostKey)
  save(left)
  return { removed: dropped.length, left, dropped }
}

export function restoreSmartEntries(entries: HistoryEntry[]): void {
  if (!entries.length) return
  const all = loadSmartHistory()
  const key = (e: HistoryEntry) => `${e.hostKey}\0${e.command}`
  const seen = new Set(all.map(key))
  save([...entries.filter((e) => !seen.has(key(e))), ...all])
}

export function countHostHistory(hostKey: string): number {
  return loadSmartHistory().filter((e) => e.hostKey === hostKey).length
}

export function seedDemoHistory(hostKey: string): HistoryEntry[] {
  const all = loadSmartHistory()
  if (all.some((e) => e.hostKey === hostKey)) return all
  const now = Date.now()
  const seeded: HistoryEntry[] = DEMO_HISTORY_COMMANDS.map((command, i) => ({
    command,
    hostKey,
    count: DEMO_HISTORY_COMMANDS.length - i,
    lastUsed: now - i * 60_000
  }))
  const next = [...seeded, ...all].slice(0, 2000)
  save(next)
  return next
}
