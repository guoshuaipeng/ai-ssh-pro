import { BLOCK_DONE_EVENT, type BlockDoneDetail } from './ai-script-run'
import { requestAskWithContext } from './ai-prefill'
import { tg } from './i18n'
import { captureChunk, captureCommand, captureExit, captureStart, failedContext, rememberFailed, type Capture, type FailedOutputStore } from '@shared/failed-output'
import { COMMAND_SUBMITTED_EVENT } from './ai-events'
import { SHELL_CMD_EVENT, SHELL_EXIT_EVENT, integrationState } from './shell-integration'

const store: FailedOutputStore = new Map()
const caps = new Map<string, Capture>()

if (typeof window !== 'undefined') {
  window.addEventListener(BLOCK_DONE_EVENT, (e) => {
    const d = (e as CustomEvent<BlockDoneDetail>).detail
    if (d?.sessionId && d.command) rememberFailed(store, d.sessionId, d.command, d.code, d.context || '')
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
    if (d?.sessionId && typeof d.code === 'number') captureExit(caps, store, d.sessionId, d.code)
  })
}

/** D22b: ask AI about a history item that failed last time. */
export function askAboutHistoryFailure(sessionId: string, command: string, code: number): boolean {
  const c = failedContext(store, sessionId, command, code)
  return requestAskWithContext(sessionId, c.text, tg(c.hasOutput ? 'd22b.askQ' : 'd22b.askQNoOut', { code }))
}
