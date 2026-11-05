/** One-line working-memory label. Blank goals render nothing. */
export function visibleWorkingGoal(goal: string | null | undefined): string | null {
  const text = (goal ?? '').replace(/\s+/g, ' ').trim()
  return text || null
}

/** Evidence kinds shown in the AI panel memory chip (not a dump). */
export type MemoryEvidenceKind = 'hostFact' | 'observation' | 'recentCommand'

export type MemoryEvidenceItem = {
  kind: MemoryEvidenceKind
  text: string
}

export type MemoryEvidenceView = {
  goal: string | null
  items: MemoryEvidenceItem[]
  count: number
  /** Compact title for the chip (ellipsis-friendly). */
  summaryLine: string | null
}

export type MemorySnapshotInput = {
  goal?: string | null
  hostFacts?: string[]
  observations?: Array<string | { text?: string | null } | null | undefined>
  recentCommands?: string[]
  maxItems?: number
  maxChars?: number
}

function cleanLine(raw: string | null | undefined, maxChars: number): string | null {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length <= maxChars) return text
  return text.slice(0, Math.max(1, maxChars - 1)).trimEnd() + '…'
}

function observationText(row: string | { text?: string | null } | null | undefined): string | null {
  if (typeof row === 'string') return row
  if (row && typeof row === 'object' && typeof row.text === 'string') return row.text
  return null
}

/**
 * Build a small, honest evidence list for the AI panel.
 * Caps item count and per-line length — never a full memory dump.
 */
export function buildMemoryEvidenceView(input: MemorySnapshotInput): MemoryEvidenceView {
  const maxItems = Math.max(0, Math.min(8, input.maxItems ?? 3))
  const maxChars = Math.max(12, Math.min(120, input.maxChars ?? 48))
  const goal = visibleWorkingGoal(input.goal)
  const items: MemoryEvidenceItem[] = []

  const push = (kind: MemoryEvidenceKind, raw: string | null | undefined) => {
    if (items.length >= maxItems) return
    const text = cleanLine(raw, maxChars)
    if (!text) return
    if (items.some((it) => it.text === text)) return
    items.push({ kind, text })
  }

  for (const fact of input.hostFacts ?? []) push('hostFact', fact)
  for (const obs of input.observations ?? []) push('observation', observationText(obs))
  for (const cmd of input.recentCommands ?? []) push('recentCommand', cmd)

  const count = items.length
  const summaryLine = count === 0 ? null : items.map((it) => it.text).join('；')
  return { goal, items, count, summaryLine }
}
