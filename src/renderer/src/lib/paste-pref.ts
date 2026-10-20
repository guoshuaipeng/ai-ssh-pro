/** D7b: per-host "don't ask again" for multi-line paste, and which hosts are strict (production / read-only). */
import { PASTE_SKIP_KEY, parseSkipHosts, withSkipHost } from '@shared/paste-skip'

let strict = new Set<string>()

export function setStrictPasteHosts(keys: Iterable<string>): void {
  strict = new Set(keys)
}

export function isStrictPasteHost(hostKey: string): boolean {
  return strict.has(hostKey)
}

export function pasteSkipHost(hostKey: string): boolean {
  if (!hostKey || strict.has(hostKey)) return false
  try {
    return parseSkipHosts(localStorage.getItem(PASTE_SKIP_KEY)).includes(hostKey)
  } catch {
    return false
  }
}

/** D7c: hosts that skip the multi-line paste preview (for the settings list) */
export function listPasteSkipHosts(): string[] {
  try {
    return parseSkipHosts(localStorage.getItem(PASTE_SKIP_KEY))
  } catch {
    return []
  }
}

export function setPasteSkipHost(hostKey: string, on: boolean): void {
  try {
    const next = withSkipHost(parseSkipHosts(localStorage.getItem(PASTE_SKIP_KEY)), hostKey, on)
    localStorage.setItem(PASTE_SKIP_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}
