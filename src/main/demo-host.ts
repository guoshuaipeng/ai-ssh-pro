import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { Client } from 'ssh2'
import type { SessionMeta, SshConnectResult, SshDataEvent, SshStatusEvent } from '../shared/ipc'
import {
  DEMO_HOST,
  DEMO_PROMPT,
  DEMO_SESSION_PREFIX,
  DEMO_USER,
  demoCommandOutput,
  demoExecOutput,
  demoListDir,
  demoNormalizePath,
  demoReadFile,
  demoStat,
  demoWelcome,
  isDemoSessionId
} from '../shared/demo-host'
import { RingBuffer } from './ring-buffer'
import { getLocale } from './app-store'
import { mt } from './main-i18n'
import { appendRecording } from './session-recorder'

type DemoSession = { sessionId: string; meta: SessionMeta; owner: WebContents; ring: RingBuffer; line: string }

const readOnly = () => new Error(mt('演示主机为只读，不支持此操作', 'The demo host is read-only'))

/** UX-34: simulated multi-dir SFTP for the demo host. Browse/read OK; writes return a friendly read-only error. */
function demoSftp(): unknown {
  const now = () => Math.floor(Date.now() / 1000)
  const attrsOf = (dir: boolean, size: number) => ({
    size,
    mtime: now() - 3600,
    mode: dir ? 0o40755 : 0o100644,
    isDirectory: () => dir,
    isFile: () => !dir
  })
  const base: Record<string, unknown> = {
    readdir: (path: string, cb: (err: Error | undefined, list: unknown[]) => void) => {
      const files = demoListDir(path)
      cb(
        undefined,
        files.map((f) => ({
          filename: f.name,
          longname: (f.dir ? 'd' : '-') + 'rw-r--r-- 1 demo demo ' + f.size + ' ' + f.name,
          attrs: attrsOf(f.dir, f.size)
        }))
      )
    },
    realpath: (p: string, cb: (err: Error | undefined, abs: string) => void) => {
      cb(undefined, demoNormalizePath(p === '.' || !p ? '/home/demo' : p))
    },
    stat: (path: string, cb: (err: Error | undefined, st: unknown) => void) => {
      const st = demoStat(path)
      if (!st) cb(new Error('ENOENT: ' + path), undefined)
      else cb(undefined, attrsOf(st.isDirectory, st.size))
    },
    lstat: (path: string, cb: (err: Error | undefined, st: unknown) => void) => {
      const st = demoStat(path)
      if (!st) cb(new Error('ENOENT: ' + path), undefined)
      else cb(undefined, attrsOf(st.isDirectory, st.size))
    },
    fastGet: (remote: string, local: string, a: unknown, b?: unknown) => {
      const cb = (typeof a === 'function' ? a : b) as (err?: Error | null) => void
      const content = demoReadFile(remote)
      if (content == null) {
        cb(new Error('ENOENT: ' + remote))
        return
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').writeFileSync(local, content, 'utf8')
        cb(null)
      } catch (e) {
        cb(e instanceof Error ? e : new Error(String(e)))
      }
    },
    createReadStream: (path: string) => {
      const { Readable } = require('node:stream') as typeof import('node:stream')
      const content = demoReadFile(path) ?? ''
      return Readable.from([Buffer.from(content, 'utf8')])
    },
    // ssh2's string-path readdir opens a handle then READDIR; keep both styles working.
    opendir: (path: string, cb: (err: Error | undefined, handle: Buffer) => void) => {
      cb(undefined, Buffer.from(demoNormalizePath(path || '/home/demo'), 'utf8'))
    },
    close: (_handle: Buffer, cb?: (err?: Error | null) => void) => {
      cb?.(null)
    },
    end: () => undefined
  }
  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === 'then') return undefined
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop]
      return (...args: unknown[]) => {
        const cb = args[args.length - 1]
        if (typeof cb === 'function') (cb as (e: Error) => void)(readOnly())
      }
    }
  })
}

let tick = 0
/** ssh2 Client stand-in: exec answers with canned fixtures so the monitor and toolbox show demo data. */
function createDemoClient(): Client {
  const client = {
    exec(command: string, a: unknown, b?: unknown) {
      const cb = (typeof a === 'function' ? a : b) as (err: Error | undefined, stream: unknown) => void
      const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter; close: () => void; destroy: () => void; end: () => void }
      stream.stderr = new EventEmitter()
      stream.close = () => undefined
      stream.destroy = () => undefined
      stream.end = () => undefined
      cb(undefined, stream)
      const r = demoExecOutput(command, tick++)
      setTimeout(() => {
        if (r.stdout) stream.emit('data', Buffer.from(r.stdout, 'utf8'))
        stream.emit('close', r.code)
      }, 40)
      return true
    },
    sftp(cb: (err: Error | undefined, sftp: unknown) => void) {
      cb(undefined, demoSftp())
      return true
    },
    forwardOut(...args: unknown[]) {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') (cb as (e: Error) => void)(readOnly())
      return true
    },
    on() {
      return client
    },
    once() {
      return client
    },
    removeListener() {
      return client
    },
    end() {
      return undefined
    }
  }
  return client as unknown as Client
}

