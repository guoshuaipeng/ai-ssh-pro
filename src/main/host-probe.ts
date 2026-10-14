import { Socket } from 'node:net'
import type { HostProbeResult, HostProbeTarget } from '../shared/host-status'

/** One TCP connect to host:port; resolves with latency in ms or null when unreachable (H2). */
export function probeTcp(host: string, port: number, timeoutMs = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const started = Date.now()
    const sock = new Socket()
    let done = false
    const finish = (v: number | null) => {
      if (done) return
      done = true
      sock.destroy()
      resolve(v)
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(Date.now() - started))
    sock.once('timeout', () => finish(null))
    sock.once('error', () => finish(null))
    try {
      sock.connect(port, host)
    } catch {
      finish(null)
    }
  })
}

export async function probeHosts(targets: unknown[]): Promise<HostProbeResult[]> {
  const list = targets
    .map((t) => t as Partial<HostProbeTarget>)
    .filter((t): t is HostProbeTarget => typeof t?.id === 'string' && typeof t?.host === 'string' && Boolean(t.host))
    .slice(0, 200)
  const out: HostProbeResult[] = []
  // small concurrency so a long host list does not open hundreds of sockets at once
  const queue = [...list]
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const port = Number.isFinite(t.port) && t.port > 0 ? t.port : 22
      const ms = await probeTcp(t.host, port)
      out.push({ id: t.id, latencyMs: ms, checkedAt: Date.now() })
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, list.length) }, worker))
  return out
}
