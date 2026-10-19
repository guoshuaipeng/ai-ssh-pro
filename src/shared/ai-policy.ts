/**
 * M21: one AI execution policy with three choices — 只看不改 / 改动前问我 / 放手执行
 * (suggest / ask / auto) — plus an "auto also runs high-risk" switch under auto that never
 * applies to a production host. Every surface (settings, host card, AI chip, main process)
 * resolves the policy through resolveAiPolicy so they always agree.
 */
import type { SafetyTier } from './safety-tier'
import { aiEffectiveLevel, type AiHostProtection } from './ai-write-guard'

export const AI_POLICIES = ['suggest', 'ask', 'auto'] as const
export type AiPolicy = (typeof AI_POLICIES)[number]
export const DEFAULT_AI_POLICY: AiPolicy = 'ask'

export function isAiPolicy(v: unknown): v is AiPolicy {
  return v === 'suggest' || v === 'ask' || v === 'auto'
}

/** Old four tiers → three policies. observe→suggest, confirm→ask, trusted/autopilot→auto. */
export function migrateAiPolicy(v: unknown): AiPolicy | undefined {
  if (isAiPolicy(v)) return v
  if (v === 'observe') return 'suggest'
  if (v === 'confirm') return 'ask'
  if (v === 'trusted' || v === 'autopilot') return 'auto'
  return undefined
}

const ORDER: Record<AiPolicy, number> = { suggest: 0, ask: 1, auto: 2 }

/** The more careful of two policies (missing adds nothing). */
export function stricterPolicy(a: AiPolicy | undefined, b: AiPolicy | undefined): AiPolicy | undefined {
  if (!a) return b
  if (!b) return a
  return ORDER[a] <= ORDER[b] ? a : b
}

export type AiPolicySettings = {
  aiPolicy?: unknown
  aiAutoHighRisk?: boolean | null
  /** Legacy field, read only when aiPolicy is missing. */
  safetyTier?: unknown
}

export function globalAiPolicy(settings: AiPolicySettings | null | undefined): AiPolicy {
  return migrateAiPolicy(settings?.aiPolicy) ?? migrateAiPolicy(settings?.safetyTier) ?? DEFAULT_AI_POLICY
}

export type AiPolicySource = 'temp' | 'host' | 'global'

export type ResolvedAiPolicy = {
  /** What the user picked at the winning scope. */
  chosen: AiPolicy
  /** What actually applies after host protection. */
  effective: AiPolicy
  source: AiPolicySource
  /** Set when protection lowered the choice. */
  cappedBy: 'production' | 'readonly' | null
  /** Auto may also run high-risk commands (switch on, effective auto, normal host). */
  autoHighRisk: boolean
}

export function resolveAiPolicy(input: {
  settings: AiPolicySettings | null | undefined
  hostPolicy?: unknown
  tempOverride?: unknown
  protection?: AiHostProtection | null
}): ResolvedAiPolicy {
  const temp = migrateAiPolicy(input.tempOverride)
  const host = migrateAiPolicy(input.hostPolicy)
  const source: AiPolicySource = temp ? 'temp' : host ? 'host' : 'global'
  const chosen = temp ?? host ?? globalAiPolicy(input.settings)
  const level = aiEffectiveLevel(input.protection)
  let effective = chosen
  let cappedBy: ResolvedAiPolicy['cappedBy'] = null
  if (level === 'readonly' && chosen !== 'suggest') {
    effective = 'suggest'
    cappedBy = 'readonly'
  } else if (level === 'production' && chosen === 'auto') {
    effective = 'ask'
    cappedBy = 'production'
  }
  const autoHighRisk = effective === 'auto' && level === 'normal' && input.settings?.aiAutoHighRisk === true
  return { chosen, effective, source, cappedBy, autoHighRisk }
}

/** Internal gate tier for planCommandConfirm. Auto uses the autopilot rules with no allow list. */
export function policyTier(p: AiPolicy): SafetyTier {
  if (p === 'suggest') return 'observe'
  if (p === 'auto') return 'autopilot'
  return 'confirm'
}

type LegacyMaps = {
  safetyTierHosts?: Record<string, unknown> | null
  safetyTierSessions?: Record<string, unknown> | null
  autopilotAllowHosts?: readonly string[] | null
}

export function hasLegacyHostPolicies(s: LegacyMaps | null | undefined): boolean {
  if (!s) return false
  return (
    Object.keys(s.safetyTierHosts ?? {}).length > 0 ||
    Object.keys(s.safetyTierSessions ?? {}).length > 0 ||
    (s.autopilotAllowHosts ?? []).length > 0
  )
}

/**
 * One-time move of the old per-host / per-session maps onto host profiles.
 * safetyTierHosts → host policy; a session override for that host merges in only if stricter;
 * a session override alone moves over only when stricter than global;
 * an autopilot allow-listed host becomes host "auto" when nothing else is set.
 * A profile that already has aiPolicy keeps it.
 */
export function migrateLegacyHostPolicies<P extends { id: string; host?: string; label?: string; aiPolicy?: AiPolicy }>(
  legacy: LegacyMaps | null | undefined,
  profiles: readonly P[],
  globalPolicy: AiPolicy = DEFAULT_AI_POLICY
): { profiles: P[]; changed: number } {
  let changed = 0
  const allow = new Set((legacy?.autopilotAllowHosts ?? []).map((r) => String(r).trim()).filter(Boolean))
  const out = profiles.map((p) => {
    if (isAiPolicy(p.aiPolicy)) return p
    const hostP = migrateAiPolicy(legacy?.safetyTierHosts?.[p.id])
    const sessP = migrateAiPolicy(legacy?.safetyTierSessions?.[p.id])
    // A session-only override becomes the host's only when it is stricter than the global policy.
    const sessStricter = sessP && sessP !== globalPolicy && stricterPolicy(sessP, globalPolicy) === sessP ? sessP : undefined
    let next: AiPolicy | undefined = hostP ? stricterPolicy(hostP, sessP) : sessStricter
    if (!next && [p.id, p.host, p.label].some((k) => k && allow.has(k.trim()))) next = 'auto'
    if (!next) return p
    changed += 1
    return { ...p, aiPolicy: next }
  })
  return { profiles: out, changed }
}