/** G1: in-process simulated shell sessions ("demo:<uuid>"). Nothing is executed anywhere. */
export class DemoHostManager {
  private sessions = new Map<string, DemoSession>()
  private client = createDemoClient()

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getClient(sessionId: string): Client | undefined {
    return isDemoSessionId(sessionId) && this.sessions.has(sessionId) ? this.client : undefined
  }

  getMeta(sessionId: string): SessionMeta | undefined {
    return this.sessions.get(sessionId)?.meta
  }

  open(owner: WebContents, opts: { label?: string; termCols?: number; termRows?: number }): SshConnectResult {
    const sessionId = `${DEMO_SESSION_PREFIX}${randomUUID()}`
    const meta: SessionMeta = {
      host: DEMO_HOST,
      port: 22,
      username: DEMO_USER,
      label: opts.label,
      connectedAt: Date.now(),
      termCols: opts.termCols ?? 120,
      termRows: opts.termRows ?? 32,
      kind: 'ssh'
    }
    const rec: DemoSession = { sessionId, meta, owner, ring: new RingBuffer(2000), line: '' }
    this.sessions.set(sessionId, rec)
    const locale = (() => {
      try {
        return getLocale()
      } catch {
        return 'zh-CN'
      }
    })()
    setTimeout(() => this.emit(rec, `${demoWelcome(locale)}\r\n${DEMO_PROMPT}`), 120)
    if (!owner.isDestroyed()) owner.send('ssh:status', { sessionId, status: 'connected' })
    return { sessionId, meta }
  }

  private emit(rec: DemoSession, chunk: string): void {
    rec.ring.appendUtf8(chunk)
    appendRecording(rec.sessionId, chunk)
    if (rec.owner.isDestroyed()) return
    const payload: SshDataEvent = { sessionId: rec.sessionId, chunk }
    rec.owner.send('ssh:data', payload)
  }

  write(sessionId: string, data: string | Uint8Array): boolean {
    const rec = this.sessions.get(sessionId)
    if (!rec) return false
    const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8')
    let echo = ''
    let esc: 0 | 1 | 2 = 0 // 1 = after ESC, 2 = inside a CSI sequence (arrow keys etc. are ignored)
    for (const ch of text) {
      if (esc === 1) {
        esc = ch === '[' || ch === 'O' ? 2 : 0
        continue
      }
      if (esc === 2) {
        if (/[A-Za-z~]/.test(ch)) esc = 0
        continue
      }
      if (ch === '\x1b') {
        esc = 1
        continue
      }
      if (ch === '\r' || ch === '\n') {
        const r = demoCommandOutput(rec.line)
        rec.line = ''
        if (r.clear) {
          echo += '\x1b[2J\x1b[H' + DEMO_PROMPT
          continue
        }
        const body = r.output ? `${r.output.replace(/\n/g, '\r\n')}\r\n` : ''
        echo += `\r\n${body}${DEMO_PROMPT}`
      } else if (ch === '\x7f' || ch === '\b') {
        if (rec.line) {
          rec.line = rec.line.slice(0, -1)
          echo += '\b \b'
        }
      } else if (ch === '\x03') {
        rec.line = ''
        echo += `^C\r\n${DEMO_PROMPT}`
      } else if (ch < ' ') {
        // ignore other control keys in the demo shell
      } else {
        rec.line += ch
        echo += ch
      }
    }
    if (echo) this.emit(rec, echo)
    return true
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const rec = this.sessions.get(sessionId)
    if (!rec) return false
    rec.meta.termCols = cols
    rec.meta.termRows = rows
    return true
  }

  getRingSnapshot(sessionId: string, maxLines = 200): string | null {
    return this.sessions.get(sessionId)?.ring.getSnapshot(maxLines) ?? null
  }

  disconnect(sessionId: string): void {
    const rec = this.sessions.get(sessionId)
    if (!rec) return
    this.sessions.delete(sessionId)
    // Mirror real SSH teardown: renderer clears connectedSshSessions on ssh:status closed.
    if (!rec.owner.isDestroyed()) {
      const st: SshStatusEvent = { sessionId, status: 'closed', message: mt('连接已断开', 'Disconnected') }
      rec.owner.send('ssh:status', st)
    }
  }

  disconnectAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.disconnect(id)
    }
  }
}

export const demoHostManager = new DemoHostManager()
