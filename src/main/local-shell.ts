import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { SessionMeta, SshConnectResult, SshDataEvent, SshStatusEvent } from '../shared/ipc'
import { RingBuffer } from './ring-buffer'

const require = createRequire(import.meta.url)

type LocalSession = {
  sessionId: string
  meta: SessionMeta
  ring: RingBuffer
  owner: WebContents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pty: any
}

const RING_MAX_LINES = 4000

let ptyAvailable: boolean | null = null

export function isLocalShellAvailable(): boolean {
  if (ptyAvailable != null) return ptyAvailable
  try {
    require('node-pty')
    ptyAvailable = true
  } catch {
    ptyAvailable = false
  }
  return ptyAvailable
}

export class LocalShellManager {
  private sessions = new Map<string, LocalSession>()

  get(sessionId: string): LocalSession | undefined {
    return this.sessions.get(sessionId)
  }

  open(owner: WebContents, cols = 120, rows = 32): SshConnectResult {
    if (!isLocalShellAvailable()) {
      throw new Error('本机 Shell 不可用：请安装并针对 Electron 重建 node-pty（optionalDependency）')
    }
    const pty = require('node-pty') as {
      spawn: (
        file: string,
        args: string[],
        opts: Record<string, unknown>
      ) => {
        onData: (cb: (d: string) => void) => void
        onExit: (cb: () => void) => void
        write: (d: string) => void
        resize: (c: number, r: number) => void
        kill: () => void
      }
    }

    const shell =
      process.platform === 'win32'
        ? process.env.COMSPEC || 'powershell.exe'
        : process.env.SHELL || '/bin/bash'
    const args = process.platform === 'win32' && /powershell/i.test(shell) ? ['-NoLogo'] : []

    const sessionId = `local:${randomUUID()}`
    const connectedAt = Date.now()
    const meta: SessionMeta = {
      host: 'localhost',
      port: 0,
      username: process.env.USERNAME || process.env.USER || 'local',
      label: '本机 Shell',
      connectedAt,
      termCols: cols,
      termRows: rows,
      kind: 'local'
    }

    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.USERPROFILE || process.env.HOME || process.cwd(),
      env: process.env
    })

    const ring = new RingBuffer(RING_MAX_LINES)
    const rec: LocalSession = { sessionId, meta, ring, owner, pty: proc }
    this.sessions.set(sessionId, rec)

    proc.onData((chunk: string) => {
      ring.appendUtf8(chunk)
      if (!owner.isDestroyed()) {
        const payload: SshDataEvent = { sessionId, chunk }
        owner.send('ssh:data', payload)
      }
    })

    proc.onExit(() => {
      ring.flushPartial()
      this.sessions.delete(sessionId)
      if (!owner.isDestroyed()) {
        const st: SshStatusEvent = { sessionId, status: 'closed', message: '本机 Shell 已退出' }
        owner.send('ssh:status', st)
      }
    })

    if (!owner.isDestroyed()) {
      owner.send('ssh:status', { sessionId, status: 'connected' })
    }

    return { sessionId, meta }
  }

  write(sessionId: string, data: string): boolean {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    try {
      s.pty.write(data)
      return true
    } catch {
      return false
    }
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    try {
      s.pty.resize(cols, rows)
      s.meta.termCols = cols
      s.meta.termRows = rows
      return true
    } catch {
      return false
    }
  }

  getRingSnapshot(sessionId: string, maxLines = 200): string | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return s.ring.getSnapshot(maxLines)
  }

  disconnect(sessionId: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    try {
      s.pty.kill()
    } catch {
      /* ignore */
    }
    this.sessions.delete(sessionId)
  }

  disconnectAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.disconnect(id)
    }
  }
}
