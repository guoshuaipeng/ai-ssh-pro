/**
 * M20: host protection for AI writes, enforced in the main process.
 * The renderer guards (writeGuarded, ai-run's host-name confirm) only cover renderer paths;
 * the agent writes over SSH directly, so it checks the same protection here before every write.
 */
import type { ProtectionLevel } from './protection'
import type { CommandKind, SafetyMode } from './safety-tier'

export type AiHostProtection = {
  /** Effective level incl. demo-host default and per-tab temporary read-only. */
  level: ProtectionLevel
  /** Inside the elevation window (sudo-style unlock). Elevation lifts production, never read-only from a tab lock. */
  elevated?: boolean
}

const RANK: Record<ProtectionLevel, number> = { normal: 0, production: 1, readonly: 2 }

export function isProtectionLevel(v: unknown): v is ProtectionLevel {
  return v === 'normal' || v === 'production' || v === 'readonly'
}

/** The stricter of two protection reports (a missing report adds nothing). Elevated only if every report says so. */
export function stricterProtection(
  a: AiHostProtection | null | undefined,
  b: AiHostProtection | null | undefined
): AiHostProtection {
  const rows = [a, b].filter((r): r is AiHostProtection => Boolean(r && isProtectionLevel(r.level)))
  if (!rows.length) return { level: 'normal', elevated: false }
  let level: ProtectionLevel = 'normal'
  for (const r of rows) if (RANK[r.level] > RANK[level]) level = r.level
  return { level, elevated: rows.every((r) => r.elevated === true) }
}

/** Read the chat payload's safetyContext. Legacy payloads only carry `production: boolean`. */
export function protectionFromSafetyContext(
  ctx: { protection?: unknown; production?: boolean; elevated?: boolean } | null | undefined
): AiHostProtection | null {
  if (!ctx) return null
  if (isProtectionLevel(ctx.protection)) return { level: ctx.protection, elevated: ctx.elevated === true }
  if (ctx.production === true) return { level: 'production', elevated: ctx.elevated === true }
  return null
}

/** Level the AI is held to. Elevation lifts production to normal; read-only stays read-only. */
export function aiEffectiveLevel(p: AiHostProtection | null | undefined): ProtectionLevel {
  if (!p) return 'normal'
  if (p.level === 'readonly') return 'readonly'
  if (p.level === 'production' && p.elevated) return 'normal'
  return p.level
}

/**
 * Cap the safety-tier mode by host protection.
 * - read-only: the AI never writes; every command becomes a suggestion.
 * - production (M25): no cap; the banner is a reminder and the chosen policy applies.
 */
export function capSafetyModeForProtection(
  mode: SafetyMode | undefined,
  p: AiHostProtection | null | undefined,
  kind?: CommandKind
): SafetyMode | undefined {
  const level = aiEffectiveLevel(p)
  if (level === 'readonly') return 'suggest'
  void kind
  return mode
}

export type AiWriteVerdict = { allow: true } | { allow: false; reason: 'readonly' }

/**
 * Last check right before the agent writes to SSH, with the protection read at that moment.
 * `approved` = a person agreed to this exact step (not an auto decision).
 */
export function aiWriteVerdict(
  p: AiHostProtection | null | undefined,
  opts: { approved: boolean; kind?: CommandKind }
): AiWriteVerdict {
  const level = aiEffectiveLevel(p)
  if (level === 'readonly') return { allow: false, reason: 'readonly' }
  void opts
  return { allow: true }
}
