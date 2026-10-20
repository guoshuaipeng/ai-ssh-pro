/** D16b: one AI script at a time; the next line is filled after the current one is submitted. */
import { advanceScript, type ScriptRun } from '@shared/ai-script'
import { assessCommandRisk } from '@shared/command-risk'
import { COMMAND_SUBMITTED_EVENT, fillCommandBar } from './ai-events'
import { aiOrigins } from './ai-origin'
import { tg } from './i18n'
import { showToast } from './toast'

let run: ScriptRun | null = null
let listening = false

function fillStep(): void {
  if (!run) return
  const cmd = run.steps[run.index]!
  aiOrigins.mark(run.sessionId, cmd)
  fillCommandBar(run.sessionId, cmd)
  const risky = Boolean(assessCommandRisk(cmd))
  showToast(tg(risky ? 'd16b.stepRisky' : 'd16b.step', { i: run.index + 1, n: run.steps.length }), {
    ...(risky ? { kind: 'error' as const } : {}),
    action: { label: tg('d16b.stop'), run: stopScript }
  })
}

function onSubmitted(e: Event): void {
  const d = (e as CustomEvent<{ sessionId: string; command: string }>).detail
  if (!run || !d || d.sessionId !== run.sessionId) return
  const next = advanceScript(run, d.command)
  if (next === 'same') return
  if (next === null) {
    run = null
    showToast(tg('d16b.done'))
    return
  }
  run = next
  window.setTimeout(fillStep, 250)
}

export function startScript(sessionId: string, steps: string[]): void {
  if (!listening) {
    window.addEventListener(COMMAND_SUBMITTED_EVENT, onSubmitted)
    listening = true
  }
  run = { sessionId, steps, index: 0 }
  fillStep()
}

export function stopScript(): void {
  if (!run) return
  fillCommandBar(run.sessionId, '')
  run = null
  showToast(tg('d16b.stopped'))
}

export function scriptRunning(sessionId: string): boolean {
  return run?.sessionId === sessionId
}
