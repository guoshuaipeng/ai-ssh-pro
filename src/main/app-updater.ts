import { app, shell } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export const GITHUB_REPO_URL = 'https://github.com/guoshuaipeng/ai-ssh-pro'
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`
const GITHUB_LATEST_API = 'https://api.github.com/repos/guoshuaipeng/ai-ssh-pro/releases/latest'

export type AppUpdateCheckResult = {
  currentVersion: string
  status: 'upToDate' | 'available' | 'noRelease' | 'error'
  latestVersion?: string
  releaseUrl?: string
  downloadUrl?: string
  releaseName?: string
  message: string
}

function readPackageVersion(): string {
  try {
    const pkg = require('../../package.json') as { version?: string }
    if (pkg?.version?.trim()) return pkg.version.trim()
  } catch {
    /* fall through */
  }
  return '0.0.0'
}

export function getAppVersion(): string {
  try {
    const v = app.getVersion()?.trim()
    if (v) return v
  } catch {
    /* app may not be ready in tests */
  }
  return readPackageVersion()
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

function pickDownloadUrl(assets: unknown, platform: NodeJS.Platform): string | undefined {
  if (!Array.isArray(assets)) return undefined
  const names = assets
    .map((a) => {
      if (!a || typeof a !== 'object') return null
      const o = a as Record<string, unknown>
      const name = typeof o.name === 'string' ? o.name : ''
      const url = typeof o.browser_download_url === 'string' ? o.browser_download_url : ''
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

export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = getAppVersion()
  try {
    const res = await fetch(GITHUB_LATEST_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `AI-SSH-Pro/${currentVersion}`
      }
    })
    if (res.status === 404) {
      return {
        currentVersion,
        status: 'noRelease',
        releaseUrl: GITHUB_RELEASES_URL,
        message: `当前版本 ${currentVersion}。GitHub 上还没有正式 Release，可前往仓库查看开发进度。`
      }
    }
    if (!res.ok) {
      return {
        currentVersion,
        status: 'error',
        releaseUrl: GITHUB_RELEASES_URL,
        message: `检查更新失败（HTTP ${res.status}）。`
      }
    }
    const data = (await res.json()) as Record<string, unknown>
    const tag = typeof data.tag_name === 'string' ? data.tag_name.trim() : ''
    const latestVersion = tag.replace(/^v/i, '')
    if (!latestVersion) {
      return {
        currentVersion,
        status: 'noRelease',
        releaseUrl: GITHUB_RELEASES_URL,
        message: `当前版本 ${currentVersion}。未解析到有效的最新版本号。`
      }
    }
    const releaseUrl =
      (typeof data.html_url === 'string' && data.html_url) || `${GITHUB_RELEASES_URL}/tag/${tag || latestVersion}`
    const downloadUrl = pickDownloadUrl(data.assets, process.platform)
    const releaseName = typeof data.name === 'string' ? data.name : undefined
    if (compareSemver(latestVersion, currentVersion) > 0) {
      return {
        currentVersion,
        status: 'available',
        latestVersion,
        releaseUrl,
        downloadUrl,
        releaseName,
        message: `发现新版本 ${latestVersion}（当前 ${currentVersion}）。`
      }
    }
    return {
      currentVersion,
      status: 'upToDate',
      latestVersion,
      releaseUrl,
      downloadUrl,
      releaseName,
      message: `已是最新版本 ${currentVersion}。`
    }
  } catch (e) {
    return {
      currentVersion,
      status: 'error',
      releaseUrl: GITHUB_RELEASES_URL,
      message: e instanceof Error ? e.message : String(e)
    }
  }
}

export async function openExternalUrl(url: string): Promise<boolean> {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return false
  await shell.openExternal(u)
  return true
}

export async function openGithubRepo(): Promise<boolean> {
  return openExternalUrl(GITHUB_REPO_URL)
}
