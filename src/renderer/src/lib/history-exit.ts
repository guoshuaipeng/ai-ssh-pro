/** D22: remember the exit code of submitted commands in smart history. */
import { withCwd, withExit } from '@shared/history-exit'
import { getSessionCwd } from './session-cwd-store'
import { COMMAND_SUBMITTED_EVENT } from './ai-events'
import { BLOCK_DONE_EVENT, type BlockDoneDetail } from './ai-script-run'
import { SHELL_CMD_EVENT, SHELL_EXIT_EVENT } from './shell-integration'
import { blocksEnabled } from '@shared/terminal-blocks'
import { blockExitOn } from './block-wire'
import { loadSmartHistory, loadSmartPrefs, recordSmartCommand, saveSmartHistory } from './smart-history'
import { notifyHistoryChanged } from './workspace-events'

const hostOf = new Map<string, string>()
const lastCmd = new Map<string, string>()
/** sessions whose current command came from the command bar (already recorded there) */
const fromBar = new Set<string>()
/** D31: cwd when the current command started (the prompt's cwd before it ran) */
const startCwd = new Map<string, string>()
function noteStart(sessionId: string): void {
  const c = getSessionCwd(sessionId)
  if (c) startCwd.set(sessionId, c)
  else startCwd.delete(sessionId)
}
let installed = false

function mark(sessionId: string, command: string | undefined, code: number, cwd?: string): void {
  const host = hostOf.get(sessionId)
  if (host == null || !command) return
  const all = loadSmartHistory()
  const next = withCwd(withExit(all, host, command, code), host, command, cwd)
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
    if (d?.sessionId) {
      lastCmd.set(d.sessionId, d.command)
      fromBar.add(d.sessionId)
      noteStart(d.sessionId)
    }
  })
  // D22d: commands typed directly in the terminal enter smart history (same sensitive / leading-space rules)
  window.addEventListener(SHELL_CMD_EVENT, (e) => {
    const d = (e as CustomEvent<{ sessionId: string; command: string }>).detail
    if (!d?.sessionId || !d.command || fromBar.has(d.sessionId)) return
    const host = hostOf.get(d.sessionId)
    if (host == null) return
    lastCmd.set(d.sessionId, d.command)
    noteStart(d.sessionId)
    if (loadSmartPrefs().enabled) {
      recordSmartCommand(host, d.command)
      notifyHistoryChanged()
    }
  })
  window.addEventListener(BLOCK_DONE_EVENT, (e) => {
    const d = (e as CustomEvent<BlockDoneDetail>).detail
    if (!d) return
    const cwd = startCwd.get(d.sessionId)
    startCwd.delete(d.sessionId)
    mark(d.sessionId, d.command, d.code, cwd)
  })
  window.addEventListener(SHELL_EXIT_EVENT, (e) => {
    const d = (e as CustomEvent<{ sessionId: string; code: number }>).detail
    if (!d) return
    const bar = fromBar.has(d.sessionId)
    const cmd = lastCmd.get(d.sessionId)
    const cwd = startCwd.get(d.sessionId)
    fromBar.delete(d.sessionId)
    lastCmd.delete(d.sessionId) // a later bare Enter must not re-mark this command
    if (bar && blocksEnabled() && blockExitOn()) return // the block event carries the command (and uses startCwd)
    startCwd.delete(d.sessionId)
    mark(d.sessionId, cmd, d.code, cwd)
  })
}
