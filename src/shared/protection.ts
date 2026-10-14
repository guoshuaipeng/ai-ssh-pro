/** S2 / L4: client-side protection levels. Not a server permission system. */

export type ProtectionLevel = 'normal' | 'production' | 'readonly'

export const PROTECTION_LEVELS: readonly ProtectionLevel[] = ['normal', 'production', 'readonly']

export const ELEVATE_MS = 15 * 60 * 1000
export const ELEVATE_LS_KEY = 'aiss.protection.elevate.v1'

export type ElevateMap = Record<string, number>

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function effectiveLevel(profile: {
  protection?: ProtectionLevel | null
  demo?: boolean
} | null | undefined): ProtectionLevel {
  if (profile?.protection === 'production' || profile?.protection === 'readonly' || profile?.protection === 'normal') {
    return profile.protection
  }
  if (profile?.demo) return 'production'
  return 'normal'
}

/** env/tag says prod while the level is still normal — suggest turning protection on. */
export function wantsProductionHint(profile: {
  protection?: ProtectionLevel | null
  demo?: boolean
  tags?: string[]
  env?: string
} | null | undefined): boolean {
  if (!profile || effectiveLevel(profile) !== 'normal') return false
  if (profile.env && /^prod/i.test(profile.env)) return true
  return (profile.tags ?? []).some((t) => /^prod/i.test(t))
}

export function loadElevate(store: Store = globalThis.localStorage, now = Date.now()): ElevateMap {
  try {
    const raw = store.getItem(ELEVATE_LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ElevateMap
    const out: ElevateMap = {}
    for (const [id, until] of Object.entries(parsed ?? {})) {
      if (typeof until === 'number' && until > now) out[id] = until
    }
    return out
  } catch {
    return {}
  }
}

export function saveElevate(map: ElevateMap, store: Store = globalThis.localStorage): void {
  store.setItem(ELEVATE_LS_KEY, JSON.stringify(map))
}

export function isElevated(profileId: string | undefined, map: ElevateMap, now = Date.now()): boolean {
  if (!profileId) return false
  const until = map[profileId]
  return typeof until === 'number' && until > now
}

export function elevateUntil(profileId: string, now = Date.now(), ms = ELEVATE_MS): number {
  return now + ms
}

export function hostNameMatches(input: string, names: Array<string | undefined | null>): boolean {
  const n = input.trim().toLowerCase()
  if (!n) return false
  return names.some((name) => (name ?? '').trim().toLowerCase() === n)
}

export type WriteChannel = 'alert' | 'command' | 'sftp'

export type WriteDecision = 'allow' | 'block' | 'confirm-danger' | 'confirm-host' | 'confirm-host-danger'

/**
 * Gate a write.
 * Elevated sessions skip the level (danger still confirms).
 * Read-only blocks every send. Production asks for the host name on alerts, SFTP writes, and dangerous commands.
 */
export function decideWrite(
  level: ProtectionLevel,
  opts: { dangerous: boolean; elevated: boolean; channel: WriteChannel }
): WriteDecision {
  if (opts.elevated) return opts.dangerous ? 'confirm-danger' : 'allow'
  if (level === 'readonly') return 'block'
  if (level === 'production') {
    if (opts.dangerous) return 'confirm-host-danger'
    if (opts.channel === 'alert' || opts.channel === 'sftp') return 'confirm-host'
    return 'allow'
  }
  return opts.dangerous ? 'confirm-danger' : 'allow'
}
