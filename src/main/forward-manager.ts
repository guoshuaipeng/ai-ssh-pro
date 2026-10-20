import net from 'node:net'
import type { Client } from 'ssh2'
import type { ActiveForward, ForwardRestoreResult } from '../shared/ipc'
import { CarryStore, parseRemoteSpec, type CarrySpec } from '../shared/remote-forward'
import { mt } from './main-i18n'

/**
 * Runtime registry of port forwards.
 * L: 127.0.0.1:localPort → remoteHost:remotePort over SSH (forwardOut).
 * R: server remoteHost:remotePort → localHost:localPort on this computer (forwardIn).
 * Profile-configured forwards and ones added from the Port forwarding panel both live here,
 * so the UI can list, count and stop them. Manual ones are carried over to a reconnect.
 */
type Entry = ActiveForward & { stop: () => void }

const entries = new Map<string, Entry>()
const carry = new CarryStore()
let seq = 0

const pub = (e: Entry): ActiveForward => {
  const { stop: _s, ...rest } = e
  return { ...rest }
}

export function listForwards(sessionId?: string): ActiveForward[] {
  return [...entries.values()].filter((e) => !sessionId || e.sessionId === sessionId).map(pub)
}

export function validateForwardSpec(raw: unknown): { localPort: number; remoteHost: string; remotePort: number } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const localPort = Number(o.localPort)
  const remotePort = Number(o.remotePort)
  const remoteHost = String(o.remoteHost ?? '').trim() || '127.0.0.1'
  if (!Number.isInteger(localPort) || localPort < 0 || localPort > 65535) {
    throw new Error(mt(`无效的本地端口: ${String(o.localPort)}`, `Invalid local port: ${String(o.localPort)}`))
  }
  if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
    throw new Error(mt(`无效的远端端口: ${String(o.remotePort)}`, `Invalid remote port: ${String(o.remotePort)}`))
  }
  if (remoteHost.length > 255 || /\s/.test(remoteHost)) throw new Error(mt('无效的远端主机', 'Invalid remote host'))
  return { localPort, remoteHost, remotePort }
}

function directionOf(spec: unknown): 'L' | 'R' {
  return spec && typeof spec === 'object' && (spec as { direction?: unknown }).direction === 'R' ? 'R' : 'L'
}

export function startTrackedForward(
  sessionId: string,
  client: Client,
  spec: unknown,
  source: 'profile' | 'manual'
): Promise<ActiveForward> {
  return directionOf(spec) === 'R'
    ? startRemoteForward(sessionId, client, spec, source)
    : startLocalForward(sessionId, client, spec, source)
}

function baseEntry(
  id: string,
  sessionId: string,
  source: 'profile' | 'manual',
  direction: 'L' | 'R',
  f: { localHost?: string; localPort: number; remoteHost: string; remotePort: number },
  stop: () => void
): Entry {
  return {
    id,
    sessionId,
    source,
    direction,
    ...(f.localHost ? { localHost: f.localHost } : {}),
    localPort: f.localPort,
    remoteHost: f.remoteHost,
    remotePort: f.remotePort,
    status: 'starting',
    connections: 0,
    totalConnections: 0,
    bytesIn: 0,
    bytesOut: 0,
    createdAt: Date.now(),
    stop
  }
}

