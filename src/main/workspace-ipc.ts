import { execBounded } from './ssh-batch'
import { RESOURCE_PROBE_CMD, parseResourceSnapshot } from '../shared/resource-monitor'
import { listForwards, startTrackedForward, stopForward, stopSessionForwards } from './forward-manager'
import { mt } from './main-i18n'
import { ipcMain } from 'electron'
import { probeHosts } from './host-probe'
import type { SshSessionManager } from './ssh-manager'
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
import {
  LATENCY_TIMEOUT_MS,
  normalizeBatchRequest,
  normalizeLocale,
  normalizeSessionId
} from '../shared/workspace-features'

/** Measures one SSH round-trip with a no-op exec. Returns ms, or null when not connected / failed / timed out. */
export async function pingSession(sshManager: SshSessionManager, raw: unknown): Promise<number | null> {
  const id = normalizeSessionId(raw)
  if (!id) return null
  const session = sshManager.get(id)
  if (!session) return null
  const started = Date.now()
  try {
    const r = await execBounded(session.client, 'true', LATENCY_TIMEOUT_MS, 256)
    if (r.timedOut) return null
    return Date.now() - started
  } catch {
    return null
  }
}

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

let onLocaleChanged: (() => void) | null = null

/** Lets index.ts rebuild the application menu after the UI language changes. */
export function setLocaleChangedHandler(fn: (() => void) | null): void {
  onLocaleChanged = fn
}

export function registerWorkspaceIpc(sshManager: SshSessionManager): void {
  ipcMain.handle('workspace:probeHosts', (_e, targets: unknown) => probeHosts(Array.isArray(targets) ? targets : []))
  ipcMain.handle('workspace:ping', async (_e, sessionId: unknown) => pingSession(sshManager, sessionId))
  ipcMain.handle('workspace:batchExec', async (_e, payload: unknown) => runBatchExec(sshManager, payload))
  ipcMain.handle('workspace:resources', async (_e, sessionId: unknown) => {
    const client = sshManager.getClient(typeof sessionId === 'string' ? sessionId : '')
    if (!client) throw new Error(mt('会话未连接', 'Session is not connected'))
    const r = await execBounded(client, RESOURCE_PROBE_CMD, 10_000, 256 * 1024)
    if (r.timedOut) throw new Error(mt('采集超时', 'Probe timed out'))
    const snap = parseResourceSnapshot(r.stdout)
    if (!snap.load && !snap.mem && !snap.disks.length) {
      throw new Error(mt('无法读取资源信息（仅支持 Linux 主机）', 'Could not read resource data (Linux hosts only)'))
    }
    return { ...snap, at: Date.now() }
  })
  ipcMain.handle('workspace:forwards:list', (_e, sessionId: unknown) =>
    listForwards(typeof sessionId === 'string' && sessionId ? sessionId : undefined)
  )
  ipcMain.handle('workspace:forwards:add', async (_e, payload: unknown) => {
    const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
    const sessionId = typeof o.sessionId === 'string' ? o.sessionId : ''
    const session = sshManager.get(sessionId)
    const client = sshManager.getClient(sessionId)
    if (!session || !client) throw new Error(mt('会话未连接或不支持端口转发', 'Session is not connected or does not support port forwarding'))
    const fwd = await startTrackedForward(sessionId, client, o, 'manual')
    session.forwardCleanups.push(() => stopSessionForwards(sessionId))
    return fwd
  })
  ipcMain.handle('workspace:forwards:remove', (_e, id: unknown) => stopForward(String(id ?? '')))

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
  ipcMain.handle('workspace:locale:set', (_e, locale: LocaleId) => {
    const r = setLocale(normalizeLocale(locale))
    onLocaleChanged?.()
    return r
  })
}
