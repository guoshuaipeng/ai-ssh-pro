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
