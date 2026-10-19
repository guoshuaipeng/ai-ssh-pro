import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  keygenFQueryName,
  parseSshKeygenFOutput,
  type KeygenFMatch
} from '../shared/known-hosts-io'
import { fingerprintSha256, buildImportPreview, type KnownHostImportPreviewRow } from './known-hosts'

export type KnownHostLookupResult = {
  ok: boolean
  query: string
  file: string
  matches: Array<
    KeygenFMatch & {
      fingerprint: string
      previewRow?: KnownHostImportPreviewRow
    }
  >
  error?: string
  /** True when ssh-keygen is missing from PATH. */
  missingTool?: boolean
  /** True when served from the short-lived in-process cache. */
  cached?: boolean
}

/** Same-host lookups within this window reuse the last ssh-keygen -F result. */
export const KEYGEN_F_CACHE_TTL_MS = 60_000

type CacheEntry = {
  result: KnownHostLookupResult
  expiresAt: number
  mtimeMs: number
}

const lookupCache = new Map<string, CacheEntry>()

function defaultKnownHostsPath(): string {
  return join(homedir(), '.ssh', 'known_hosts')
}

function cacheKey(query: string, file: string): string {
  return file + '\0' + query
}

function fileMtimeMs(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return -1
  }
}

/** Drop every cached -F result (known_hosts import/remove, or explicit bust). */
export function invalidateKnownHostLookupCache(): void {
  lookupCache.clear()
}

function runSshKeygenF(query: string, file: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('ssh-keygen', ['-F', query, '-f', file], {
      windowsHide: true,
      shell: false
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => {
      stdout += String(c)
    })
    child.stderr.on('data', (c) => {
      stderr += String(c)
    })
    child.on('error', (err) => {
      resolve({ code: null, stdout, stderr: err.message })
    })
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}

/**
 * Resolve hashed (or plain) known_hosts lines for one user-named host via `ssh-keygen -F`.
 * Never scans/imports the whole file — only what -F returns for that name.
 * Short-lived cache: same host+file within TTL, invalidated when the file mtime
 * changes or when {@link invalidateKnownHostLookupCache} runs (import/remove).
 */
export async function lookupHostInOpenSshKnownHosts(
  host: string,
  port = 22,
  filePath?: string,
  opts?: { bypassCache?: boolean }
): Promise<KnownHostLookupResult> {
  const query = keygenFQueryName(host, port)
  const file = (filePath?.trim() || defaultKnownHostsPath()).replace(/\0/g, '')
  if (!query) {
    return { ok: false, query: String(host ?? ''), file, matches: [], error: 'invalid host' }
  }
  if (!existsSync(file)) {
    invalidateKnownHostLookupCache()
    return { ok: false, query, file, matches: [], error: 'known_hosts missing' }
  }

  const mtimeMs = fileMtimeMs(file)
  const key = cacheKey(query, file)
  if (!opts?.bypassCache) {
    const hit = lookupCache.get(key)
    if (hit && hit.expiresAt > Date.now() && hit.mtimeMs === mtimeMs) {
      return { ...hit.result, cached: true }
    }
  }

  const ran = await runSshKeygenF(query, file)
  if (ran.code === null && /ENOENT|not found|not recognized/i.test(ran.stderr)) {
    return { ok: false, query, file, matches: [], error: ran.stderr || 'ssh-keygen missing', missingTool: true }
  }
  // ssh-keygen returns 0 when found, 1 when not found
  const parsed = parseSshKeygenFOutput(ran.stdout, host, port)
  if (!parsed.length) {
    const empty: KnownHostLookupResult = {
      ok: true,
      query,
      file,
      matches: [],
      error: ran.code === 1 ? undefined : ran.stderr.trim() || undefined
    }
    lookupCache.set(key, { result: empty, expiresAt: Date.now() + KEYGEN_F_CACHE_TTL_MS, mtimeMs })
    return empty
  }
  const preview = buildImportPreview(
    parsed.map((m) => m.host + ' ' + m.keyType + ' ' + m.hostKeyBase64).join('\n')
  )
  const matches = parsed.map((m) => {
    let fingerprint = 'SHA256:?'
    try {
      fingerprint = fingerprintSha256(Buffer.from(m.hostKeyBase64, 'base64'))
    } catch {
      /* ignore */
    }
    const previewRow = preview.rows.find((r) => r.hostKeyBase64 === m.hostKeyBase64)
    return { ...m, fingerprint, previewRow }
  })
  const result: KnownHostLookupResult = { ok: true, query, file, matches }
  lookupCache.set(key, { result, expiresAt: Date.now() + KEYGEN_F_CACHE_TTL_MS, mtimeMs })
  return result
}
