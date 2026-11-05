/** H08: empty / error primary CTA helpers for AI panel (pure). */

import { aiErrorWantsSettings } from './ai-http-error'

export type AiEmptyGate = 'needs_config' | 'ready'

/** Unconfigured AI → config empty state; otherwise chat UI. */
export function aiEmptyGate(hasApiKey: boolean): AiEmptyGate {
  return hasApiKey ? 'ready' : 'needs_config'
}

export type AiErrorPrimary = 'settings' | 'retry'

/** Primary button on an AI error card. */
export function aiErrorPrimaryCta(errorCode?: string | null): AiErrorPrimary {
  return aiErrorWantsSettings(errorCode) ? 'settings' : 'retry'
}

/**
 * Key is present but no usable model id — show settings CTA, do not pretend ready.
 * Empty modelList with blank activeModel counts as missing.
 */
export function aiNeedsModelPick(activeModel: string | null | undefined, modelList: ReadonlyArray<string>): boolean {
  const cur = String(activeModel ?? '').trim()
  if (cur) return false
  // No model selected and nothing to fall back to
  return !modelList.some((m) => String(m ?? '').trim())
}

/** Resolve displayed model: prefer active if in list, else first list entry, else ''. */
export function resolveAiModelLabel(activeModel: string | null | undefined, modelList: ReadonlyArray<string>): string {
  const list = modelList.map((m) => String(m ?? '').trim()).filter(Boolean)
  const cur = String(activeModel ?? '').trim()
  if (cur && list.includes(cur)) return cur
  return list[0] ?? ''
}
