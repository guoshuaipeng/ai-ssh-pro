/**
 * A1 / A2 glue between the terminal, the command bar and the AI panel (window CustomEvents, no global store).
 */
import { hasUsableKey } from '../../../shared/ai-presets'
import { planSelectionExplain } from '../../../shared/selection-explain'

export const AI_EXPLAIN_EVENT = 'aiss-ai-explain'
export const COMMAND_BAR_FILL_EVENT = 'aiss-commandbar-fill'
export const COMMAND_BAR_AI_MODE_EVENT = 'aiss-commandbar-ai-mode'

export type AiExplainDetail = { sessionId: string; text: string; source: 'auto' | 'selection' | 'palette' }

/** Words that mark a failed command in terminal output (A1 trigger). */
const ERROR_RE =
  /\b(error|failed|failure|denied|refused|not found|no such file|cannot|can't|unable to|fatal|segmentation fault|timed out|invalid option|unrecognized option|permission denied)\b|错误|失败|拒绝|找不到|没有那个文件/i

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

const lastSubmitted = new Map<string, string>()

/** The command bar notes what it sent so its own echo ("grep error …") does not count as an error. */
export const COMMAND_SUBMITTED_EVENT = 'aiss-command-submitted'

export function noteSubmitted(sessionId: string, command: string): void {
  lastSubmitted.set(sessionId, command)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COMMAND_SUBMITTED_EVENT, { detail: { sessionId, command } }))
  }
}

/** True when a chunk of terminal output looks like a command error (ignores the echo of the last sent command). */
export function looksLikeError(chunk: string, sessionId?: string): boolean {
  let text = stripAnsi(chunk)
  const sent = sessionId ? lastSubmitted.get(sessionId) : undefined
  if (sent) text = text.split(sent).join('')
  if (text.length < 4) return false
  return ERROR_RE.test(text)
}

const lastErrors = new Map<string, { text: string; at: number }>()

export function rememberError(sessionId: string, text: string): void {
  lastErrors.set(sessionId, { text: stripAnsi(text).slice(-4000), at: Date.now() })
}

export function lastErrorFor(sessionId: string | null | undefined): string | null {
  if (sessionId) return lastErrors.get(sessionId)?.text ?? null
  let best: { text: string; at: number } | null = null
  for (const v of lastErrors.values()) if (!best || v.at > best.at) best = v
  return best?.text ?? null
}

export function lastErrorSessionId(): string | null {
  let best: [string, number] | null = null
  for (const [k, v] of lastErrors) if (!best || v.at > best[1]) best = [k, v.at]
  return best?.[0] ?? null
}

export async function aiHasKey(): Promise<boolean> {
  try {
    const s = await window.aiss.ai.getSettings()
    const providers = Array.isArray(s?.providers) ? s.providers : []
    const p = providers.find((x) => x.id === s.activeProviderId) ?? providers[0]
    return p ? hasUsableKey(p.baseURL, p.apiKey) : false
  } catch {
    return false
  }
}

/** UX-37: unconfigured AI lands on the single config card (no second explain card). */
export function flashAiConfig(reason: 'explain' | 'command' | 'alert' | 'selection'): void {
  window.dispatchEvent(new CustomEvent('aiss-ai-need-config', { detail: { reason } }))
}

export const SELECTION_EXPLAIN_EVENT = 'aiss-selection-explain'

export type SelectionExplainDetail = { sessionId: string; text: string }

/**
 * A6: explain a non-empty terminal selection.
 * No key → the existing config card. Empty text → caller toasts. Never writes.
 */
export async function requestSelectionExplain(detail: SelectionExplainDetail): Promise<'empty' | 'unconfigured' | 'opened'> {
  const ready = await aiHasKey().catch(() => false)
  const planned = planSelectionExplain({ text: detail.text, configured: ready })
  if (!detail.sessionId || planned.status === 'empty') return 'empty'
  window.dispatchEvent(new CustomEvent('aiss-open-right-panel', { detail: { pane: 'ai' } }))
  if (planned.status === 'unconfigured') {
    flashAiConfig('selection')
    return 'unconfigured'
  }
  window.dispatchEvent(
    new CustomEvent<SelectionExplainDetail>(SELECTION_EXPLAIN_EVENT, {
      detail: { sessionId: detail.sessionId, text: planned.text }
    })
  )
  return 'opened'
}

export function requestAiExplain(detail: AiExplainDetail): void {
  void aiHasKey().then((ready) => {
    if (!ready) {
      flashAiConfig('explain')
      return
    }
    window.dispatchEvent(new CustomEvent<AiExplainDetail>(AI_EXPLAIN_EVENT, { detail }))
  })
}

/** Put a command into the session command bar (never executes it). */
export function fillCommandBar(sessionId: string, command: string): void {
  window.dispatchEvent(new CustomEvent(COMMAND_BAR_FILL_EVENT, { detail: { sessionId, command } }))
}

export function enterAiMode(sessionId?: string | null): void {
  window.dispatchEvent(new CustomEvent(COMMAND_BAR_AI_MODE_EVENT, { detail: { sessionId: sessionId ?? null } }))
}