function startLocalForward(sessionId: string, client: Client, spec: unknown, source: 'profile' | 'manual'): Promise<ActiveForward> {
  const { localPort, remoteHost, remotePort } = validateForwardSpec(spec)
  const id = `fwd-${++seq}`
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    const e = entries.get(id)
    if (e) {
      e.connections++
      e.totalConnections++
    }
    sockets.add(socket)
    socket.on('close', () => {
      sockets.delete(socket)
      const x = entries.get(id)
      if (x && x.connections > 0) x.connections--
    })
    socket.on('error', () => socket.destroy())
    try {
      client.forwardOut(socket.remoteAddress || '127.0.0.1', socket.remotePort || 0, remoteHost, remotePort, (err, stream) => {
        if (err || !stream) {
          const x = entries.get(id)
          if (x) x.lastError = err?.message ?? 'forwardOut failed'
          socket.destroy()
          return
        }
        stream.on('data', (d: Buffer) => {
          const x = entries.get(id)
          if (x) x.bytesIn += d.length
        })
        stream.on('error', () => socket.destroy())
        stream.on('close', () => socket.destroy())
        socket.on('close', () => {
          try {
            stream.close()
          } catch {
            /* ignore */
          }
        })
        // count only once piping starts so no early bytes are consumed before the channel exists
        socket.on('data', (d: Buffer) => {
          const x = entries.get(id)
          if (x) x.bytesOut += d.length
        })
        socket.pipe(stream)
        stream.pipe(socket)
      })
    } catch (e) {
      const x = entries.get(id)
      if (x) x.lastError = e instanceof Error ? e.message : String(e)
      socket.destroy()
    }
  })
  const entry = baseEntry(id, sessionId, source, 'L', { localPort, remoteHost, remotePort }, () => {
    for (const s of sockets) s.destroy()
    sockets.clear()
    try {
      server.close()
    } catch {
      /* ignore */
    }
  })
  entries.set(id, entry)
  return new Promise((resolve, reject) => {
    server.once('listening', () => {
      const addr = server.address()
      entry.localPort = typeof addr === 'object' && addr ? addr.port : localPort
      entry.status = 'listening'
      resolve(pub(entry))
    })
    server.on('error', (err: NodeJS.ErrnoException) => {
      const msg =
        err.code === 'EADDRINUSE'
          ? mt(`本地端口 ${localPort} 已被占用`, `Local port ${localPort} is already in use`)
          : err.message
      entry.lastError = msg
      if (entry.status === 'starting') {
        entry.status = 'error'
        if (source === 'manual') entries.delete(id)
        reject(new Error(msg))
      }
    })
    server.listen(localPort, '127.0.0.1')
  })
}

/* ---------- remote (-R) ---------- */

type TcpInfo = { destIP: string; destPort: number; srcIP: string; srcPort: number }
type Accept = () => NodeJS.ReadWriteStream & { close?: () => void; destroy?: () => void }
type RemoteHandler = (info: TcpInfo, accept: Accept, reject: () => void) => void

/** One 'tcp connection' listener per client, dispatched by the bound port. */
const dispatchers = new WeakMap<Client, Map<number, RemoteHandler>>()

function handlersFor(client: Client): Map<number, RemoteHandler> {
  let m = dispatchers.get(client)
  if (m) return m
  const map = new Map<number, RemoteHandler>()
  m = map
  dispatchers.set(client, map)
  ;(client as unknown as NodeJS.EventEmitter).on('tcp connection', (info: TcpInfo, accept: Accept, reject: () => void) => {
    const h = map.get(Number(info?.destPort))
    if (h) h(info, accept, reject)
    else {
      try {
        reject()
      } catch {
        /* ignore */
      }
    }
  })
  return map
}

function remoteErrorText(err: Error, bindAddr: string, bindPort: number): string {
  const m = err.message || ''
  if (/request failed|rejected|denied|administratively/i.test(m)) {
    return mt(
      `服务器拒绝在 ${bindAddr}:${bindPort} 监听（端口被占用，或 sshd 设置了 AllowTcpForwarding no / 非回环地址需 GatewayPorts）`,
      `The server refused to listen on ${bindAddr}:${bindPort} (port in use, AllowTcpForwarding no, or GatewayPorts needed for a non-loopback address)`
    )
  }
  return m
}

