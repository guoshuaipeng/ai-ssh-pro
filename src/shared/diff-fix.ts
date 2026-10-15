/** L8b: Diff explain + fix draft. Same decision as W1. Never executes. */

import type { Playbook, PlaybookOrigin } from './playbook'
import { assessCommandRisk } from './command-risk'

export type DiffFix = { command: string; note?: string }

export type DiffFixPlan =
  | { action: 'need-ai' }
  | { action: 'focus'; draftId: string }
  | { action: 'draft'; fixes: DiffFix[]; origin: PlaybookOrigin; dangerous: string[] }
  | { action: 'explain-first' }
  | { action: 'no-fixes' }

export function findDiffDraft(list: Playbook[], hostKey: string, path: string): Playbook | undefined {
  return list.find((p) => p.draft && p.origin?.kind === 'diff' && p.origin.hostKey === hostKey && p.origin.path === path)
}

export function planDiffFix(input: {
  aiConfigured: boolean
  hasExplanation: boolean
  fixes: DiffFix[] | null
  existingDraftId?: string
  hostKey: string
  hostTitle: string
  path: string
  now?: number
}): DiffFixPlan {
  if (!input.aiConfigured) return { action: 'need-ai' }
  if (input.existingDraftId) return { action: 'focus', draftId: input.existingDraftId }
  if (!input.hasExplanation) return { action: 'explain-first' }
  const fixes = (input.fixes ?? []).map((f) => ({ command: String(f.command ?? '').trim(), note: f.note })).filter((f) => f.command)
  if (!fixes.length) return { action: 'no-fixes' }
  const dangerous = fixes.filter((f) => assessCommandRisk(f.command)).map((f) => f.command)
  const origin: PlaybookOrigin = {
    kind: 'diff',
    hostKey: input.hostKey,
    hostTitle: input.hostTitle,
    path: input.path,
    at: input.now ?? Date.now()
  }
  return { action: 'draft', fixes, origin, dangerous }
}

/** True when a drafted step must stay behind the confirm gate. */
export function stepIsDangerous(command: string): boolean {
  return Boolean(assessCommandRisk(command))
}
