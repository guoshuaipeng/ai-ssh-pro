/** D16b/D16c: one AI script at a time; the next line is filled after the current one finishes (or is submitted). */
import { advanceScript, afterExit, skipStep, type ExitOutcome, type ScriptRun } from '@shared/ai-script'
import { assessCommandRisk } from '@shared/command-risk'
import { COMMAND_SUBMITTED_EVENT, fillCommandBar } from './ai-events'
import { aiOrigins } from './ai-origin'
import { tg } from './i18n'
import { clearToasts, showToast } from './toast'
import { requestAskWithContext } from './ai-prefill'
import { SHELL_EXIT_EVENT, integrationState, shellIntOn } from './shell-integration'
import { blocksEnabled } from '@shared/terminal-blocks'
import { blockExitOn } from './block-wire'

/** Fired by the blocks strip when a block gets its exit code (carries the output). */
export const BLOCK_DONE_EVENT = 'aiss-block-done'
export type BlockDoneDetail = { sessionId: string; command: string; code: number; context: string }

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

/** Exit codes are observable when blocks + exit capture are on, or Shell Integration is active. */
export function exitObservable(sessionId: string): boolean {
  let blocks = false
  try {
    blocks = blocksEnabled() && blockExitOn()
  } catch {
    blocks = false
  }
  return blocks || (shellIntOn() && integrationState(sessionId) === 'active')
}

function apply(out: ExitOutcome, context: string): void {
  if (out.event === 'ignored') return
  run = out.run
  if (out.event === 'done') {
    showToast(tg('d16b.done'))
    return
  }
  if (out.event === 'next') {
    window.setTimeout(fillStep, 250)
    return
  }
  // paused
  const r = run!
  const code = r.paused!.code
  const cmd = r.steps[r.index]!
  const i = r.index + 1
  const n = r.steps.length
  fillCommandBar(r.sessionId, '')
  // the stale step toast would offer the wrong action next to the pause
  clearToasts()
  showToast(tg('d16c.paused', { i, n, code }), {
    kind: 'error',
    ms: 30000,
    actions: [
      {
        label: tg('d16c.ask'),
        run: () => requestAskWithContext(r.sessionId, context || `$ ${cmd}\n(exit ${code})`, tg('d16c.askQ', { i, n, code, rest: r.steps.slice(r.index + 1).join('\n') || '-' }))
      },
      { label: tg('d16c.skip'), run: () => { if (run === r) apply(skipStep(r), '') } },
      { label: tg('d16b.stop'), run: () => { if (run === r) stopScript() } }
    ]
  })
}

function onSubmitted(e: Event): void {
  const d = (e as CustomEvent<{ sessionId: string; command: string }>).detail
  if (!run || !d || d.sessionId !== run.sessionId) return
  const next = advanceScript(run, d.command, exitObservable(run.sessionId))
  if (next === 'same') return
  if (next === null) {
    run = null
    showToast(tg('d16b.done'))
    return
  }
  run = next
  if (!next.awaiting) window.setTimeout(fillStep, 250)
}

function onBlockDone(e: Event): void {
  const d = (e as CustomEvent<BlockDoneDetail>).detail
  if (!run?.awaiting || !d || d.sessionId !== run.sessionId) return
  if (d.command.trim() !== run.steps[run.index]?.trim()) return
  apply(afterExit(run, d.code), d.context)
}

function onShellExit(e: Event): void {
  const d = (e as CustomEvent<{ sessionId: string; code: number }>).detail
  if (!run?.awaiting || !d || d.sessionId !== run.sessionId) return
  // with blocks on, wait for the block event (it carries the output)
  if (blocksEnabled() && blockExitOn()) return
  apply(afterExit(run, d.code), '')
}

export function startScript(sessionId: string, steps: string[]): void {
  if (!listening) {
    window.addEventListener(COMMAND_SUBMITTED_EVENT, onSubmitted)
    window.addEventListener(BLOCK_DONE_EVENT, onBlockDone)
    window.addEventListener(SHELL_EXIT_EVENT, onShellExit)
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
