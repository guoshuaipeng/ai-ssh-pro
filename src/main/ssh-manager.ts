import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { Client, type ClientChannel } from 'ssh2'
import { randomUUID } from 'node:crypto'
import type {
  SshConnectOptions,
  SshConnectResult,
  SessionMeta,
  SshDataEvent,
  SshStatusEvent,
  SshSnapshotOptions
} from '../shared/ipc'
import { RingBuffer } from './ring-buffer'

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32
const RING_MAX_LINES = 4000

/** 与 OpenSSH 类似：未指定私钥时尝试默认路径（仅在没有密码时） */
const DEFAULT_PRIVATE_KEY_NAMES = ['id_ed25519', 'id_rsa', 'id_ecdsa'] as const

async function tryReadDefaultPrivateKey(): Promise<Buffer | null> {
  const base = join(homedir(), '.ssh')
  for (const name of DEFAULT_PRIVATE_KEY_NAMES) {
    const fp = join(base, name)
    if (!existsSync(fp)) continue
    try {
      return await readFile(fp)
    } catch {
      /* 忽略无权限等 */
    }
  }
  return null
}

export type ManagedSession = {
  sessionId: string
  meta: SessionMeta
  client: Client
  stream: ClientChannel
  ring: RingBuffer
  owner: WebContents
  commandMarkers: Array<{ command: string; at: number; lineCount: number }>
  pendingInput: string
}

export class SshSessionManager {
  private sessions = new Map<string, ManagedSession>()

  get(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId)
  }

  listMeta(): SessionMeta[] {
    return [...this.sessions.values()].map((s) => ({ ...s.meta }))
  }

  getRingSnapshot(sessionId: string, options?: number | SshSnapshotOptions): string | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    const opt = typeof options === 'number' ? { maxLines: options } : options ?? {}
    const maxLines = Number.isFinite(opt.maxLines) ? Math.min(4000, Math.max(1, Math.floor(opt.maxLines!))) : 200
    if (!opt.fromCurrentCommand) {
      return s.ring.getSnapshot(maxLines)
    }
    const last = s.commandMarkers[s.commandMarkers.length - 1]
    if (!last) return s.ring.getSnapshot(maxLines)
    const body = s.ring.getSnapshotFromAbsoluteLine(last.lineCount, maxLines)
    if (!body.trim()) {
      // Fallback: when command boundary has no newline-terminated output yet,
      // return a broader latest snapshot to avoid false "empty" tool results.
      const fallback = s.ring.getSnapshot(maxLines)
      if (fallback.trim()) return fallback
    }
    if (opt.includeCommandLine === false) return body
    const prefix = `$ ${last.command}`
    return body.trim() ? `${prefix}\n${body}` : `${prefix}\n（命令已发送，暂未捕获到后续输出）`
  }

  private trackWriteCommand(s: ManagedSession, data: string): void {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]!
      if (ch === '\r' || ch === '\n') {
        const cmd = s.pendingInput.trim()
        if (cmd) {
          s.commandMarkers.push({ command: cmd, at: Date.now(), lineCount: s.ring.getTotalLineCount() })
          if (s.commandMarkers.length > 60) s.commandMarkers = s.commandMarkers.slice(-60)
        }
        s.pendingInput = ''
        continue
      }
      if (ch === '\u007f' || ch === '\b') {
        s.pendingInput = s.pendingInput.slice(0, -1)
        continue
      }
      if (ch >= ' ' && ch !== '\u0000') {
        s.pendingInput += ch
        if (s.pendingInput.length > 400) {
          s.pendingInput = s.pendingInput.slice(-400)
        }
      }
    }
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
    } else if (!opts.password) {
      const fallbackKey = await tryReadDefaultPrivateKey()
      if (fallbackKey) {
        connectConfig.privateKey = fallbackKey
        if (opts.passphrase) {
          connectConfig.passphrase = opts.passphrase
        }
      }
    }

    if (!connectConfig.password && !connectConfig.privateKey) {
      throw new Error(
        '请提供密码或私钥路径；若留空，请在本机用户目录 .ssh 下放置 id_ed25519、id_rsa 或 id_ecdsa（与 OpenSSH 默认行为一致）'
      )
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
              owner,
              commandMarkers: [],
              pendingInput: ''
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
    this.trackWriteCommand(s, data)
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
