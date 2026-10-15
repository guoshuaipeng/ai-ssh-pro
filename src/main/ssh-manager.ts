import { mt } from './main-i18n'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import { applyConnectAuth } from './ssh-auth'
import { chainFromProfile, formatHopFailure } from '../shared/jump-chain'
import { keepaliveIntervalMs } from '../shared/reconnect-policy'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { attachClientGuards } from './ssh-guards'
import type {
  SshConnectOptions,
  SshConnectResult,
  SessionMeta,
  SshDataEvent,
  SshStatusEvent,
  SshSnapshotOptions
} from '../shared/ipc'
import { RingBuffer } from './ring-buffer'
import { checkHostKey, trustHostKey } from './known-hosts'
import { promptHostKey } from './host-key-prompt'
import { startTrackedForward, stopSessionForwards } from './forward-manager'
import { appendRecording } from './session-recorder'
import { assertSafeDockerId } from './docker-manager'
import { demoHostManager } from './demo-host'
import { isDemoSessionId } from '../shared/demo-host'

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32
const RING_MAX_LINES = 4000
const KEEPALIVE_COUNT_MAX = 3

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

type AuthFields = {
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

async function applyAuth(
  connectConfig: ConnectConfig,
  auth: AuthFields & {
    authMode?: 'password' | 'key' | 'agent'
    certificatePath?: string
    agentSocket?: string
  },
  opts: { allowDefaultKey: boolean }
): Promise<void> {
  await applyConnectAuth(connectConfig, auth, {
    allowDefaultKey: opts.allowDefaultKey && auth.authMode !== 'agent',
    readDefaultKey: tryReadDefaultPrivateKey
  })
}

function makeHostVerifier(
  owner: WebContents,
  host: string,
  port: number,
  hop?: { hopIndex: number; hopTotal: number }
): ConnectConfig['hostVerifier'] {
  return (key: Buffer, verify: (ok: boolean) => void) => {
    void (async () => {
      try {
        const result = checkHostKey(host, port, key)
        if (result.status === 'trusted') {
          verify(true)
          return
        }

        const decision = await promptHostKey(owner, {
          host,
          port,
          fingerprint: result.fingerprint,
          reason: result.status,
          previousFingerprint: result.status === 'changed' ? result.previousFingerprint : undefined,
          hopIndex: hop?.hopIndex,
          hopTotal: hop?.hopTotal
        })

        if (!decision.accept) {
          verify(false)
          return
        }

        if (decision.alwaysTrust) {
          trustHostKey(host, port, key)
        }
        verify(true)
      } catch (e) {
        console.error('[ssh] hostVerifier error:', e)
        verify(false)
      }
    })()
  }
}

function connectClient(client: Client, config: ConnectConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      reject(err)
    }
    const ok = () => {
      if (settled) return
      settled = true
      resolve()
    }

    client.once('ready', ok)
    client.once('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (/verification failed|host key/i.test(msg)) {
        fail(new Error(mt('主机密钥未通过验证（已取消连接或指纹不匹配）', 'Host key not verified (cancelled or fingerprint mismatch)')))
        return
      }
      fail(err instanceof Error ? err : new Error(String(err)))
    })

    try {
      client.connect(config)
    } catch (e) {
      fail(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

function forwardOutToTarget(
  jumpClient: Client,
  targetHost: string,
  targetPort: number
): Promise<import('stream').Duplex> {
  return new Promise((resolve, reject) => {
    jumpClient.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error(mt('跳板机无法转发到目标主机', 'Jump host could not forward to the target')))
        return
      }
      resolve(stream)
    })
  })
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
  /** 用于重连；含认证信息，仅存内存 */
  connectOpts: SshConnectOptions
  jumpClient?: Client
  jumpClients?: Client[]
  forwardCleanups: Array<() => void>
  /** false：复用父会话 Client（如 docker exec），断开时不 end 父连接 */
  ownsClient: boolean
}

type JumpSlot = { clients: Client[]; at: number }

function endQuiet(client: Client): void {
  try {
    client.end()
  } catch {
    /* ignore */
  }
}

function jumpSlotKey(opts: SshConnectOptions): string {
  const hops = chainFromProfile({ jumpChain: opts.jumpChain, jumpHost: opts.jumpHost })
  const chain = hops.map((h) => `${h.username}@${h.host}:${h.port || 22}`).join('|')
  return `${chain}>${opts.username}@${opts.host.trim()}:${opts.port ?? 22}`
}

