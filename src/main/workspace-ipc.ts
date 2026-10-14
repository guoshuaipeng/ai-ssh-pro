import { ipcMain } from 'electron'
import type { SshSessionManager } from './ssh-manager'
import { execBounded } from './ssh-batch'
import {
  getCommandHistory,
  getLocale,
  getRecentConnections,
  pinRecentConnection,
  pushCommandHistory,
  removeRecentConnection,
  setCommandHistory,
  setLocale
} from './app-store'
import type { BatchExecResult, BatchExecSessionResult, LocaleId } from '../shared/workspace-features'
import { normalizeBatchRequest, normalizeLocale } from '../shared/workspace-features'

function shortExecError(err: unknown, command: string): string {
  const message = err instanceof Error ? err.message : ''
  const trimmed = message.trim()
  if (!trimmed || trimmed.includes(command)) return 'exec-failed'
  return trimmed.slice(0, 180)
}

export async function runBatchExec(sshManager: SshSessionManager, raw: unknown): Promise<BatchExecResult> {
  const startedAt = Date.now()
  const parsed = normalizeBatchRequest(raw)
  if ('error' in parsed) {
    return { command: '', startedAt, results: [], error: parsed.error }
  }

  pushCommandHistory(parsed.command)

  const results: BatchExecSessionResult[] = await Promise.all(
    parsed.sessionIds.map(async (sessionId) => {
      const started = Date.now()
      const session = sshManager.get(sessionId)
      const base = {
        sessionId,
        label: session?.meta.label || sessionId,
        host: session?.meta.host || '',
        port: session?.meta.port || 0,
        username: session?.meta.username || ''
      }
      if (!session) {
        return {
          ...base,
          ok: false,
          code: null,
          stdout: '',
          stderr: '',
          error: 'not-connected',
          elapsedMs: Date.now() - started
        }
      }
      if (!session.ownsClient) {
        return {
          ...base,
          ok: false,
          code: null,
          stdout: '',
          stderr: '',
          error: 'child-session',
          elapsedMs: Date.now() - started
        }
      }
      try {
        const exec = await execBounded(session.client, parsed.command, parsed.timeoutMs)
        return {
          ...base,
          ok: !exec.timedOut && exec.code === 0,
          code: exec.timedOut ? null : exec.code,
          stdout: exec.stdout,
          stderr: exec.stderr,
          error: exec.timedOut ? 'timeout' : undefined,
          elapsedMs: Date.now() - started,
          truncated: exec.truncated || undefined,
          timedOut: exec.timedOut || undefined
        }
      } catch (err) {
        return {
          ...base,
          ok: false,
          code: null,
          stdout: '',
          stderr: '',
          error: shortExecError(err, parsed.command),
          elapsedMs: Date.now() - started
        }
      }
    })
  )

  return { command: parsed.command, startedAt, results }
}

export function registerWorkspaceIpc(sshManager: SshSessionManager): void {
  ipcMain.handle('workspace:batchExec', async (_e, payload: unknown) => runBatchExec(sshManager, payload))

  ipcMain.handle('workspace:commandHistory:list', () => getCommandHistory())
  ipcMain.handle('workspace:commandHistory:push', (_e, command: string) => pushCommandHistory(String(command ?? '')))
  ipcMain.handle('workspace:commandHistory:clear', () => {
    setCommandHistory([])
    return [] as string[]
  })

  ipcMain.handle('workspace:recent:list', () => getRecentConnections())
  ipcMain.handle('workspace:recent:remove', (_e, id: string) => removeRecentConnection(String(id ?? '')))
  ipcMain.handle('workspace:recent:pin', (_e, id: string, pinned: boolean) =>
    pinRecentConnection(String(id ?? ''), Boolean(pinned))
  )

  ipcMain.handle('workspace:locale:get', () => getLocale())
  ipcMain.handle('workspace:locale:set', (_e, locale: LocaleId) => setLocale(normalizeLocale(locale)))
}
