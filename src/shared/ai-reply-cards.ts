/** Plain-text fragments for AI reply cards. Metrics render as yellow highlights. */
export type HighlightPart = { kind: 'text' | 'mark' | 'strong'; text: string }

const METRIC_SOURCE =
  '(?<![A-Za-z0-9.])(?:\\d+(?:\\.\\d+)?\\s?%|\\d+(?:\\.\\d+)?\\s?(?:TiB|GiB|MiB|KiB|TB|GB|MB|KB|[TGMK])(?:\\s*\\/\\s*\\d+(?:\\.\\d+)?\\s?(?:TiB|GiB|MiB|KiB|TB|GB|MB|KB|[TGMK]))?)'

function pushMerged(out: HighlightPart[], part: HighlightPart): void {
  if (!part.text) return
  const prev = out[out.length - 1]
  if (prev && prev.kind === part.kind) prev.text += part.text
  else out.push({ kind: part.kind, text: part.text })
}

/** Split a chunk on key metrics (percent, size, size/size). */
export function splitMetricTokens(chunk: string): HighlightPart[] {
  const out: HighlightPart[] = []
  const re = new RegExp(METRIC_SOURCE, 'g')
  let last = 0
  for (const m of chunk.matchAll(re)) {
    const index = m.index ?? 0
    if (index > last) pushMerged(out, { kind: 'text', text: chunk.slice(last, index) })
    pushMerged(out, { kind: 'mark', text: m[0] })
    last = index + m[0].length
  }
  if (last < chunk.length) pushMerged(out, { kind: 'text', text: chunk.slice(last) })
  return out
}

/**
 * Highlight key numbers in assistant prose.
 * `**85%**` and bare `371G/466G` become marks. Long bold sentences stay strong, not a yellow wall.
 */
export function highlightKeyNumbers(input: string): HighlightPart[] {
  if (!input) return []
  const out: HighlightPart[] = []
  const bold = /\*\*([^*]+)\*\*/g
  let last = 0
  for (const m of input.matchAll(bold)) {
    const index = m.index ?? 0
    if (index > last) {
      for (const p of splitMetricTokens(input.slice(last, index))) pushMerged(out, p)
    }
    const inner = m[1] ?? ''
    const innerParts = splitMetricTokens(inner)
    const marked = innerParts.some((p) => p.kind === 'mark')
    if (marked) {
      for (const p of innerParts) pushMerged(out, p)
    } else if (/\d/.test(inner) && inner.trim().length <= 24) {
      pushMerged(out, { kind: 'mark', text: inner })
    } else if (inner) {
      pushMerged(out, { kind: 'strong', text: inner })
    }
    last = index + m[0].length
  }
  if (last < input.length) {
    for (const p of splitMetricTokens(input.slice(last))) pushMerged(out, p)
  }
  return out.length > 0 ? out : [{ kind: 'text', text: input }]
}

/** Command steps always need Agree / Decline. Risk level does not bypass confirmation. */
export function commandAutoRunAllowed(_riskLevel?: string | null): false {
  return false
}