export class SshSessionManager {
  private sessions = new Map<string, ManagedSession>()
  /** Successful jump clients parked after a later hop failed. */
  private jumpSlots = new Map<string, JumpSlot>()

  private dropJumpSlot(key: string): void {
    const slot = this.jumpSlots.get(key)
    if (!slot) return
    this.jumpSlots.delete(key)
    for (const client of slot.clients) endQuiet(client)
  }

  get(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId)
  }

  /** 供 SFTP 等复用同一会话的 ssh2 Client（目标机） */
  getClient(sessionId: string): Client | undefined {
    // G1: the demo host answers exec/sftp with simulated data
    return this.sessions.get(sessionId)?.client ?? demoHostManager.getClient(sessionId)
  }

  listMeta(): SessionMeta[] {
    return [...this.sessions.values()].map((s) => ({ ...s.meta }))
  }

  getRingSnapshot(sessionId: string, options?: number | SshSnapshotOptions): string | null {
    if (isDemoSessionId(sessionId)) {
      return demoHostManager.getRingSnapshot(sessionId, typeof options === 'number' ? options : options?.maxLines ?? 200)
    }
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

  private runForwardCleanups(s: ManagedSession): void {
    const cleanups = s.forwardCleanups.splice(0, s.forwardCleanups.length)
    for (const fn of cleanups) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
  }

  private endClients(s: Pick<ManagedSession, 'client' | 'jumpClient' | 'jumpClients'>): void {
    try {
      s.client.end()
    } catch {
      /* ignore */
    }
    const jumps = s.jumpClients?.length ? s.jumpClients : s.jumpClient ? [s.jumpClient] : []
    for (const jump of jumps) {
      try {
        jump.end()
      } catch {
        /* ignore */
      }
    }
  }

  private teardownSession(sessionId: string, s: ManagedSession): void {
    if (this.sessions.get(sessionId) === s) this.sessions.delete(sessionId)
    this.runForwardCleanups(s)
    if (!s.ownsClient) return
    this.endClients(s)
    // docker exec tabs ride on this client; close them too instead of leaving dead tabs behind
    for (const [id, child] of [...this.sessions]) {
      if (child.ownsClient || child.client !== s.client) continue
      this.sessions.delete(id)
      if (!child.owner.isDestroyed()) {
        const st: SshStatusEvent = { sessionId: id, status: 'closed', message: mt('父连接已断开', 'Parent connection closed') }
        child.owner.send('ssh:status', st)
      }
      try {
        child.stream.close()
      } catch {
        /* ignore */
      }
    }
  }

  async connect(opts: SshConnectOptions, owner: WebContents): Promise<SshConnectResult> {
    const host = opts.host.trim()
    const port = opts.port ?? 22
    const username = opts.username.trim()
    if (!host || !username) {
      throw new Error(mt('host 与 username 不能为空', 'Host and username are required'))
    }

    const cols = opts.termCols ?? DEFAULT_COLS
    const rows = opts.termRows ?? DEFAULT_ROWS
    const sessionId = randomUUID()
    const connectedAt = Date.now()

    const meta: SessionMeta = {
      host,
      port,
      username,
      label: opts.label?.trim() || `${username}@${host}`,
      connectedAt,
      termCols: cols,
      termRows: rows
    }

    const hops = chainFromProfile({ jumpChain: opts.jumpChain, jumpHost: opts.jumpHost })
    const jumpClients: Client[] = []
    const targetClient = new Client()
    const authMissing = mt(
      '请提供密码或私钥路径；若留空，请在本机用户目录 .ssh 下放置 id_ed25519、id_rsa 或 id_ecdsa（与 OpenSSH 默认行为一致）',
      'Provide a password or private key path, or put id_ed25519 / id_rsa / id_ecdsa in ~/.ssh (same as OpenSSH)'
    )

    const failCleanup = () => {
      try {
        targetClient.end()
      } catch {
        /* ignore */
      }
      for (const jump of jumpClients) {
        try {
          jump.end()
        } catch {
          /* ignore */
        }
      }
    }

    const hasAuth = (cfg: ConnectConfig) => Boolean(cfg.password || cfg.privateKey || cfg.agent)

    const slotKey = jumpSlotKey(opts)
    const keepaliveInterval = keepaliveIntervalMs(opts.keepAliveSec)
    const preferResume = opts.jumpRetryFromFailedHop !== false
    try {
      let sock: import('stream').Duplex | undefined
      let start = 0
      if (!opts.resumeFromHop) this.dropJumpSlot(slotKey)
      else if (preferResume && opts.resumeFromHop > 1) {
        const slot = this.jumpSlots.get(slotKey)
        if (slot && slot.clients.length >= opts.resumeFromHop - 1) {
          const kept = slot.clients.slice(0, opts.resumeFromHop - 1)
          this.jumpSlots.delete(slotKey)
          jumpClients.push(...kept)
          const next = opts.resumeFromHop - 1 < hops.length ? hops[opts.resumeFromHop - 1]! : { host, port }
          try {
            sock = await forwardOutToTarget(kept[kept.length - 1]!, next.host, next.port || 22)
            start = opts.resumeFromHop - 1
          } catch {
            for (const client of kept) endQuiet(client)
            jumpClients.length = 0
            sock = undefined
            start = 0
          }
        }
      }
      for (let i = start; i < hops.length; i++) {
        const hop = hops[i]!
        const client = new Client()
        jumpClients.push(client)
        const hopConfig: ConnectConfig = {
          host: hop.host,
          port: hop.port || 22,
          username: hop.username,
          readyTimeout: 20000,
          keepaliveInterval,
          keepaliveCountMax: KEEPALIVE_COUNT_MAX,
          hostVerifier: makeHostVerifier(owner, hop.host, hop.port || 22, { hopIndex: i + 1, hopTotal: hops.length }),
          ...(sock ? { sock } : {})
        }
        try {
          if (!owner.isDestroyed()) owner.send('ssh:hop', { hop: i + 1, total: hops.length, name: hop.label || hop.host })
          await applyAuth(
            hopConfig,
            { ...hop, authMode: hop.auth, agentSocket: opts.agentSocket },
            { allowDefaultKey: hop.auth !== 'password' }
          )
          if (!hasAuth(hopConfig)) {
            throw new Error(
              mt('跳板机请提供密码或私钥路径；若留空，请在本机用户目录 .ssh 下放置默认私钥', 'Jump host needs a password or private key path; or put a default key in ~/.ssh')
            )
          }
          await connectClient(client, hopConfig)
          const next = i + 1 < hops.length ? hops[i + 1]! : { host, port }
          sock = await forwardOutToTarget(client, next.host, next.port || 22)
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          if (i > 0 && preferResume) {
            const kept = jumpClients.slice(0, i)
            const failed = jumpClients.slice(i)
            jumpClients.length = 0
            for (const dead of failed) endQuiet(dead)
            if (kept.length) this.jumpSlots.set(slotKey, { clients: kept, at: Date.now() })
          }
          throw new Error(formatHopFailure(i + 1, hops.length, hop.label || hop.host, `${hop.host}:${hop.port || 22}`, reason))
        }
      }

      const targetConfig: ConnectConfig = {
        username,
        readyTimeout: 20000,
        keepaliveInterval,
        keepaliveCountMax: KEEPALIVE_COUNT_MAX,
        hostVerifier: makeHostVerifier(owner, host, port),
        ...(sock ? { sock } : { host, port })
      }
      await applyAuth(targetConfig, opts, { allowDefaultKey: opts.authMode !== 'agent' })
      if (!hasAuth(targetConfig)) throw new Error(authMissing)
      await connectClient(targetClient, targetConfig)
      this.jumpSlots.delete(slotKey)
    } catch (e) {
      failCleanup()
      throw e instanceof Error ? e : new Error(String(e))
    }

    const normalizedOpts: SshConnectOptions = {
      ...opts,
      host,
      port,
      username,
      termCols: cols,
      termRows: rows
    }

    return await new Promise<SshConnectResult>((resolve, reject) => {
      let settled = false
      const fail = (err: Error) => {
        if (settled) return
        settled = true
        failCleanup()
        reject(err)
      }

      targetClient.shell(
        {
          cols,
          rows,
          term: 'xterm-256color'
        },
        (err, stream) => {
          if (err || !stream) {
            fail(err ?? new Error(mt('无法打开 shell', 'Could not open shell')))
            return
          }

          const ring = new RingBuffer(RING_MAX_LINES)
          // Per-stream decoders: a multi-byte char split across chunks must not become U+FFFD in history/recordings.
          const outDec = new StringDecoder('utf8')
          const errDec = new StringDecoder('utf8')
          const forwardCleanups: Array<() => void> = []

          const session: ManagedSession = {
            sessionId,
            meta,
            client: targetClient,
            stream,
            ring,
            owner,
            commandMarkers: [],
            pendingInput: '',
            connectOpts: normalizedOpts,
            jumpClient: jumpClients[0],
            jumpClients,
            forwardCleanups,
            ownsClient: true
          }

          stream.on('data', (buf: Buffer) => {
            const asText = outDec.write(buf)
            ring.appendUtf8(asText)
            appendRecording(sessionId, asText)
            if (!owner.isDestroyed()) {
              const payload: SshDataEvent = { sessionId, chunk: buf }
              owner.send('ssh:data', payload)
            }
          })

          stream.on('close', () => {
            if (this.sessions.get(sessionId) !== session) return
            ring.flushPartial()
            if (!owner.isDestroyed()) {
              const st: SshStatusEvent = { sessionId, status: 'closed', message: mt('连接已断开', 'Disconnected') }
              owner.send('ssh:status', st)
            }
            this.teardownSession(sessionId, session)
          })

          stream.stderr?.on('data', (buf: Buffer) => {
            const asText = errDec.write(buf)
            ring.appendUtf8(asText)
            appendRecording(sessionId, asText)
            if (!owner.isDestroyed()) {
              owner.send('ssh:data', { sessionId, chunk: buf })
            }
          })

          // 目标机 ready 后建立本地端口转发
          if (opts.forwards?.length) {
            for (const fwd of opts.forwards) {
              try {
                void startTrackedForward(sessionId, targetClient, fwd, 'profile').catch((e) =>
                  console.error('[ssh] port forward failed:', e instanceof Error ? e.message : e)
                )
              } catch (e) {
                console.error('[ssh] port forward rejected:', e instanceof Error ? e.message : e)
              }
            }
            forwardCleanups.push(() => stopSessionForwards(sessionId))
          }

          this.sessions.set(sessionId, session)

          const onLost = (reason: string) => {
            if (this.sessions.get(sessionId) !== session) return
            ring.flushPartial()
            if (!owner.isDestroyed()) {
              const st: SshStatusEvent = {
                sessionId,
                status: 'closed',
                message: reason === 'closed' ? mt('连接已断开', 'Disconnected') : mt(`连接已断开：${reason}`, `Disconnected: ${reason}`),
                unexpected: reason !== 'closed'
              }
              owner.send('ssh:status', st)
            }
            this.teardownSession(sessionId, session)
          }
          attachClientGuards(targetClient, 'target', onLost)
          for (const jump of jumpClients) attachClientGuards(jump, 'jump', onLost)

          if (!owner.isDestroyed()) {
            owner.send('ssh:status', {
              sessionId,
              status: 'connected'
            })
          }

          if (!settled) {
            settled = true
            resolve({ sessionId, meta })
          }
        }
      )
    })
  }

  write(sessionId: string, data: string | Uint8Array): boolean {
    if (isDemoSessionId(sessionId)) return demoHostManager.write(sessionId, data)
    const s = this.sessions.get(sessionId)
    if (!s) return false
    if (typeof data === 'string') {
      this.trackWriteCommand(s, data)
      return s.stream.write(data)
    }
    return s.stream.write(Buffer.from(data))
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    if (isDemoSessionId(sessionId)) return demoHostManager.resize(sessionId, cols, rows)
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

  execCommand(sessionId: string, command: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const client = this.getClient(sessionId)
    if (!client) return Promise.reject(new Error('no-session'))
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error('exec'))
          return
        }
        const out: Buffer[] = []
        const errBuf: Buffer[] = []
        const timer = setTimeout(() => {
          try {
            stream.close()
          } catch {
            /* ignore */
          }
          resolve({ code: null, stdout: Buffer.concat(out).toString('utf8'), stderr: 'timeout' })
        }, timeout)
        stream.on('data', (b: Buffer) => out.push(b))
        stream.stderr?.on('data', (b: Buffer) => errBuf.push(b))
        stream.on('close', (code: number | null) => {
          clearTimeout(timer)
          resolve({
            code: typeof code === 'number' ? code : null,
            stdout: Buffer.concat(out).toString('utf8'),
            stderr: Buffer.concat(errBuf).toString('utf8')
          })
        })
      })
    })
  }

  disconnect(sessionId: string): void {
    if (isDemoSessionId(sessionId)) return demoHostManager.disconnect(sessionId)
    const s = this.sessions.get(sessionId)
    if (!s) return
    try {
      s.stream.close()
    } catch {
      /* ignore */
    }
    this.teardownSession(sessionId, s)
  }

  /**
   * 在已连接 SSH 上打开 docker exec 交互终端（复用同一 Client，不新建 TCP）。
   */
  async openDockerExec(
    parentSessionId: string,
    containerId: string,
    owner: WebContents,
    opts?: { termCols?: number; termRows?: number; label?: string }
  ): Promise<SshConnectResult> {
    const parent = this.sessions.get(parentSessionId)
    if (!parent) throw new Error(mt('父 SSH 会话不存在或未连接', 'Parent SSH session is missing or disconnected'))

    const id = assertSafeDockerId(containerId, '容器')
    const cols = opts?.termCols ?? parent.meta.termCols ?? DEFAULT_COLS
    const rows = opts?.termRows ?? parent.meta.termRows ?? DEFAULT_ROWS
    const sessionId = randomUUID()
    const label =
      opts?.label?.trim() ||
      `docker exec ${id.slice(0, 12)}`
    const meta: SessionMeta = {
      host: parent.meta.host,
      port: parent.meta.port,
      username: parent.meta.username,
      label,
      connectedAt: Date.now(),
      termCols: cols,
      termRows: rows
    }

    // Prefer bash, fall back to sh; -i keeps a login-ish interactive shell.
    const remoteCmd = `docker exec -it ${id} sh -lc 'if command -v bash >/dev/null 2>&1; then exec bash -i; else exec sh -i; fi'`

    return await new Promise<SshConnectResult>((resolve, reject) => {
      let settled = false
      const fail = (err: Error) => {
        if (settled) return
        settled = true
        reject(err)
      }

      parent.client.exec(
        remoteCmd,
        {
          pty: {
            term: 'xterm-256color',
            cols,
            rows
          }
        },
        (err, stream) => {
          if (err || !stream) {
            fail(err ?? new Error(mt('无法打开 docker exec', 'Could not open docker exec')))
            return
          }

          const ring = new RingBuffer(RING_MAX_LINES)
          // Per-stream decoders: a multi-byte char split across chunks must not become U+FFFD in history/recordings.
          const outDec = new StringDecoder('utf8')
          const errDec = new StringDecoder('utf8')
          const session: ManagedSession = {
            sessionId,
            meta,
            client: parent.client,
            stream,
            ring,
            owner,
            commandMarkers: [],
            pendingInput: '',
            connectOpts: parent.connectOpts,
            jumpClient: undefined,
            forwardCleanups: [],
            ownsClient: false
          }

          stream.on('data', (buf: Buffer) => {
            const asText = outDec.write(buf)
            ring.appendUtf8(asText)
            appendRecording(sessionId, asText)
            if (!owner.isDestroyed()) {
              const payload: SshDataEvent = { sessionId, chunk: buf }
              owner.send('ssh:data', payload)
            }
          })

          stream.stderr?.on('data', (buf: Buffer) => {
            const asText = errDec.write(buf)
            ring.appendUtf8(asText)
            appendRecording(sessionId, asText)
            if (!owner.isDestroyed()) {
              owner.send('ssh:data', { sessionId, chunk: buf })
            }
          })

          stream.on('close', () => {
            if (this.sessions.get(sessionId) !== session) return
            ring.flushPartial()
            if (!owner.isDestroyed()) {
              const st: SshStatusEvent = { sessionId, status: 'closed', message: mt('容器终端已退出', 'Container terminal exited') }
              owner.send('ssh:status', st)
            }
            this.teardownSession(sessionId, session)
          })

          this.sessions.set(sessionId, session)

          if (!owner.isDestroyed()) {
            owner.send('ssh:status', { sessionId, status: 'connected' })
          }

          if (!settled) {
            settled = true
            resolve({ sessionId, meta })
          }
        }
      )
    })
  }

  /** 退出应用前断开全部 SSH，避免进程挂起导致桌面图标要点两次 */
  disconnectAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.disconnect(id)
    }
  }
}
