/** Encrypted vault push/pull. The passphrase never leaves this process in logs. */
import { app, ipcMain } from 'electron'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { encryptBackup, decryptBackup } from './backup-crypto'
import { encryptSecret, decryptSecret } from './secret-crypto'
import { gistRead, gistWrite, testGithubToken, testWebdav, webdavRead, webdavWrite } from './sync-remote'
import type { SyncScope } from '../shared/sync-vault'
import { readSyncPassphrase, writeSyncPassphrase } from '../shared/sync-passphrase'

export type SyncConfig = {
  provider: 'gist' | 'webdav'
  gistId?: string
  webdavUrl?: string
  username?: string
  token?: string
  password?: string
  /** Local-only sync passphrase. Never written into the remote payload. */
  syncPassphrase?: string
  /** @deprecated read fallback only */
  vaultPass?: string
  scope: SyncScope
}

type Stored = Omit<SyncConfig, 'token' | 'password' | 'syncPassphrase' | 'vaultPass'> & {
  token?: string
  password?: string
  syncPassphrase?: string
  vaultPass?: string
}

function configPath(): string {
  return join(app.getPath('userData'), 'sync-config.json')
}

function backupDir(): string {
  const dir = join(app.getPath('userData'), 'sync-backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    if (!existsSync(configPath())) return null
    const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as Stored
    return {
      provider: raw.provider === 'webdav' ? 'webdav' : 'gist',
      gistId: raw.gistId,
      webdavUrl: raw.webdavUrl,
      username: raw.username,
      token: raw.token ? decryptSecret(raw.token) : undefined,
      password: raw.password ? decryptSecret(raw.password) : undefined,
      syncPassphrase: (() => {
        const read = readSyncPassphrase(raw)
        return read.stored ? decryptSecret(read.stored) : undefined
      })(),
      scope: {
        connections: raw.scope?.connections !== false,
        snippets: raw.scope?.snippets !== false,
        forwards: raw.scope?.forwards !== false,
        settings: raw.scope?.settings !== false,
        credentials: raw.scope?.credentials === true
      }
    }
  } catch {
    return null
  }
}

function saveSyncConfig(cfg: SyncConfig): void {
  const stored: Stored = {
    provider: cfg.provider,
    gistId: cfg.gistId,
    webdavUrl: cfg.webdavUrl,
    username: cfg.username,
    scope: cfg.scope,
    token: cfg.token ? encryptSecret(cfg.token) : undefined,
    password: cfg.password ? encryptSecret(cfg.password) : undefined,
    ...writeSyncPassphrase(cfg.syncPassphrase ? encryptSecret(cfg.syncPassphrase) : undefined)
  }
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(stored), 'utf8')
}

function publicConfig(cfg: SyncConfig | null) {
  if (!cfg) return null
  return {
    provider: cfg.provider,
    gistId: cfg.gistId ?? '',
    webdavUrl: cfg.webdavUrl ?? '',
    username: cfg.username ?? '',
    hasToken: Boolean(cfg.token),
    hasPassword: Boolean(cfg.password),
    hasSyncPassphrase: Boolean(cfg.syncPassphrase),
    hasVaultPass: Boolean(cfg.syncPassphrase),
    scope: cfg.scope
  }
}

export function registerSyncIpc(): void {
  ipcMain.handle('sync:getConfig', () => publicConfig(loadSyncConfig()))

  ipcMain.handle('sync:setConfig', (_e, patch: Partial<SyncConfig> & { clearToken?: boolean; clearPassword?: boolean }) => {
    const prev = loadSyncConfig()
    const next: SyncConfig = {
      provider: patch.provider === 'webdav' ? 'webdav' : prev?.provider ?? 'gist',
      gistId: patch.gistId ?? prev?.gistId,
      webdavUrl: patch.webdavUrl ?? prev?.webdavUrl,
      username: patch.username ?? prev?.username,
      token: patch.clearToken ? undefined : patch.token || prev?.token,
      password: patch.clearPassword ? undefined : patch.password || prev?.password,
      syncPassphrase: patch.syncPassphrase || patch.vaultPass || prev?.syncPassphrase,
      scope: patch.scope ?? prev?.scope ?? { connections: true, snippets: true, forwards: true, settings: true, credentials: false }
    }
    saveSyncConfig(next)
    return publicConfig(next)
  })

  ipcMain.handle('sync:test', async () => {
    const cfg = loadSyncConfig()
    if (!cfg) return { ok: false, message: 'not-configured' }
    if (cfg.provider === 'gist') {
      if (!cfg.token) return { ok: false, message: 'missing-token' }
      const r = await testGithubToken(cfg.token)
      return r.ok ? { ok: true, message: r.value.login } : { ok: false, message: r.message }
    }
    if (!cfg.webdavUrl || !cfg.username || !cfg.password) return { ok: false, message: 'missing-webdav' }
    const r = await testWebdav(cfg.webdavUrl, cfg.username, cfg.password)
    return r.ok ? { ok: true, message: 'ok' } : { ok: false, message: r.message }
  })

  ipcMain.handle('sync:push', async (_e, payload: unknown, passphrase: string) => {
    const cfg = loadSyncConfig()
    if (!cfg) return { ok: false, message: 'not-configured' }
    const pass = passphrase || cfg.syncPassphrase || ''
    let envelope: string
    try {
      envelope = JSON.stringify(encryptBackup(payload, pass))
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'encrypt' }
    }
    if (cfg.provider === 'gist') {
      if (!cfg.token) return { ok: false, message: 'missing-token' }
      const r = await gistWrite(cfg.token, cfg.gistId, envelope)
      if (!r.ok) return { ok: false, message: r.message }
      if (r.value.id !== cfg.gistId) saveSyncConfig({ ...cfg, gistId: r.value.id })
      return { ok: true, id: r.value.id }
    }
    if (!cfg.webdavUrl || !cfg.username || !cfg.password) return { ok: false, message: 'missing-webdav' }
    const r = await webdavWrite(cfg.webdavUrl, cfg.username, cfg.password, envelope)
    return r.ok ? { ok: true, id: cfg.webdavUrl } : { ok: false, message: r.message }
  })

  ipcMain.handle('sync:pull', async (_e, passphrase: string) => {
    const cfg = loadSyncConfig()
    if (!cfg) return { ok: false, message: 'not-configured' }
    let raw = ''
    if (cfg.provider === 'gist') {
      if (!cfg.token || !cfg.gistId) return { ok: false, message: 'missing-gist' }
      const r = await gistRead(cfg.token, cfg.gistId)
      if (!r.ok) return { ok: false, message: r.message }
      raw = r.value
    } else {
      if (!cfg.webdavUrl || !cfg.username || !cfg.password) return { ok: false, message: 'missing-webdav' }
      const r = await webdavRead(cfg.webdavUrl, cfg.username, cfg.password)
      if (!r.ok) return { ok: false, message: r.message }
      raw = r.value
    }
    if (!raw.trim()) return { ok: true, empty: true, payload: null }
    try {
      const payload = decryptBackup(raw, passphrase || cfg.syncPassphrase || '')
      return { ok: true, empty: false, payload }
    } catch {
      return { ok: false, message: 'decrypt' }
    }
  })

  ipcMain.handle('sync:backupLocal', (_e, payload: unknown) => {
    const file = join(backupDir(), `vault-${Date.now()}.json`)
    writeFileSync(file, JSON.stringify(payload), 'utf8')
    return { ok: true, file }
  })
}