function startRemoteForward(sessionId: string, client: Client, raw: unknown, source: 'profile' | 'manual'): Promise<ActiveForward> {
  const parsed = parseRemoteSpec(raw)
  if (!parsed.ok) return Promise.reject(new Error(mt(parsed.error.zh, parsed.error.en)))
  const { bindAddr, bindPort, localHost, localPort } = parsed.spec
  const id = `fwd-${++seq}`
  const sockets = new Set<net.Socket>()
  const handlers = handlersFor(client)
  let boundPort = bindPort
  let bound = false

  const entry = baseEntry(id, sessionId, source, 'R', { localHost, localPort, remoteHost: bindAddr, remotePort: bindPort }, () => {
    for (const s of sockets) s.destroy()
    sockets.clear()
    if (handlers.get(boundPort) === onConn) handlers.delete(boundPort)
    if (bound) {
      try {
        client.unforwardIn(bindAddr, boundPort, () => undefined)
      } catch {
        /* connection already gone */
      }
    }
  })

  const onConn: RemoteHandler = (_info, accept) => {
    let stream: ReturnType<Accept>
    try {
      stream = accept()
    } catch {
      return
    }
    entry.connections++
    entry.totalConnections++
    const socket = net.connect(localPort, localHost)
    sockets.add(socket)
    let closed = false
    const done = () => {
      if (closed) return
      closed = true
      sockets.delete(socket)
      if (entry.connections > 0) entry.connections--
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      try {
        stream.close?.() ?? stream.destroy?.()
      } catch {
        /* ignore */
      }
    }
    socket.on('error', (err: NodeJS.ErrnoException) => {
      entry.lastError =
        err.code === 'ECONNREFUSED'
          ? mt(`本地 ${localHost}:${localPort} 未在监听`, `Nothing is listening on local ${localHost}:${localPort}`)
          : err.message
      done()
    })
    socket.on('close', done)
    stream.on('error', done)
    stream.on('close', done)
    stream.on('data', (d: Buffer) => {
      entry.bytesIn += d.length
    })
    socket.on('data', (d: Buffer) => {
      entry.bytesOut += d.length
    })
    stream.pipe(socket)
    socket.pipe(stream)
  }

  entries.set(id, entry)
  return new Promise((resolve, reject) => {
    const fail = (msg: string) => {
      entry.lastError = msg
      entry.status = 'error'
      if (source === 'manual') entries.delete(id)
      reject(new Error(msg))
    }
    if (bindPort !== 0 && handlers.has(bindPort)) {
      // checked before asking the server so the existing binding is left alone
      return fail(mt(`远端端口 ${bindPort} 已在本会话中转发`, `Remote port ${bindPort} is already forwarded in this session`))
    }
    try {
      client.forwardIn(bindAddr, bindPort, (err, port) => {
        if (err) return fail(remoteErrorText(err, bindAddr, bindPort))
        bound = true
        boundPort = bindPort === 0 && typeof port === 'number' && port > 0 ? port : bindPort
        entry.remotePort = boundPort
        handlers.set(boundPort, onConn)
        entry.status = 'listening'
        resolve(pub(entry))
      })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  })
}

/* ---------- lifecycle ---------- */

export function stopForward(id: string): boolean {
  const e = entries.get(id)
  if (!e) return false
  e.stop()
  entries.delete(id)
  return true
}

/** Session ended: stop everything and keep the manual specs so a reconnect can restore them. */
export function stopSessionForwards(sessionId: string): number {
  const mine = [...entries.values()].filter((e) => e.sessionId === sessionId)
  const keep: CarrySpec[] = mine
    .filter((e) => e.source === 'manual' && e.status === 'listening')
    .map((e) => ({
      direction: e.direction,
      ...(e.localHost ? { localHost: e.localHost } : {}),
      localPort: e.localPort,
      remoteHost: e.remoteHost,
      remotePort: e.remotePort
    }))
  if (keep.length) carry.put(sessionId, keep)
  let n = 0
  for (const e of mine) if (stopForward(e.id)) n++
  return n
}

/**
 * Bring the manual forwards of a lost session to its replacement.
 * allowRemote=false (read-only) skips -R and reports it instead of failing silently.
 */
export async function restoreForwards(
  fromSessionId: string,
  toSessionId: string,
  client: Client,
  allowRemote: boolean
): Promise<ForwardRestoreResult> {
  const specs = carry.take(fromSessionId)
  const out: ForwardRestoreResult = { restored: [], skipped: [] }
  for (const s of specs) {
    if (s.direction === 'R' && !allowRemote) {
      out.skipped.push({ spec: s, reason: 'readonly' })
      continue
    }
    try {
      out.restored.push(await startTrackedForward(toSessionId, client, s, 'manual'))
    } catch (e) {
      out.skipped.push({ spec: s, reason: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}

/** Test hook. */
export function __resetForwardsForTest(): void {
  for (const e of entries.values()) e.stop()
  entries.clear()
  seq = 0
}
