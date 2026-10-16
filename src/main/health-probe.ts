/**
 * L7b short-lived summary probes.
 * kind: 'health-probe' — not a terminal, not a monitor tab, not a recent-connection.
 * Unknown or changed host keys are refused. No password prompt and no key material in errors.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client, type ConnectConfig } from 'ssh2'
import { applyConnectAuth } from './ssh-auth'
import { checkHostKey } from './known-hosts'
import { execBounded } from './ssh-batch'
import { mt } from './main-i18n'
import type { SshSessionManager } from './ssh-manager'
import { chainFromProfile, probeHostKeyError } from '../shared/jump-chain'
import { DEMO_HOST } from '../shared/demo-host'
import {
  HEALTH_PROBE_KIND,
  PROBE_HARD_MAX,
  buildProbeCommand,
  classifyProbeFailure,
  demoExtras,
  demoHealthMetrics,
  parseProbeOutput,
  probeExtrasOf,
  sanitizeProbeReason,
  type HealthProbeResult,
  type ProbeExtras,
  type ProbeFailureCode
} from '../shared/health-probe'
import type { SshConnectOptions } from '../shared/ipc'

export type HealthProbeRequest = SshConnectOptions & {
  profileId: string
  reuseSessionId?: string
  extras?: Partial<ProbeExtras>
}

export type { HealthProbeResult }

type Held = {
  kind: typeof HEALTH_PROBE_KIND
  profileId: string
  client: Client
  jumps: Client[]
  lastUsed: number
}

const held = new Map<string, Held>()
let inflight = 0

const DEFAULT_KEY_NAMES = ['id_ed25519', 'id_rsa', 'id_ecdsa'] as const

async function readDefaultKey(): Promise<Buffer | null> {
  const base = join(homedir(), '.ssh')
  for (const name of DEFAULT_KEY_NAMES) {
    const fp = join(base, name)
    if (!existsSync(fp)) continue
    try {
      return await readFile(fp)
    } catch {
      /* ignore unreadable key */
    }
  }
  return null
}

export function healthProbeStats(): { open: number; inflight: number; kind: typeof HEALTH_PROBE_KIND } {
  return { open: held.size, inflight, kind: HEALTH_PROBE_KIND }
}

function endClient(client: Client | undefined): void {
  if (!client) return
  try {
    client.end()
  } catch {
    /* already closed */
  }
}

function dropHeld(profileId: string): void {
  const row = held.get(profileId)
  if (!row) return
  held.delete(profileId)
  endClient(row.client)
  for (const jump of row.jumps) endClient(jump)
}

export function releaseHealthProbes(profileId?: string): void {
  if (profileId) {
    dropHeld(profileId)
    return
  }
  for (const id of [...held.keys()]) dropHeld(id)
}

export function sweepHealthProbes(maxIdleMs: number, now = Date.now()): void {
  const limit = Number.isFinite(maxIdleMs) ? Math.max(0, maxIdleMs) : 30_000
  for (const [id, row] of held) {
    if (now - row.lastUsed >= limit) dropHeld(id)
  }
}

function fail(profileId: string, code: ProbeFailureCode, error: string, at = Date.now()): HealthProbeResult {
  return {
    profileId,
    ok: false,
    cpu: null,
    mem: null,
    disk: null,
    latencyMs: null,
    at,
    via: 'none',
    kind: HEALTH_PROBE_KIND,
    code,
    error: sanitizeProbeReason(error)
  }
}

function extrasOf(req: HealthProbeRequest): ProbeExtras {
  return probeExtrasOf({
    extraLoad: req.extras?.load === true,
    extraInode: req.extras?.inode === true,
    extraMounts: (req.extras?.mounts?.length ?? 0) > 0,
    mounts: req.extras?.mounts ?? ['/']
  })
}

async function readMetrics(client: Client, extras: ProbeExtras): Promise<ReturnType<typeof parseProbeOutput>> {
  const r = await execBounded(client, buildProbeCommand(extras), 12_000, 256 * 1024)
  if (r.timedOut) throw new Error('timeout')
  const snap = parseProbeOutput(r.stdout, extras)
  if (snap.cpu == null && snap.mem == null && snap.disk == null) {
    throw new Error(mt('无法读取资源信息', 'Could not read resource data'))
  }
  return snap
}

