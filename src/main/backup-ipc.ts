import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { BACKUP_MIN_PASSWORD, decryptBackup, encryptBackup } from './backup-crypto'
import {
  getAiSettings,
  getSavedSessionsState,
  getSnippets,
  getTerminalPrefs,
  setAiSettings,
  setSavedSessionsState,
  setSnippets,
  setTerminalPrefs
} from './app-store'
import { mt } from './main-i18n'

type Counts = { profiles: number; folders: number; snippets: number }
type BackupPayload = {
  app: 'ai-ssh-pro'
  appVersion: string
  savedSessions: ReturnType<typeof getSavedSessionsState>
  snippets: ReturnType<typeof getSnippets>
  terminalPrefs: ReturnType<typeof getTerminalPrefs>
  ai?: ReturnType<typeof getAiSettings>
}

const FILTERS = [{ name: 'AI-SSH-Pro backup', extensions: ['aissbak'] }]

function counts(p: Pick<BackupPayload, 'savedSessions' | 'snippets'>): Counts {
  return {
    profiles: p.savedSessions?.profiles?.length ?? 0,
    folders: p.savedSessions?.folders?.length ?? 0,
    snippets: Array.isArray(p.snippets) ? p.snippets.length : 0
  }
}

export function registerBackupIpc(): void {
  ipcMain.handle('backup:export', async (e, raw: unknown) => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const password = typeof o.password === 'string' ? o.password : ''
    if (password.length < BACKUP_MIN_PASSWORD) return { ok: false as const, error: 'password-too-short' }
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      title: mt('导出加密备份', 'Export encrypted backup'),
      defaultPath: `ai-ssh-pro-backup-${new Date().toISOString().slice(0, 10)}.aissbak`,
      filters: FILTERS
    }
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return { ok: false as const, canceled: true, error: 'canceled' }
    const payload: BackupPayload = {
      app: 'ai-ssh-pro',
      appVersion: app.getVersion(),
      savedSessions: getSavedSessionsState(),
      snippets: getSnippets(),
      terminalPrefs: getTerminalPrefs()
    }
    if (o.includeAi !== false) payload.ai = getAiSettings()
    await writeFile(r.filePath, JSON.stringify(encryptBackup(payload, password), null, 2), { encoding: 'utf8', mode: 0o600 })
    return { ok: true as const, path: r.filePath, counts: counts(payload) }
  })

  ipcMain.handle('backup:import', async (e, raw: unknown) => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const password = typeof o.password === 'string' ? o.password : ''
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = { title: mt('导入加密备份', 'Import encrypted backup'), filters: FILTERS, properties: ['openFile' as const] }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return { ok: false as const, canceled: true, error: 'canceled' }
    let payload: BackupPayload
    try {
      payload = decryptBackup(await readFile(r.filePaths[0], 'utf8'), password) as BackupPayload
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'not-a-backup' }
    }
    const s = payload?.savedSessions
    if (!payload || payload.app !== 'ai-ssh-pro' || !s || !Array.isArray(s.profiles) || !Array.isArray(s.folders)) {
      return { ok: false as const, error: 'not-a-backup' }
    }
    setSavedSessionsState(s)
    if (Array.isArray(payload.snippets)) setSnippets(payload.snippets)
    if (payload.terminalPrefs && typeof payload.terminalPrefs === 'object') setTerminalPrefs(payload.terminalPrefs)
    if (payload.ai && typeof payload.ai === 'object') setAiSettings(payload.ai)
    return { ok: true as const, counts: counts(payload) }
  })
}
