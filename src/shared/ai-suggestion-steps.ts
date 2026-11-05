/** Collect command-step suggestions for multi-step batch copy (R15). */
import type { AiAssistantReply } from './ipc'

export type SuggestionCommandLine = {
  role: string
  structured?: Pick<AiAssistantReply, 'action' | 'command'> | null
}

/** Ordered shell commands from assistant suggestion cards (skips tool_call / end). */
export function collectSuggestionCommands(lines: SuggestionCommandLine[]): string[] {
  const out: string[] = []
  for (const row of lines) {
    if (row.role !== 'assistant' || !row.structured) continue
    if (row.structured.action !== 'command') continue
    const cmd = row.structured.command?.trim()
    if (cmd) out.push(cmd)
  }
  return out
}

/** One command per line for clipboard; empty when fewer than 2 steps. */
export function formatSuggestionCommandsForCopy(commands: string[]): string {
  if (commands.length < 2) return ''
  return commands.join('\n')
}


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

