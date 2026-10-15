/** Per-hop connectivity check for the jump-host editor. Stops at the first failed hop. */
import { Client, type ConnectConfig } from 'ssh2'
import { applyConnectAuth } from './ssh-auth'
import { checkHostKey } from './known-hosts'
import { mt } from './main-i18n'
import { probeHostKeyError, type HopProbeRow, type JumpHop } from '../shared/jump-chain'
import type { SshConnectOptions } from '../shared/ipc'

function connectClient(client: Client, config: ConnectConfig, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        client.end()
      } catch {
        /* ignore */
      }
      reject(new Error('timeout'))
    }, timeoutMs)
    const fail = (err: Error) => {
      clearTimeout(timer)
      reject(err)
    }
    client.once('ready', () => {
      clearTimeout(timer)
      resolve()
    })
    client.once('error', (err) => fail(err instanceof Error ? err : new Error(String(err))))
    try {
      client.connect(config)
    } catch (e) {
      fail(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

function forwardOut(client: Client, host: string, port: number): Promise<NodeJS.ReadWriteStream> {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
      if (err || !stream) reject(err ?? new Error('forward failed'))
      else resolve(stream)
    })
  })
}

export async function probeJumpChain(
  opts: SshConnectOptions & { timeoutMs?: number }
): Promise<HopProbeRow[]> {
  const hops = (opts.jumpChain ?? []).slice(0, 5)
  const target = { host: opts.host, port: opts.port || 22, username: opts.username }
  const steps: Array<{ hop: JumpHop | null; host: string; port: number; username: string; name: string }> = [
    ...hops.map((hop) => ({
      hop,
      host: hop.host,
      port: hop.port || 22,
      username: hop.username,
      name: hop.label || hop.host
    })),
    { hop: null, host: target.host, port: target.port, username: target.username, name: target.host }
  ]
  const rows: HopProbeRow[] = []
  const clients: Client[] = []
  let sock: NodeJS.ReadWriteStream | undefined
  const total = steps.length
  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!
      const started = Date.now()
      const client = new Client()
      clients.push(client)
      let hostKeyError: string | null = null
      const cfg: ConnectConfig = {
        host: step.host,
        port: step.port,
        username: step.username,
        readyTimeout: opts.timeoutMs ?? 8000,
        hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
          const denied = probeHostKeyError(checkHostKey(step.host, step.port, key).status)
          if (denied) {
            hostKeyError = mt(denied.zh, denied.en)
            verify(false)
            return
          }
          verify(true)
        },
        ...(sock ? { sock: sock as unknown as ConnectConfig['sock'] } : {})
      }
      try {
        if (step.hop) {
          await applyConnectAuth(cfg, { ...step.hop, authMode: step.hop.auth, agentSocket: opts.agentSocket }, { allowDefaultKey: step.hop.auth !== 'password' })
        } else {
          await applyConnectAuth(cfg, opts, { allowDefaultKey: opts.authMode !== 'agent' })
        }
        await connectClient(client, cfg, opts.timeoutMs ?? 8000)
        rows.push({ hop: i + 1, total, name: step.name, addr: `${step.host}:${step.port}`, ok: true, ms: Date.now() - started })
        const next = steps[i + 1]
        if (next) sock = await forwardOut(client, next.host, next.port)
      } catch (err) {
        const reason = hostKeyError || (err instanceof Error ? err.message : String(err))
        rows.push({ hop: i + 1, total, name: step.name, addr: `${step.host}:${step.port}`, ok: false, ms: Date.now() - started, reason })
        break
      }
    }
  } finally {
    for (const c of clients) {
      try {
        c.end()
      } catch {
        /* ignore */
      }
    }
  }
  return rows
}
