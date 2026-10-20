import { BLOCK_DONE_EVENT, type BlockDoneDetail } from './ai-script-run'
import { requestAskWithContext } from './ai-prefill'
import { tg } from './i18n'
import { failedContext, rememberFailed, type FailedOutputStore } from '@shared/failed-output'

const store: FailedOutputStore = new Map()

if (typeof window !== 'undefined') {
  window.addEventListener(BLOCK_DONE_EVENT, (e) => {
    const d = (e as CustomEvent<BlockDoneDetail>).detail
    if (d?.sessionId && d.command) rememberFailed(store, d.sessionId, d.command, d.code, d.context || '')
  })
}

/** D22b: ask AI about a history item that failed last time. */
export function askAboutHistoryFailure(sessionId: string, command: string, code: number): boolean {
  const c = failedContext(store, sessionId, command, code)
  return requestAskWithContext(sessionId, c.text, tg(c.hasOutput ? 'd22b.askQ' : 'd22b.askQNoOut', { code }))
}
