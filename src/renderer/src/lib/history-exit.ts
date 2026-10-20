/** D22: remember the exit code of submitted commands in smart history. */
import { withExit } from '@shared/history-exit'
import { COMMAND_SUBMITTED_EVENT } from './ai-events'
import { BLOCK_DONE_EVENT, type BlockDoneDetail } from './ai-script-run'
import { SHELL_EXIT_EVENT } from './shell-integration'
import { blocksEnabled } from '@shared/terminal-blocks'
import { blockExitOn } from './block-wire'
import { loadSmartHistory, saveSmartHistory } from './smart-history'
import { notifyHistoryChanged } from './workspace-events'

const hostOf = new Map<string, string>()
const lastCmd = new Map<string, string>()
let installed = false

function mark(sessionId: string, command: string | undefined, code: number): void {
  const host = hostOf.get(sessionId)
  if (host == null || !command) return
  const all = loadSmartHistory()
  const next = withExit(all, host, command, code)
  if (next === all) return
  saveSmartHistory(next)
  notifyHistoryChanged()
}

export function bindHistoryHost(sessionId: string, hostKey: string): void {
  hostOf.set(sessionId, hostKey)
  if (installed) return
  installed = true
  window.addEventListener(COMMAND_SUBMITTED_EVENT, (e) => {
    const d = (e as CustomEvent<{ sessionId: string; command: string }>).detail
    if (d?.sessionId) lastCmd.set(d.sessionId, d.command)
  })
  window.addEventListener(BLOCK_DONE_EVENT, (e) => {
    const d = (e as CustomEvent<BlockDoneDetail>).detail
    if (d) mark(d.sessionId, d.command, d.code)
  })
  window.addEventListener(SHELL_EXIT_EVENT, (e) => {
    const d = (e as CustomEvent<{ sessionId: string; code: number }>).detail
    if (!d) return
    if (blocksEnabled() && blockExitOn()) return // the block event carries the command
    mark(d.sessionId, lastCmd.get(d.sessionId), d.code)
  })
}
