import { app, shell } from 'electron'
import { createRequire } from 'node:module'
import type { AppUpdateCheckResult } from '../shared/ipc'
import {
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  compareSemver,
  probeUpdateSources,
  type UpdateChannel
} from '../shared/update-channel'

export { GITHUB_REPO_URL, GITHUB_RELEASES_URL, compareSemver }
export type { AppUpdateCheckResult }

const require = createRequire(import.meta.url)

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

export async function checkForAppUpdate(opts?: {
  channel?: UpdateChannel
  customUrl?: string
  fetchImpl?: typeof fetch
  officialUrl?: string
  githubUrl?: string
  timeoutMs?: number
  budgetMs?: number
  platform?: string
}): Promise<AppUpdateCheckResult> {
  const currentVersion = getAppVersion()
  const probed = await probeUpdateSources({
    channel: opts?.channel ?? 'auto',
    customUrl: opts?.customUrl,
    currentVersion,
    platform: opts?.platform || process.platform,
    fetchImpl: opts?.fetchImpl,
    officialUrl: opts?.officialUrl,
    githubUrl: opts?.githubUrl,
    timeoutMs: opts?.timeoutMs,
    budgetMs: opts?.budgetMs
  })
  return {
    currentVersion: probed.currentVersion,
    status: probed.status,
    latestVersion: probed.latestVersion,
    releaseUrl: probed.releaseUrl,
    downloadUrl: probed.downloadUrl,
    pan123Url: probed.pan123Url,
    releaseName: probed.releaseName,
    notes: probed.notes,
    message: probed.message,
    source: probed.source,
    channel: probed.channel,
    tried: probed.tried
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
