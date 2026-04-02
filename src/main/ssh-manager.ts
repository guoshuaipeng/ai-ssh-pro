import { readFile } from 'node:fs/promises'
import type { WebContents } from 'electron'
import { Client, type ClientChannel } from 'ssh2'
import { randomUUID } from 'node:crypto'
import type {
  SshConnectOptions,
  SshConnectResult,
  SessionMeta,
  SshDataEvent,
  SshStatusEvent
} from '../shared/ipc'
import { RingBuffer } from './ring-buffer'

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32
const RING_MAX_LINES = 4000

export type ManagedSession = {
  sessionId: string
  meta: SessionMeta
  client: Client
  stream: ClientChannel
  ring: RingBuffer
  owner: WebContents
}

export class SshSessionManager {
  private sessions = new Map<string, ManagedSession>()

  get(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId)
  }

  listMeta(): SessionMeta[] {
    return [...this.sessions.values()].map((s) => ({ ...s.meta }))
  }

  getRingSnapshot(sessionId: string, maxLines: number): string | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return s.ring.getSnapshot(maxLines)
  }

  async connect(opts: SshConnectOptions, owner: WebContents): Promise<SshConnectResult> {
    const host = opts.host.trim()
    const port = opts.port ?? 22
    const username = opts.username.trim()
    if (!host || !username) {
      throw new Error('host 与 username 不能为空')
    }

    const cols = opts.termCols ?? DEFAULT_COLS
    const rows = opts.termRows ?? DEFAULT_ROWS
    const sessionId = randomUUID()
    const connectedAt = Date.now()

    const client = new Client()
    const meta: SessionMeta = {
      host,
      port,
      username,
      label: opts.label?.trim() || `${username}@${host}`,
      connectedAt,
      termCols: cols,
      termRows: rows
    }

    const connectConfig: Parameters<Client['connect']>[0] = {
      host,
      port,
      username,
      readyTimeout: 20000
    }

    if (opts.password) {
      connectConfig.password = opts.password
    }
    if (opts.privateKeyPath?.trim()) {
      const keyPath = opts.privateKeyPath.trim()
      connectConfig.privateKey = await readFile(keyPath)
      if (opts.passphrase) {
        connectConfig.passphrase = opts.passphrase
      }
    }

    if (!opts.password && !opts.privateKeyPath?.trim()) {
      throw new Error('请提供密码或私钥路径')
    }

    return await new Promise<SshConnectResult>((resolve, reject) => {
      const fail = (err: Error) => {
        try {
          client.end()
        } catch {
          /* ignore */
        }
        reject(err)
      }

      client.on('error', (err) => {
        fail(err instanceof Error ? err : new Error(String(err)))
      })

      client.on('ready', () => {
        client.shell(
          {
            cols,
            rows,
            term: 'xterm-256color'
          },
          (err, stream) => {
            if (err || !stream) {
              fail(err ?? new Error('无法打开 shell'))
              return
            }

            const ring = new RingBuffer(RING_MAX_LINES)

            stream.on('data', (buf: Buffer) => {
              const chunk = buf.toString('utf8')
              ring.appendUtf8(chunk)
              if (!owner.isDestroyed()) {
                const payload: SshDataEvent = { sessionId, chunk }
                owner.send('ssh:data', payload)
              }
            })

            stream.on('close', () => {
              ring.flushPartial()
              if (!owner.isDestroyed()) {
                const st: SshStatusEvent = { sessionId, status: 'closed' }
                owner.send('ssh:status', st)
              }
              this.sessions.delete(sessionId)
              try {
                client.end()
              } catch {
                /* ignore */
              }
            })

            stream.stderr?.on('data', (buf: Buffer) => {
              const chunk = buf.toString('utf8')
              ring.appendUtf8(chunk)
              if (!owner.isDestroyed()) {
                owner.send('ssh:data', { sessionId, chunk })
              }
            })

            this.sessions.set(sessionId, {
              sessionId,
              meta,
              client,
              stream,
              ring,
              owner
            })

            if (!owner.isDestroyed()) {
              owner.send('ssh:status', {
                sessionId,
                status: 'connected'
              })
            }

            resolve({ sessionId, meta })
          }
        )
      })

      client.connect(connectConfig)
    })
  }

  write(sessionId: string, data: string): boolean {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    return s.stream.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    try {
      const heightPx = Math.max(rows * 20, 1)
      const widthPx = Math.max(cols * 10, 1)
      s.stream.setWindow(rows, cols, heightPx, widthPx)
      s.meta.termCols = cols
      s.meta.termRows = rows
      return true
    } catch {
      return false
    }
  }

  disconnect(sessionId: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    try {
      s.stream.close()
    } catch {
      /* ignore */
    }
    try {
      s.client.end()
    } catch {
      /* ignore */
    }
    this.sessions.delete(sessionId)
  }
}
