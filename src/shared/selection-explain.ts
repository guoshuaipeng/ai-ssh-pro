/** A6: a terminal selection becomes a read-only explanation and an optional command draft. */

export type SelectionRisk = 'low' | 'medium' | 'high'

export type SelectionExplainDraft = {
  /** Read-only summary. Empty only when a command draft still has something to show. */
  summary: string
  /** Suggested command. Absent means the reply is explanation only. */
  command?: string
  riskLevel: SelectionRisk
  notes?: string
}

export type SelectionExplainPlan =
  | { status: 'empty' }
  | { status: 'unconfigured' }
  | { status: 'ready'; text: string }

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function selectionText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\u0000/g, '')
    .trim()
}

export function canExplainSelection(raw: unknown): boolean {
  return selectionText(raw).length > 0
}

/** Empty selection wins over a missing key, so the caller can toast instead of opening a card. */
export function planSelectionExplain(opts: { text: unknown; configured: boolean }): SelectionExplainPlan {
  const text = selectionText(opts.text)
  if (!text) return { status: 'empty' }
  if (!opts.configured) return { status: 'unconfigured' }
  return { status: 'ready', text }
}

export function selectionRisk(raw: unknown): SelectionRisk {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (s === 'low' || s === 'safe') return 'low'
  if (s === 'high' || s === 'danger') return 'high'
  return 'medium'
}

export function selectionRiskClass(level: unknown): 'ai-risk-low' | 'ai-risk-medium' | 'ai-risk-high' {
  const n = selectionRisk(level)
  if (n === 'low') return 'ai-risk-low'
  if (n === 'high') return 'ai-risk-high'
  return 'ai-risk-medium'
}

/** Map onto the risk words the existing confirm path already understands. */
export function selectionRiskToAi(level: SelectionRisk): 'safe' | 'caution' | 'danger' {
  if (level === 'high') return 'danger'
  if (level === 'low') return 'safe'
  return 'caution'
}

/** A selection draft never runs on its own. Risk does not bypass that. */
export function selectionCommandAutoRuns(): false {
  return false
}

/**
 * Agree only asks the existing confirm path. Disagree drops the draft.
 * Neither choice writes to the remote by itself.
 */
export function selectionDraftChoice(choice: 'agree' | 'disagree'): { confirm: boolean; discard: boolean; write: false } {
  if (choice === 'disagree') return { confirm: false, discard: true, write: false }
  return { confirm: true, discard: false, write: false }
}

function asObject(input: unknown): Record<string, unknown> | null {
  if (typeof input === 'string') {
    const t = input.trim()
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
    const body = (fenced ? fenced[1]! : t).trim()
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      const parsed = JSON.parse(body.slice(start, end + 1)) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return parsed as Record<string, unknown>
    } catch {
      return null
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

/**
 * Parse a model object into a draft. `execute` / `autoRun` are ignored:
 * the card never treats them as permission to write.
 */
export function normalizeSelectionExplain(input: unknown): SelectionExplainDraft | null {
  const o = asObject(input)
  if (!o) return null
  const summary = clip(o.summary, 2000) || clip(o.description, 2000) || clip(o.cause, 2000)
  const command = clip(o.command, 500).replace(/[\r\n]+/g, ' ').trim()
  const notes = clip(o.notes, 600) || undefined
  if (!summary && !command) return null
  return {
    summary,
    command: command || undefined,
    riskLevel: selectionRisk(o.riskLevel ?? o.risk),
    notes
  }
}
