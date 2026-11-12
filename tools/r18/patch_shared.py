# -*- coding: utf-8 -*-
"""R18 item1: extend ai-suggestion-steps with step map + alignPlanStepDisplay."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
path = ROOT / "src" / "shared" / "ai-suggestion-steps.ts"
text = path.read_text(encoding="utf-8")

if "alignPlanStepDisplay" in text:
    print("already patched ai-suggestion-steps")
else:
    addition = r'''

export type SuggestionStepLine = {
  role: string
  structured?: Pick<AiAssistantReply, 'action' | 'command' | 'toolName'> | null
  requestId?: string
}

/** Map line index → 1-based step no for command / tool_call cards (H07). */
export function buildSuggestionStepNos(lines: SuggestionStepLine[]): Map<number, number> {
  const map = new Map<number, number>()
  let n = 0
  lines.forEach((row, idx) => {
    if (row.role !== 'assistant' || !row.structured) return
    const action = row.structured.action
    if (action === 'command' || action === 'tool_call') {
      n += 1
      map.set(idx, n)
    }
  })
  return map
}

/** Index of the line whose requestId matches the pending confirm, or -1. */
export function findConfirmableLineIndex(
  lines: Array<{ requestId?: string }>,
  requestId: string | null | undefined
): number {
  if (!requestId) return -1
  return lines.findIndex((row) => row.requestId === requestId)
}

/**
 * R18: one display step for composer chip + active-plan badge +「步骤 n」labels.
 * Prefer the suggestion step of the confirmable card so UI never disagrees with card labels
 * when the agent loop index (runStep) has drifted (snapshots / end turns / retries).
 */
export function alignPlanStepDisplay(opts: {
  runStep?: number | null
  runMax?: number | null
  /** suggestionStepNo for the pending confirm line (or focused card) */
  suggestionStep?: number | null
  suggestionCount: number
}): { step: number; max: number; source: 'suggestion' | 'run' | 'fallback' } {
  const sug =
    typeof opts.suggestionStep === 'number' && opts.suggestionStep > 0 ? opts.suggestionStep : null
  const run = typeof opts.runStep === 'number' && opts.runStep > 0 ? opts.runStep : null
  const step = sug ?? run ?? 1
  const source: 'suggestion' | 'run' | 'fallback' =
    sug != null ? 'suggestion' : run != null ? 'run' : 'fallback'
  const max = Math.max(
    typeof opts.runMax === 'number' && opts.runMax > 0 ? opts.runMax : 0,
    opts.suggestionCount,
    step,
    1
  )
  return { step, max, source }
}
'''
    path.write_text(text.rstrip() + "\n" + addition + "\n", encoding="utf-8")
    print("patched ai-suggestion-steps.ts")
