/** A5: editable postmortem summary from a timeline. Suggestions are text. Nothing runs. */

import { redactAuditText } from './audit-log'
import type { TimelineEvent } from './timeline'

export type PostmortemDraft = {
  cause: string
  done: string
  followUps: string
  commands: string[]
}

export type PostmortemPlan = 'need-ai' | 'empty' | 'generate'

const SECRET = /(?:password|passwd|token|secret|api[_-]?key)\s*[=:]\s*\S+/gi
const PEM = /-----BEGIN[\s\S]*?-----END [^-]+-----/g

export function isEmptyTimeline(events: Array<{ kind: string }>): boolean {
  return !events.some((e) => e.kind !== 'alert.fired')
}

export function planPostmortem(aiConfigured: boolean, events: Array<{ kind: string }>): PostmortemPlan {
  if (!aiConfigured) return 'need-ai'
  if (isEmptyTimeline(events)) return 'empty'
  return 'generate'
}

/** Prompt body. Secrets and PEM blocks are removed before anything leaves the machine. */
export function postmortemPrompt(input: {
  title: string
  ruleId: string
  host: string
  events: TimelineEvent[]
}): string {
  const lines = input.events
    .filter((e) => e.kind !== 'concurrent')
    .map((e) => `- ${e.kind}: ${scrub(e.summary)}`)
  return [`Alert: ${scrub(input.title)}`, `Rule: ${input.ruleId}`, `Host: ${scrub(input.host)}`, 'Timeline:', ...lines].join('\n')
}

export function scrub(text: string): string {
  return redactAuditText(String(text ?? '')).replace(PEM, '[redacted]').replace(SECRET, '••••')
}

export function draftFromTimeline(events: TimelineEvent[], cause = ''): PostmortemDraft {
  const actions = events.filter((e) => e.kind !== 'alert.fired' && e.kind !== 'concurrent')
  const done = actions.map((e) => `${e.kind}: ${scrub(e.summary)}`).join('\n')
  return {
    cause: scrub(cause),
    done,
    followUps: '',
    commands: []
  }
}

export function draftFromAssist(
  events: TimelineEvent[],
  assist: { cause?: string; notes?: string; fixes?: Array<{ command: string; note?: string }> }
): PostmortemDraft {
  const base = draftFromTimeline(events, assist.cause || '')
  const commands = (assist.fixes ?? []).map((f) => scrub(f.command).trim()).filter(Boolean)
  return {
    cause: scrub(assist.cause || base.cause),
    done: base.done,
    followUps: scrub(assist.notes || ''),
    commands
  }
}

export function commandActions(draft: PostmortemDraft): Array<{ command: string; copy: true; run: false }> {
  return draft.commands.map((command) => ({ command, copy: true as const, run: false as const }))
}

export function exportPostmortemMarkdown(draft: PostmortemDraft, lang: 'zh' | 'en' = 'zh'): string {
  const h = lang === 'en'
    ? { cause: 'Cause', done: 'What we did', open: 'Follow-ups', cmd: 'Suggested commands (read-only, not run)' }
    : { cause: '原因', done: '已做', open: '遗留项', cmd: '建议命令（只读，不执行）' }
  const commands = draft.commands.map((c) => `- \`${scrub(c).replace(/`/g, '')}\``).join('\n')
  const body = [
    `## ${h.cause}`,
    scrub(draft.cause).trim() || '—',
    '',
    `## ${h.done}`,
    scrub(draft.done).trim() || '—',
    '',
    `## ${h.open}`,
    scrub(draft.followUps).trim() || '—',
    '',
    `## ${h.cmd}`,
    commands || '—'
  ].join('\n')
  return scrub(body)
}

export function draftDirty(a: PostmortemDraft, b: PostmortemDraft): boolean {
  return a.cause !== b.cause || a.done !== b.done || a.followUps !== b.followUps
}
