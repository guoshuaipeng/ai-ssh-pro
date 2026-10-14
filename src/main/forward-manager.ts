import net from 'node:net'
import type { Client } from 'ssh2'
import type { ActiveForward } from '../shared/ipc'
import { mt } from './main-i18n'

/**
 * Runtime registry of local port forwards (127.0.0.1:localPort → remoteHost:remotePort over SSH).
 * Profile-configured forwards and ones added from the Port forwarding panel both live here,
 * so the UI can list, count and stop them.
 */
type Entry = ActiveForward & { stop: () => void }

const entries = new Map<string, Entry>()
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

export function startTrackedForward(
  sessionId: string,
  client: Client,
  spec: unknown,
  source: 'profile' | 'manual'
): Promise<ActiveForward> {
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
  const entry: Entry = {
    id,
    sessionId,
    source,
    localPort,
    remoteHost,
    remotePort,
    status: 'starting',
    connections: 0,
    totalConnections: 0,
    bytesIn: 0,
    bytesOut: 0,
    createdAt: Date.now(),
    stop: () => {
      for (const s of sockets) s.destroy()
      sockets.clear()
      try {
        server.close()
      } catch {
        /* ignore */
      }
    }
  }
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

export function stopForward(id: string): boolean {
  const e = entries.get(id)
  if (!e) return false
  e.stop()
  entries.delete(id)
  return true
}

export function stopSessionForwards(sessionId: string): number {
  let n = 0
  for (const e of [...entries.values()]) if (e.sessionId === sessionId && stopForward(e.id)) n++
  return n
}
