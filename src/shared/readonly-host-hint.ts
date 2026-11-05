/**
 * Round 29: read-only host calm banner inside the AI panel.
 * Symmetric to prod-auto-hint: visibility only — main process already blocks AI writes.
 * Elevation may unlock the terminal; AI still never writes on readonly (aiEffectiveLevel).
 */
import type { AiPolicy, ResolvedAiPolicy } from './ai-policy'

export type ReadonlyHostHint = {
  source: ResolvedAiPolicy['source']
  chosen: AiPolicy
  effective: AiPolicy
  /** True when protection forced suggest. */
  capped: boolean
}

export function readonlyHostHint(input: {
  level: 'normal' | 'production' | 'readonly'
  policy: Pick<ResolvedAiPolicy, 'chosen' | 'effective' | 'source' | 'cappedBy'>
}): ReadonlyHostHint | null {
  if (input.level !== 'readonly') return null
  return {
    source: input.policy.source,
    chosen: input.policy.chosen,
    effective: input.policy.effective,
    capped: input.policy.cappedBy === 'readonly' || input.policy.effective === 'suggest'
  }
}
