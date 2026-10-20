import { BLOCK_DONE_EVENT, type BlockDoneDetail } from './ai-script-run'
import { requestAskWithContext } from './ai-prefill'
import { tg } from './i18n'
import { captureChunk, captureCommand, captureExit, captureStart, failedContext, rememberFailed, withLastRun, capturedOutput, type Capture, type FailedOutputStore, type LastRun } from '@shared/failed-output'
import { isSensitiveCommand } from '@shared/workspace-features'
import { COMMAND_SUBMITTED_EVENT } from './ai-events'
import { SHELL_CMD_EVENT, SHELL_EXIT_EVENT, integrationState } from './shell-integration'

const store: FailedOutputStore = new Map()
const caps = new Map<string, Capture>()
const lastRuns = new Map<string, LastRun>()

/** D49: last finished command of a session (memory only) */
export function lastRunFor(sessionId: string): LastRun | null {
  return lastRuns.get(sessionId) ?? null
}

/** D46: selection text with the session's last command + exit code in front (when recent, not sensitive). */
export function selectionWithLastRun(sessionId: string, selection: string): string {
  return withLastRun(selection, lastRuns.get(sessionId), Date.now(), isSensitiveCommand)
}

if (typeof window !== 'undefined') {
  window.addEventListener(BLOCK_DONE_EVENT, (e) => {
    const d = (e as CustomEvent<BlockDoneDetail>).detail
    if (d?.sessionId && d.command) {
      rememberFailed(store, d.sessionId, d.command, d.code, d.context || '')
      lastRuns.set(d.sessionId, { command: d.command, code: d.code, at: Date.now() })
    }
  })
  // D22c: memory-only capture that works with blocks off (needs Shell Integration for the exit code)
  window.addEventListener(COMMAND_SUBMITTED_EVENT, (e) => {
    const d = (e as CustomEvent<{ sessionId: string; command: string }>).detail
    if (d?.sessionId) captureStart(caps, d.sessionId, d.command || '')
  })
  window.addEventListener('aiss-term-chunk', (e) => {
    const d = (e as CustomEvent<{ sessionId: string; text: string }>).detail
    if (d?.sessionId && typeof d.text === 'string') captureChunk(caps, d.sessionId, d.text, integrationState(d.sessionId) === 'active')
  })
  window.addEventListener(SHELL_CMD_EVENT, (e) => {
    const d = (e as CustomEvent<{ sessionId: string; command: string }>).detail
    if (d?.sessionId && d.command) captureCommand(caps, d.sessionId, d.command)
  })
  window.addEventListener(SHELL_EXIT_EVENT, (e) => {
    const d = (e as CustomEvent<{ sessionId: string; code: number }>).detail
    if (d?.sessionId && typeof d.code === 'number') {
      const cap = caps.get(d.sessionId)
      if (cap?.command) lastRuns.set(d.sessionId, { command: cap.command, code: d.code, at: Date.now(), out: capturedOutput(cap) })
      captureExit(caps, store, d.sessionId, d.code)
    }
  })
}

/** D22b: ask AI about a history item that failed last time. */
export function askAboutHistoryFailure(sessionId: string, command: string, code: number): boolean {
  const c = failedContext(store, sessionId, command, code)
  return requestAskWithContext(sessionId, c.text, tg(c.hasOutput ? 'd22b.askQ' : 'd22b.askQNoOut', { code }))
}
