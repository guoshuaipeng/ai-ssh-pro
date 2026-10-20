import type { ProbeStatus, UpdateChannel, UpdateSourceId } from '@shared/update-channel'

/** V2: once-a-day silent update check + "skip this version" memory. */
const CHECKED_AT = 'aiss.updateCheckedAt'
const SKIP = 'aiss.skipVersion'
const AUTO = 'aiss.update.auto'
export const UPDATE_CACHE_KEY = 'aiss.update.cache'
const DAY = 24 * 60 * 60 * 1000

export type CachedUpdateResult = {
  at: number
  currentVersion: string
  status: ProbeStatus
  latestVersion?: string
  releaseUrl?: string
  downloadUrl?: string
  pan123Url?: string
  releaseName?: string
  notes?: string
  source?: UpdateSourceId
  channel?: UpdateChannel
  message?: string
}

export function loadAutoUpdate(store: Pick<Storage, 'getItem'> = localStorage): boolean {
  return store.getItem(AUTO) !== '0'
}

export function saveAutoUpdate(on: boolean, store: Pick<Storage, 'setItem'> = localStorage): void {
  store.setItem(AUTO, on ? '1' : '0')
}

export function shouldAutoCheck(now = Date.now(), store: Pick<Storage, 'getItem'> = localStorage): boolean {
  if (store.getItem(AUTO) === '0') return false
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

export function loadUpdateCache(store: Pick<Storage, 'getItem'> = localStorage): CachedUpdateResult | null {
  try {
    const raw = store.getItem(UPDATE_CACHE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<CachedUpdateResult>
    if (typeof o.at !== 'number' || !o.currentVersion || !o.status) return null
    return o as CachedUpdateResult
  } catch {
    return null
  }
}

export function saveUpdateCache(
  result: Omit<CachedUpdateResult, 'at'> & { at?: number },
  store: Pick<Storage, 'setItem'> = localStorage,
  now = Date.now()
): CachedUpdateResult {
  const cached: CachedUpdateResult = { ...result, at: result.at ?? now }
  store.setItem(UPDATE_CACHE_KEY, JSON.stringify(cached))
  return cached
}

/** 「上次 · N 分钟前」— shown with cached results, never a loading spinner. */
export function formatCacheAge(at: number, now = Date.now(), locale = 'zh-CN'): string {
  const mins = Math.max(0, Math.floor((now - at) / 60_000))
  if (locale === 'zh-CN') {
    if (mins < 1) return '上次 · 刚刚'
    if (mins < 60) return `上次 · ${mins} 分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `上次 · ${hours} 小时前`
    return `上次 · ${Math.floor(hours / 24)} 天前`
  }
  if (mins < 1) return 'Last check · just now'
  if (mins < 60) return `Last check · ${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Last check · ${hours} h ago`
  return `Last check · ${Math.floor(hours / 24)} d ago`
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
