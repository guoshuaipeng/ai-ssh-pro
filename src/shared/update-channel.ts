/**
 * v0.7.0: official update.json first, GitHub Releases as fallback.
 * Gitee is no longer an update probe. Download URLs always come from the source that answered.
 */
export type UpdateChannel = 'auto' | 'official' | 'github' | 'custom'
export type UpdateSourceId = 'official' | 'github' | 'custom'

export const SOURCE_TIMEOUT_MS = 8_000
export const AUTO_BUDGET_MS = 16_000

export const GITHUB_REPO_URL = 'https://github.com/guoshuaipeng/ai-ssh-pro'
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`
export const GITHUB_LATEST_API = 'https://api.github.com/repos/guoshuaipeng/ai-ssh-pro/releases/latest'
export const GITEE_REPO_URL = 'https://gitee.com/guoshuaipeng/ai-ssh-pro'
export const GITEE_RELEASES_URL = `${GITEE_REPO_URL}/releases`
export const OFFICIAL_SITE_URL = 'https://guoshuaipeng.github.io/ai-ssh-pro/'
export const OFFICIAL_UPDATE_JSON = `${OFFICIAL_SITE_URL}update.json`

export const UPDATE_CHANNEL_KEY = 'aiss.update.channel'
export const UPDATE_MIRROR_KEY = 'aiss.update.mirror'
export const UPDATE_LAST_KEY = 'aiss.update.last'

export type UpdateChannelPrefs = { channel: UpdateChannel; mirror: string }

/** Stored "gitee" (404 API) migrates to auto. */
export function normalizeChannel(raw: unknown): UpdateChannel {
  if (raw === 'gitee') return 'auto'
  return raw === 'official' || raw === 'github' || raw === 'custom' || raw === 'auto' ? raw : 'auto'
}

export function loadUpdateChannelPrefs(store: Pick<Storage, 'getItem'> = globalThis.localStorage): UpdateChannelPrefs {
  try {
    return {
      channel: normalizeChannel(store.getItem(UPDATE_CHANNEL_KEY)),
      mirror: (store.getItem(UPDATE_MIRROR_KEY) || '').trim()
    }
  } catch {
    return { channel: 'auto', mirror: '' }
  }
}

export function saveUpdateChannelPrefs(
  prefs: UpdateChannelPrefs,
  store: Pick<Storage, 'setItem'> = globalThis.localStorage
): void {
  store.setItem(UPDATE_CHANNEL_KEY, normalizeChannel(prefs.channel))
  store.setItem(UPDATE_MIRROR_KEY, prefs.mirror.trim())
}

export type LastUpdateSource = { source: UpdateSourceId; channel: UpdateChannel; at: number }

export function rememberUpdateSource(info: LastUpdateSource, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  try {
    store.setItem(UPDATE_LAST_KEY, JSON.stringify(info))
  } catch {
    /* ignore */
  }
}

function asSourceId(raw: unknown): UpdateSourceId | null {
  return raw === 'official' || raw === 'github' || raw === 'custom' ? raw : null
}

export function loadLastUpdateSource(store: Pick<Storage, 'getItem'> = globalThis.localStorage): LastUpdateSource | null {
  try {
    const raw = store.getItem(UPDATE_LAST_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<LastUpdateSource>
    const source = asSourceId(o.source)
    if (!source) return null
    return { source, channel: normalizeChannel(o.channel), at: typeof o.at === 'number' ? o.at : 0 }
  } catch {
    return null
  }
}

export function sourceLabel(id: UpdateSourceId | UpdateChannel, locale: string): string {
  const zh = locale === 'zh-CN'
  if (id === 'official') return zh ? '官网清单' : 'Official manifest'
  if (id === 'github') return 'GitHub'
  if (id === 'custom') return zh ? '自定义清单' : 'Custom manifest'
  return zh ? '自动（官网 → GitHub）' : 'Auto (official → GitHub)'
}

/**
 * Presentation only. Shows the source that last answered when Auto has one,
 * otherwise the channel the user selected. Does not choose a new protocol.
 */
export function effectiveChannelLabel(
  locale: string,
  store: Pick<Storage, 'getItem'> = globalThis.localStorage
): string {
  const prefs = loadUpdateChannelPrefs(store)
  const last = loadLastUpdateSource(store)
  if (prefs.channel === 'auto' && last) return sourceLabel(last.source, locale)
  if (last && last.source === prefs.channel) return sourceLabel(last.source, locale)
  return sourceLabel(prefs.channel, locale)
}

/** Compare dotted versions; returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const pa = a
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((x) => Number.parseInt(x, 10))
  const pb = b
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((x) => Number.parseInt(x, 10))
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i]! : 0
    const y = Number.isFinite(pb[i]) ? pb[i]! : 0
    if (x !== y) return x - y
  }
  return 0
}

export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export type PlannedSource = { id: UpdateSourceId; url: string }

export function planSources(
  channel: UpdateChannel,
  customUrl?: string,
  endpoints?: { official?: string; github?: string; gitee?: string }
): PlannedSource[] {
  const official = endpoints?.official || OFFICIAL_UPDATE_JSON
  const github = endpoints?.github || GITHUB_LATEST_API
  const next = normalizeChannel(channel)
  if (next === 'official') return [{ id: 'official', url: official }]
  if (next === 'github') return [{ id: 'github', url: github }]
  if (next === 'custom') {
    const url = (customUrl || '').trim()
    return url && isHttpUrl(url) ? [{ id: 'custom', url }] : []
  }
  return [
    { id: 'official', url: official },
    { id: 'github', url: github }
  ]
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function pickDownloadUrl(assets: unknown, platform: string): string | undefined {
  if (!Array.isArray(assets)) return undefined
  const names = assets
    .map((a) => {
      if (!a || typeof a !== 'object') return null
      const o = a as Record<string, unknown>
      const name = typeof o.name === 'string' ? o.name : ''
      const url =
        (typeof o.browser_download_url === 'string' && o.browser_download_url) ||
        (typeof o.download_url === 'string' && o.download_url) ||
        (typeof o.url === 'string' && /^https?:\/\//i.test(o.url) ? o.url : '')
      if (!name || !url) return null
      return { name: name.toLowerCase(), url }
    })
    .filter(Boolean) as Array<{ name: string; url: string }>

  if (platform === 'win32') {
    const setup = names.find((a) => a.name.endsWith('.exe') && /setup|installer|nsis/i.test(a.name))
    if (setup) return setup.url
    const exe = names.find((a) => a.name.endsWith('.exe'))
    if (exe) return exe.url
  }
  if (platform === 'darwin') {
    const dmg = names.find((a) => a.name.endsWith('.dmg'))
    if (dmg) return dmg.url
  }
  if (platform === 'linux') {
    const appImage = names.find((a) => a.name.endsWith('.appimage'))
    if (appImage) return appImage.url
    const deb = names.find((a) => a.name.endsWith('.deb'))
    if (deb) return deb.url
  }
  return names[0]?.url
}

function releasePage(source: UpdateSourceId, tag: string, htmlUrl: string | undefined, requestUrl: string): string {
  if (htmlUrl && isHttpUrl(htmlUrl)) return htmlUrl
  if (source === 'github') return `${GITHUB_RELEASES_URL}/tag/${tag}`
  if (source === 'official') return OFFICIAL_SITE_URL
  return requestUrl
}

function platformDownloads(downloads: unknown, platform: string): Record<string, unknown> | null {
  if (!downloads || typeof downloads !== 'object') return null
  const map = downloads as Record<string, unknown>
  const aliases: Record<string, string[]> = {
    win32: ['win32', 'win', 'windows'],
    darwin: ['darwin', 'mac', 'macos', 'osx'],
    linux: ['linux']
  }
  for (const key of aliases[platform] || [platform]) {
    const hit = map[key]
    if (hit && typeof hit === 'object') return hit as Record<string, unknown>
  }
  return null
}

function pickPan123(data: Record<string, unknown>, platform: string): string | undefined {
  const plat = platformDownloads(data.downloads, platform)
  const fromPlat = str(plat?.pan123) || str(plat?.['123pan']) || str(plat?.cloud123)
  if (fromPlat) return fromPlat
  const top = data.pan123
  if (typeof top === 'string') return str(top)
  if (top && typeof top === 'object') return str((top as Record<string, unknown>).url)
  return str(data.pan123Url)
}

export type NormalizedRelease = {
  source: UpdateSourceId
  version: string
  tag: string
  releaseUrl: string
  downloadUrl?: string
  pan123Url?: string
  releaseName?: string
  notes?: string
}

function looksLikeOfficialManifest(data: Record<string, unknown>): boolean {
  return Boolean(str(data.version) && (data.downloads || data.notes || data.pan123))
}

/** Parse one release document. Download URL is taken only from this document. */
export function normalizeRelease(
  source: UpdateSourceId,
  data: Record<string, unknown>,
  requestUrl: string,
  platform: string
): NormalizedRelease | null {
  if (source === 'official' || looksLikeOfficialManifest(data)) {
    const version = (str(data.version) || str(data.tag_name) || '').replace(/^v/i, '')
    if (!version) return null
    const plat = platformDownloads(data.downloads, platform)
    const downloadUrl =
      str(plat?.github) || str(plat?.url) || str(plat?.download) || pickDownloadUrl(data.assets, platform)
    const notes = str(data.notes) || str(data.body)
    const tag = str(data.tag_name) || `v${version}`
    return {
      source: source === 'custom' ? 'custom' : source === 'github' ? 'github' : 'official',
      version,
      tag,
      releaseUrl: releasePage(source === 'custom' ? 'custom' : source, tag, str(data.htmlUrl) || str(data.html_url), requestUrl),
      downloadUrl,
      pan123Url: pickPan123(data, platform),
      releaseName: str(data.name),
      notes: notes ? notes.slice(0, 8000) : undefined
    }
  }
  const tag = typeof data.tag_name === 'string' ? data.tag_name.trim() : ''
  const version = tag.replace(/^v/i, '')
  if (!version) return null
  const html = typeof data.html_url === 'string' ? data.html_url : undefined
  const notes = typeof data.body === 'string' ? data.body.slice(0, 8000) : undefined
  const releaseName = typeof data.name === 'string' ? data.name : undefined
  return {
    source,
    version,
    tag: tag || version,
    releaseUrl: releasePage(source, tag || version, html, requestUrl),
    downloadUrl: pickDownloadUrl(data.assets, platform),
    pan123Url: pickPan123(data, platform),
    releaseName,
    notes
  }
}

export type ProbeStatus = 'upToDate' | 'available' | 'noRelease' | 'error'

export type ProbeResult = {
  currentVersion: string
  status: ProbeStatus
  source?: UpdateSourceId
  channel: UpdateChannel
  latestVersion?: string
  releaseUrl?: string
  downloadUrl?: string
  pan123Url?: string
  releaseName?: string
  notes?: string
  message: string
  /** sources that were actually contacted, in order */
  tried: UpdateSourceId[]
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function fetchSource(
  url: string,
  timeoutMs: number,
  currentVersion: string,
  fetchImpl: FetchLike,
  budget: AbortSignal
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const onBudget = () => ctrl.abort()
  if (budget.aborted) ctrl.abort()
  else budget.addEventListener('abort', onBudget)
  try {
    return await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json, application/json',
        'User-Agent': `AI-SSH-Pro/${currentVersion}`
      },
      signal: ctrl.signal
    })
  } finally {
    clearTimeout(timer)
    budget.removeEventListener('abort', onBudget)
  }
}

function fromRelease(
  currentVersion: string,
  channel: UpdateChannel,
  rel: NormalizedRelease,
  tried: UpdateSourceId[]
): ProbeResult {
  const newer = compareSemver(rel.version, currentVersion) > 0
  return {
    currentVersion,
    status: newer ? 'available' : 'upToDate',
    source: rel.source,
    channel,
    latestVersion: rel.version,
    releaseUrl: rel.releaseUrl,
    downloadUrl: rel.downloadUrl,
    pan123Url: rel.pan123Url,
    releaseName: rel.releaseName,
    notes: rel.notes,
    tried,
    message: newer
      ? `发现新版本 ${rel.version}（当前 ${currentVersion}，来源 ${rel.source}）。`
      : `已是最新版本 ${currentVersion}（来源 ${rel.source}）。`
  }
}

/**
 * Check the planned sources. A definitive release (newer or current) stops the chain.
 * Errors, timeouts, and empty releases fall through to the next source within the budget.
 */
export async function probeUpdateSources(opts: {
  channel: UpdateChannel
  customUrl?: string
  currentVersion: string
  platform?: string
  fetchImpl?: FetchLike
  timeoutMs?: number
  budgetMs?: number
  officialUrl?: string
  githubUrl?: string
  /** @deprecated ignored — Gitee is not an update source */
  giteeUrl?: string
}): Promise<ProbeResult> {
  const channel = normalizeChannel(opts.channel)
  const platform = opts.platform || 'linux'
  const fetchImpl = opts.fetchImpl || fetch
  const perSource = opts.timeoutMs ?? SOURCE_TIMEOUT_MS
  const plan = planSources(channel, opts.customUrl, { official: opts.officialUrl, github: opts.githubUrl })
  const budgetMs = opts.budgetMs ?? (plan.length > 1 ? AUTO_BUDGET_MS : perSource)
  const currentVersion = opts.currentVersion
  if (!plan.length) {
    return {
      currentVersion,
      status: 'error',
      channel,
      tried: [],
      message: '自定义清单地址无效（需要 http 或 https URL）。'
    }
  }
  const budgetCtrl = new AbortController()
  const budgetTimer = setTimeout(() => budgetCtrl.abort(), budgetMs)
  const started = Date.now()
  const tried: UpdateSourceId[] = []
  let lastError = ''
  try {
    for (const src of plan) {
      const remaining = budgetMs - (Date.now() - started)
      if (remaining <= 50 || budgetCtrl.signal.aborted) {
        lastError = lastError || '更新检查超时'
        break
      }
      tried.push(src.id)
      const timeout = Math.min(perSource, remaining)
      try {
        const res = await fetchSource(src.url, timeout, currentVersion, fetchImpl, budgetCtrl.signal)
        if (res.status === 404) {
          lastError = `${src.id} 没有 Release`
          continue
        }
        if (!res.ok) {
          lastError = `${src.id} HTTP ${res.status}`
          continue
        }
        const data = (await res.json()) as Record<string, unknown>
        const rel = normalizeRelease(src.id, data, src.url, platform)
        if (!rel) {
          lastError = `${src.id} 未解析到版本号`
          continue
        }
        return fromRelease(currentVersion, channel, rel, tried)
      } catch (e) {
        const aborted = e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message))
        lastError = aborted ? `${src.id} 超时` : e instanceof Error ? e.message : String(e)
      }
    }
  } finally {
    clearTimeout(budgetTimer)
  }
  const fallbackPage =
    channel === 'official' ? OFFICIAL_SITE_URL : channel === 'github' ? GITHUB_RELEASES_URL : opts.customUrl
  return {
    currentVersion,
    status: tried.length && /没有 Release|未解析/.test(lastError) && channel !== 'auto' ? 'noRelease' : 'error',
    channel,
    releaseUrl: fallbackPage,
    tried,
    message: lastError || '检查更新失败。'
  }
}
