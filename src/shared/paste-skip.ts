/**
 * D7b: when the multi-line paste preview can be skipped.
 * - production / read-only hosts always preview (the "don't ask again" box is hidden there)
 * - risky lines always preview
 * - otherwise skip when the user ticked "don't ask again" for this host, or when the remote
 *   shell has bracketed paste on (the text lands in the prompt as one block and waits for Enter)
 */
import type { PastePlan } from './paste-plan'

export const PASTE_SKIP_KEY = 'aiss.paste.skipHosts.v1'

export type PasteGate = { strict: boolean; skipHost: boolean; bracketed: boolean }

export type PasteDecision = 'paste' | 'preview'

export function pasteDecision(plan: Pick<PastePlan, 'multiline' | 'risky'>, g: PasteGate): PasteDecision {
  if (!plan.multiline) return 'paste'
  if (g.strict || plan.risky.length > 0) return 'preview'
  if (g.skipHost || g.bracketed) return 'paste'
  return 'preview'
}

export function canSkipHost(strict: boolean, hostKey: string): boolean {
  return !strict && Boolean(hostKey)
}

export function parseSkipHosts(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(-200) : []
  } catch {
    return []
  }
}

export function withSkipHost(list: string[], hostKey: string, on: boolean): string[] {
  const rest = list.filter((h) => h !== hostKey)
  return on && hostKey ? [...rest, hostKey].slice(-200) : rest
}
