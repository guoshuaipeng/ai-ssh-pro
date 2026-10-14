/** V2: once-a-day silent update check + "skip this version" memory. */
const CHECKED_AT = 'aiss.updateCheckedAt'
const SKIP = 'aiss.skipVersion'
const DAY = 24 * 60 * 60 * 1000

export function shouldAutoCheck(now = Date.now(), store: Pick<Storage, 'getItem'> = localStorage): boolean {
  const last = Number(store.getItem(CHECKED_AT) || 0)
  return !Number.isFinite(last) || now - last >= DAY
}

export function markChecked(now = Date.now(), store: Pick<Storage, 'setItem'> = localStorage): void {
  store.setItem(CHECKED_AT, String(now))
}

export function isSkipped(version: string, store: Pick<Storage, 'getItem'> = localStorage): boolean {
  return Boolean(version) && store.getItem(SKIP) === version
}

export function skipVersion(version: string, store: Pick<Storage, 'setItem'> = localStorage): void {
  store.setItem(SKIP, version)
}

/** First ≤5 bullet lines of release notes, without markdown markers. */
export function summarizeNotes(notes: string | undefined, max = 5): string[] {
  if (!notes) return []
  return notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, max)
}
