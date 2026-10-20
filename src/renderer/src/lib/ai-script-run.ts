/** D16b/D16c/D16d: one AI script at a time. Progress shows next to the command bar instead of a toast per step. */
import { advanceScript, afterExit, skipStep, type ExitOutcome, type ScriptRun } from '@shared/ai-script'
import { assessCommandRisk } from '@shared/command-risk'
import { COMMAND_SUBMITTED_EVENT, fillCommandBar } from './ai-events'
import { aiOrigins } from './ai-origin'
import { tg } from './i18n'
import { showToast } from './toast'
import { requestAskWithContext } from './ai-prefill'
import { SHELL_EXIT_EVENT, integrationState, shellIntOn } from './shell-integration'
import { blocksEnabled } from '@shared/terminal-blocks'
import { blockExitOn } from './block-wire'

/** Fired by the blocks strip when a block gets its exit code (carries the output). */
export const BLOCK_DONE_EVENT = 'aiss-block-done'
export type BlockDoneDetail = { sessionId: string; command: string; code: number; context: string }

/** D16d: progress for the command-bar chip */
export const SCRIPT_STATE_EVENT = 'aiss-script-state'
export type ScriptPhase = 'ready' | 'running' | 'held' | 'failed'
export type ScriptState = { sessionId: string; index: number; total: number; phase: ScriptPhase; command: string; code?: number; risky: boolean }

let run: ScriptRun | null = null
let held = false
let pendingNext = false
let failContext = ''
let listening = false
let state: ScriptState | null = null

function publish(phase: ScriptPhase | null): void {
  const prevSid = state?.sessionId ?? run?.sessionId ?? ''
  if (!run || !phase) {
    state = null
  } else {
    const cmd = run.steps[run.index] ?? ''
    state = { sessionId: run.sessionId, index: run.index, total: run.steps.length, phase, command: cmd, code: run.paused?.code, risky: Boolean(assessCommandRisk(cmd)) }
  }
  window.dispatchEvent(new CustomEvent(SCRIPT_STATE_EVENT, { detail: state ?? { sessionId: prevSid, cleared: true } }))
}

export function scriptState(sessionId: string): ScriptState | null {
  return state && state.sessionId === sessionId ? state : null
}

function fillStep(): void {
  if (!run) return
  const cmd = run.steps[run.index]!
  aiOrigins.mark(run.sessionId, cmd)
  fillCommandBar(run.sessionId, cmd)
  publish('ready')
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

function finish(): void {
  run = null
  held = false
  pendingNext = false
  publish(null)
  showToast(tg('d16b.done'))
}

function apply(out: ExitOutcome, context: string): void {
  if (out.event === 'ignored') return
  if (out.event === 'done') return finish()
  run = out.run
  if (out.event === 'next') {
    if (held) {
      pendingNext = true
      publish('held')
    } else window.setTimeout(fillStep, 250)
    return
  }
  // paused on failure: nothing more is filled until the user decides
  failContext = context
  fillCommandBar(run!.sessionId, '')
  publish('failed')
}

function onSubmitted(e: Event): void {
  const d = (e as CustomEvent<{ sessionId: string; command: string }>).detail
  if (!run || !d || d.sessionId !== run.sessionId) return
  const next = advanceScript(run, d.command, exitObservable(run.sessionId))
  if (next === 'same') return
  if (next === null) return finish()
  run = next
  if (next.awaiting) publish('running')
  else apply({ run: next, event: 'next' }, '')
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
  if (run && run.sessionId !== sessionId) publish(null)
  run = { sessionId, steps, index: 0 }
  held = false
  pendingNext = false
  fillStep()
}

/** D16d: hold = do not fill the next line automatically */
export function holdScript(): void {
  if (!run || held) return
  held = true
  if (state?.phase === 'ready') {
    fillCommandBar(run.sessionId, '')
    pendingNext = true
    publish('held')
  } else publish(state?.phase === 'running' ? 'running' : 'held')
}

export function resumeScript(): void {
  if (!run) return
  held = false
  if (run.paused) {
    apply(skipStep(run), '')
    return
  }
  if (pendingNext || state?.phase === 'held') {
    pendingNext = false
    fillStep()
  }
}

export function scriptHeld(): boolean {
  return held
}

export function askAboutFailure(): void {
  if (!run?.paused) return
  const i = run.index + 1
  const n = run.steps.length
  const code = run.paused.code
  const cmd = run.steps[run.index]!
  requestAskWithContext(run.sessionId, failContext || `$ ${cmd}\n(exit ${code})`, tg('d16c.askQ', { i, n, code, rest: run.steps.slice(run.index + 1).join('\n') || '-' }))
}

export function stopScript(): void {
  if (!run) return
  fillCommandBar(run.sessionId, '')
  run = null
  held = false
  pendingNext = false
  publish(null)
  showToast(tg('d16b.stopped'))
}

export function scriptRunning(sessionId: string): boolean {
  return run?.sessionId === sessionId
}
