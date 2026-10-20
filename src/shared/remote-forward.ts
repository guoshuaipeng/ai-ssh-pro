/** B3: remote (-R) port forwarding helpers shared by main and renderer. No electron imports. */

import type { ProtectionLevel } from './protection'

export type ForwardDirection = 'L' | 'R' | 'D'

export type RemoteForwardSpec = {
  /** Address the SSH server binds on its side. Servers without GatewayPorts force loopback. */
  bindAddr: string
  /** 0 lets the server pick a port. */
  bindPort: number
  /** Target reached from this computer. */
  localHost: string
  localPort: number
}

export type SpecError = { field: 'bindPort' | 'localPort' | 'bindAddr' | 'localHost'; zh: string; en: string }

const HOST_RE = /^[A-Za-z0-9.:_\-[\]]{1,255}$/

export function parseRemoteSpec(raw: unknown): { ok: true; spec: RemoteForwardSpec } | { ok: false; error: SpecError } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bindPort = Number(o.remotePort ?? o.bindPort)
  const localPort = Number(o.localPort)
  const bindAddr = String(o.remoteHost ?? o.bindAddr ?? '').trim() || '127.0.0.1'
  const localHost = String(o.localHost ?? '').trim() || '127.0.0.1'
  if (!Number.isInteger(bindPort) || bindPort < 0 || bindPort > 65535) {
    return { ok: false, error: { field: 'bindPort', zh: `无效的远端监听端口: ${String(o.remotePort ?? o.bindPort)}`, en: `Invalid remote listen port: ${String(o.remotePort ?? o.bindPort)}` } }
  }
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
    return { ok: false, error: { field: 'localPort', zh: `无效的本地目标端口: ${String(o.localPort)}`, en: `Invalid local target port: ${String(o.localPort)}` } }
  }
  if (!HOST_RE.test(bindAddr)) return { ok: false, error: { field: 'bindAddr', zh: '无效的远端监听地址', en: 'Invalid remote listen address' } }
  if (!HOST_RE.test(localHost)) return { ok: false, error: { field: 'localHost', zh: '无效的本地目标主机', en: 'Invalid local target host' } }
  return { ok: true, spec: { bindAddr, bindPort, localHost, localPort } }
}

/**
 * -R opens a listening port on the server, so it counts as a write.
 * Returns the i18n key of the reason, or null when allowed. Local -L stays allowed (read-only access).
 */
export function remoteForwardBlockReason(direction: ForwardDirection, level: ProtectionLevel, elevated: boolean): 'pfR.blockedReadonly' | null {
  if (direction !== 'R') return null
  if (level === 'readonly' && !elevated) return 'pfR.blockedReadonly'
  return null
}

/** Binding a non-loopback address exposes the local service to the server's network. */
export function exposesBeyondLoopback(bindAddr: string): boolean {
  const a = bindAddr.trim().toLowerCase()
  return !(a === '' || a === 'localhost' || a === '::1' || /^127\./.test(a))
}

export function remoteForwardLabel(spec: { bindAddr: string; bindPort: number; localHost: string; localPort: number }): string {
  return `-R ${spec.bindAddr}:${spec.bindPort} → ${spec.localHost}:${spec.localPort}`
}

/** Specs kept from a lost session so a reconnect can bring manual forwards back. */
export type CarrySpec = {
  direction: ForwardDirection
  localHost?: string
  localPort: number
  remoteHost: string
  remotePort: number
}

export class CarryStore {
  private map = new Map<string, { at: number; specs: CarrySpec[] }>()
  constructor(
    private ttlMs = 30 * 60_000,
    private max = 50
  ) {}

  put(sessionId: string, specs: CarrySpec[], now = Date.now()): void {
    this.prune(now)
    if (!specs.length) return
    this.map.set(sessionId, { at: now, specs: specs.map((s) => ({ ...s })) })
    while (this.map.size > this.max) {
      const first = this.map.keys().next().value
      if (first === undefined) break
      this.map.delete(first)
    }
  }

  take(sessionId: string, now = Date.now()): CarrySpec[] {
    this.prune(now)
    const hit = this.map.get(sessionId)
    this.map.delete(sessionId)
    return hit ? hit.specs : []
  }

  size(): number {
    return this.map.size
  }

  private prune(now: number): void {
    for (const [k, v] of this.map) if (now - v.at > this.ttlMs) this.map.delete(k)
  }
}
