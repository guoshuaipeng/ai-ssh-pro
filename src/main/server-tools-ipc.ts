import { ipcMain } from 'electron'
import type { Client } from 'ssh2'
import { execBounded } from './ssh-batch'
import { mt } from './main-i18n'
import type { SshSessionManager } from './ssh-manager'
import {
  PORTS_CMD,
  PROCESS_LIST_CMD,
  SERVICE_LIST_CMD,
  buildKillCommand,
  buildLogCommand,
  buildServiceCommand,
  classifyToolError,
  parseListenPorts,
  parseProcessList,
  parseServiceList,
  type ExecOutcome,
  type LogRequest
} from '../shared/server-tools'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function clientOf(sshManager: SshSessionManager, sessionId: unknown): Client {
  const client = sshManager.getClient(str(sessionId))
  if (!client) throw new Error(mt('会话未连接', 'Session is not connected'))
  return client
}

function reasonText(output: string): string | null {
  switch (classifyToolError(output)) {
    case 'sudo-password':
      return mt('sudo 需要密码：请在终端里执行，或为该命令配置免密 sudo', 'sudo needs a password: run it in the terminal, or allow passwordless sudo for this command')
    case 'no-systemd':
      return mt('该主机没有 systemd（systemctl 不可用）', 'This host does not use systemd (systemctl is unavailable)')
    case 'permission':
      return mt('权限不足，可勾选“使用 sudo”后重试', 'Permission denied. Tick "Use sudo" and try again')
    default:
      return null
  }
}

async function run(client: Client, cmd: string, timeoutMs = 15_000, maxBytes = 512 * 1024): Promise<ExecOutcome> {
  const r = await execBounded(client, cmd, timeoutMs, maxBytes)
  return { code: r.timedOut ? null : r.code, output: (r.stdout + (r.stderr ? `\n${r.stderr}` : '')).trim(), timedOut: r.timedOut }
}

function badInput(e: unknown): never {
  const code = e instanceof Error ? e.message : ''
  throw new Error(mt(`参数无效（${code}）`, `Invalid input (${code})`))
}

/** IPC for the server toolbox (processes / services / ports / logs). Commands are built in shared/server-tools from validated input. */
export function registerServerToolsIpc(sshManager: SshSessionManager): void {
  ipcMain.handle('tools:processes', async (_e, sessionId: unknown) => {
    const r = await run(clientOf(sshManager, sessionId), PROCESS_LIST_CMD)
    const list = parseProcessList(r.output)
    if (!list.length) throw new Error(r.timedOut ? mt('读取超时', 'Timed out') : mt('无法读取进程列表（仅支持 Linux 主机）', 'Could not read the process list (Linux hosts only)'))
    return list
  })

  ipcMain.handle('tools:kill', async (_e, sessionId: unknown, pid: unknown, signal: unknown, sudo: unknown) => {
    let cmd: string
    try {
      cmd = buildKillCommand(pid, signal, Boolean(sudo))
    } catch (e) {
      badInput(e)
    }
    const r = await run(clientOf(sshManager, sessionId), cmd, 10_000)
    if (r.code !== 0) throw new Error(reasonText(r.output) ?? (r.output || mt('操作失败', 'Failed')))
    return r
  })

  ipcMain.handle('tools:services', async (_e, sessionId: unknown) => {
    const r = await run(clientOf(sshManager, sessionId), SERVICE_LIST_CMD, 15_000, 1024 * 1024)
    const list = parseServiceList(r.output)
    if (!list.length) throw new Error(reasonText(r.output) ?? mt('没有读取到服务（需要 systemd）', 'No services found (systemd required)'))
    return list
  })

  ipcMain.handle('tools:service', async (_e, sessionId: unknown, unit: unknown, action: unknown, sudo: unknown) => {
    let cmd: string
    try {
      cmd = buildServiceCommand(unit, action, Boolean(sudo))
    } catch (e) {
      badInput(e)
    }
    const r = await run(clientOf(sshManager, sessionId), cmd, 30_000)
    // `systemctl status` exits 3 for inactive units; that is still a valid answer.
    if (action !== 'status' && r.code !== 0) throw new Error(reasonText(r.output) ?? (r.output || mt('操作失败', 'Failed')))
    return r
  })

  ipcMain.handle('tools:ports', async (_e, sessionId: unknown) => {
    const r = await run(clientOf(sshManager, sessionId), PORTS_CMD)
    return parseListenPorts(r.output)
  })

  ipcMain.handle('tools:logs', async (_e, sessionId: unknown, req: unknown) => {
    const o = (req && typeof req === 'object' ? req : {}) as Record<string, unknown>
    const request: LogRequest = {
      source: o.source as LogRequest['source'],
      unit: str(o.unit) || undefined,
      path: str(o.path) || undefined,
      lines: typeof o.lines === 'number' ? o.lines : undefined,
      sudo: Boolean(o.sudo)
    }
    let cmd: string
    try {
      cmd = buildLogCommand(request)
    } catch (e) {
      badInput(e)
    }
    const r = await run(clientOf(sshManager, sessionId), cmd, 20_000, 2 * 1024 * 1024)
    const reason = r.code !== 0 ? reasonText(r.output) : null
    if (reason) throw new Error(reason)
    return { text: r.output, code: r.code, at: Date.now() }
  })
}
