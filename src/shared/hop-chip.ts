/** UX-58: one visual state per hop chip. Failure is explicit; the other three stay distinct. */

export type HopVisual = 'unknown' | 'probing' | 'ok' | 'bad'

export type HopProbeLike = { hop: number; ok: boolean; ms?: number; reason?: string }

export function hopVisual(opts: {
  diagramIndex: number
  role: 'local' | 'hop' | 'target'
  structural: boolean
  probing: boolean
  probe: readonly HopProbeLike[] | null
}): { visual: HopVisual; ms?: number; reason?: string } {
  if (opts.role === 'local') return { visual: 'unknown' }
  if (opts.structural) return { visual: 'bad' }
  const row = opts.probe?.find((item) => item.hop === opts.diagramIndex)
  if (row) {
    if (row.ok) return { visual: 'ok', ms: row.ms }
    return { visual: 'bad', reason: row.reason || '' }
  }
  if (opts.probing) return { visual: 'probing' }
  return { visual: 'unknown' }
}
