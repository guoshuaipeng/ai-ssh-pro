/** X3: remember broadcast targets for the session; drop ids whose tabs closed. */

/** Keep only session ids that are still connected candidates. */
export function pruneBroadcastTargets(targets: readonly string[], liveIds: readonly string[]): string[] {
  if (!targets.length) return []
  const live = new Set(liveIds)
  return targets.filter((id) => live.has(id))
}

/** Broadcast stays on only when at least two live targets remain. */
export function broadcastStillActive(enabled: boolean, liveTargets: readonly string[]): boolean {
  return Boolean(enabled && liveTargets.length >= 2)
}

/**
 * Picker defaults: remembered live targets if any; otherwise all live sessions
 * (first-time enable). Never returns dead ids.
 */
export function initialBroadcastSelection(remembered: readonly string[], liveIds: readonly string[]): string[] {
  const live = [...liveIds]
  if (!live.length) return []
  const kept = pruneBroadcastTargets(remembered, live)
  if (kept.length) return kept
  return live
}
