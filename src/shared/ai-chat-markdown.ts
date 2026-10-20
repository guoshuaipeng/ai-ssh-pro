import { redactAuditText } from './audit-log'

/** D86: the whole AI conversation as Markdown (redacted). Errors and empty/streaming lines are skipped. */
export type MdLine = {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  variant?: 'error'
  structured?: { description?: string; command?: string; action?: string; riskLevel?: string }
  decision?: 'agreed' | 'skipped'
}

export function chatToMarkdown(
  lines: readonly MdLine[],
  opts: { title: string; target?: string; at: Date; you: string; ai: string; cmd: string }
): string {
  const out: string[] = [`# ${opts.title}`, '', `- ${opts.at.toISOString()}${opts.target ? ` · ${opts.target}` : ''}`, '']
  for (const l of lines) {
    if (l.streaming || l.variant === 'error') continue
    const body = redactAuditText(String(l.structured?.description || l.content || '')).trim()
    const cmd = l.structured?.action === 'command' && l.structured.command ? redactAuditText(l.structured.command).trim() : ''
    if (!body && !cmd) continue
    out.push(`## ${l.role === 'user' ? opts.you : opts.ai}`, '')
    if (body) out.push(body, '')
    if (cmd && !body.includes(cmd)) {
      const meta = [l.structured?.riskLevel, l.decision].filter(Boolean).join(', ')
      out.push(`${opts.cmd}${meta ? ` (${meta})` : ''}:`, '', '```bash', cmd, '```', '')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
