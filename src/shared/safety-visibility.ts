/**
 * P13-2: safety tier ladder visibility. Three bands the user can read at a glance:
 * 只读 / 需确认 / 全自动. Default stays confirm — manual-leaning. Risky ops still confirm.
 * Same vibe as P12 risk badges — no new Core-A fixtures.
 */
import { DEFAULT_SAFETY_TIER, type SafetyTier } from './safety-tier'

export type SafetyLadderBand = 'readonly' | 'confirm' | 'autopilot'

export const SAFETY_LADDER_BANDS = ['readonly', 'confirm', 'autopilot'] as const

/** Confirm is the product default — manual-leaning, not autopilot. */
export const SAFETY_DEFAULT_BAND: SafetyLadderBand = 'confirm'

export function safetyLadderBand(tier: SafetyTier | null | undefined): SafetyLadderBand {
  if (tier === 'observe') return 'readonly'
  if (tier === 'autopilot') return 'autopilot'
  if (tier === 'trusted' || tier === 'confirm') return 'confirm'
  return SAFETY_DEFAULT_BAND
}

export function safetyBandForDefaultTier(): SafetyLadderBand {
  return safetyLadderBand(DEFAULT_SAFETY_TIER)
}

/** Tiers that sit under each band — settings radios keep four values, badge shows three. */
export function tiersInBand(band: SafetyLadderBand): readonly SafetyTier[] {
  if (band === 'readonly') return ['observe']
  if (band === 'autopilot') return ['autopilot']
  return ['confirm', 'trusted']
}

export function safetyBandTone(band: SafetyLadderBand): 'ok' | 'warn' | 'danger' {
  if (band === 'readonly') return 'ok'
  if (band === 'autopilot') return 'danger'
  return 'warn'
}