function connectClient(client: Client, config: ConnectConfig, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      endClient(client)
      reject(new Error('timeout'))
    }, timeoutMs)
    const done = (err?: Error) => {
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }
    client.once('ready', () => done())
    client.once('error', (err) => done(err instanceof Error ? err : new Error(String(err))))
    try {
      client.connect(config)
    } catch (e) {
      done(e instanceof Error ? e : new Error(String(e)))
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

async function openProbeClients(opts: HealthProbeRequest, timeoutMs: number): Promise<{ client: Client; jumps: Client[] }> {
  const host = opts.host.trim()
  const port = opts.port || 22
  const username = opts.username.trim()
  const hops = chainFromProfile(opts)
  const steps = [
    ...hops.map((hop) => ({
      host: hop.host,
      port: hop.port || 22,
      username: hop.username,
      auth: { ...hop, authMode: hop.auth, agentSocket: opts.agentSocket, certificatePath: undefined as string | undefined },
      allowDefault: hop.auth !== 'password'
    })),
    {
      host,
      port,
      username,
      auth: opts,
      allowDefault: opts.authMode !== 'agent'
    }
  ]
  const clients: Client[] = []
  let sock: NodeJS.ReadWriteStream | undefined
  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!
      const client = new Client()
      clients.push(client)
      let keyDenied: string | null = null
      const cfg: ConnectConfig = {
        host: step.host,
        port: step.port,
        username: step.username,
        readyTimeout: timeoutMs,
        keepaliveInterval: 30_000,
        keepaliveCountMax: 3,
        hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
          const denied = probeHostKeyError(checkHostKey(step.host, step.port, key).status)
          if (denied) {
            keyDenied = mt(denied.zh, denied.en)
            verify(false)
            return
          }
          verify(true)
        },
        ...(sock ? { sock: sock as unknown as ConnectConfig['sock'] } : {})
      }
      await applyConnectAuth(cfg, step.auth, { allowDefaultKey: step.allowDefault, readDefaultKey })
      try {
        await connectClient(client, cfg, timeoutMs)
      } catch (err) {
        const reason = keyDenied || (err instanceof Error ? err.message : String(err))
        throw new Error(reason)
      }
      const next = steps[i + 1]
      if (next) sock = await forwardOut(client, next.host, next.port)
    }
  } catch (err) {
    for (const client of clients) endClient(client)
    throw err
  }
  const client = clients[clients.length - 1]
  if (!client) throw new Error('connect failed')
  return { client, jumps: clients.slice(0, -1) }
}

function asRequest(payload: unknown): HealthProbeRequest | null {
  if (!payload || typeof payload !== 'object') return null
  const o = payload as Partial<HealthProbeRequest>
  if (typeof o.profileId !== 'string' || !o.profileId) return null
  if (typeof o.host !== 'string' || typeof o.username !== 'string') return null
  return o as HealthProbeRequest
}

export async function sampleHealth(sshManager: SshSessionManager, payload: unknown): Promise<HealthProbeResult> {
  const req = asRequest(payload)
  const at = Date.now()
  if (!req) return fail('', 'other', 'bad request', at)
  if (inflight >= PROBE_HARD_MAX) return fail(req.profileId, 'busy', 'busy', at)

  const extras = extrasOf(req)
  if (req.demo || req.host === DEMO_HOST) {
    const m = demoHealthMetrics(req.profileId)
    return { profileId: req.profileId, ok: true, ...m, ...demoExtras(req.profileId, extras), latencyMs: 9, at, via: 'demo', kind: HEALTH_PROBE_KIND }
  }

  inflight += 1
  try {
    const reuse = typeof req.reuseSessionId === 'string' ? req.reuseSessionId : ''
    const live = reuse ? sshManager.getClient(reuse) : undefined
    if (live) {
      dropHeld(req.profileId)
      const started = Date.now()
      const metrics = await readMetrics(live, extras)
      return { profileId: req.profileId, ok: true, ...metrics, latencyMs: Date.now() - started, at: Date.now(), via: 'session', kind: HEALTH_PROBE_KIND }
    }

    let row = held.get(req.profileId)
    if (!row) {
      const opened = await openProbeClients(req, 12_000)
      row = { kind: HEALTH_PROBE_KIND, profileId: req.profileId, client: opened.client, jumps: opened.jumps, lastUsed: Date.now() }
      held.set(req.profileId, row)
    }
    const started = Date.now()
    try {
      const metrics = await readMetrics(row.client, extras)
      row.lastUsed = Date.now()
      return { profileId: req.profileId, ok: true, ...metrics, latencyMs: Date.now() - started, at: row.lastUsed, via: 'probe', kind: HEALTH_PROBE_KIND }
    } catch (err) {
      dropHeld(req.profileId)
      const message = sanitizeProbeReason(err instanceof Error ? err.message : String(err))
      return fail(req.profileId, classifyProbeFailure(message), message)
    }
  } catch (err) {
    const message = sanitizeProbeReason(err instanceof Error ? err.message : String(err))
    return fail(req.profileId, classifyProbeFailure(message), message)
  } finally {
    inflight = Math.max(0, inflight - 1)
  }
}
