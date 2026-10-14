/** H2: host online status shown next to each saved connection. */
export type HostProbeTarget = { id: string; host: string; port: number }
export type HostProbeResult = { id: string; latencyMs: number | null; checkedAt: number }
export type HostStatusLevel = 'online' | 'slow' | 'offline' | 'checking'

export const HOST_PROBE_INTERVAL_MS = 60_000
export const HOST_SLOW_MS = 200

export function hostStatusLevel(r: HostProbeResult | undefined): HostStatusLevel {
  if (!r) return 'checking'
  if (r.latencyMs == null) return 'offline'
  return r.latencyMs >= HOST_SLOW_MS ? 'slow' : 'online'
}
