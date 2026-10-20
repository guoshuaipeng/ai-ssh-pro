/** D22b: in-session memory of the last failed output per (session, command). Never persisted. */

import { isSensitiveCommand, stripAnsi } from './workspace-features'
import { redactAuditText } from './audit-log'

export const FAILED_OUTPUT_CAP = 50
/** D22c: tail kept per running command (chars, after ANSI strip) */
export const CAPTURE_TAIL = 4000

export type FailedOutputStore = Map<string, string>

function k(sessionId: string, command: string): string {
  return `${sessionId}\n${command.trim()}`
}

export function rememberFailed(store: FailedOutputStore, sessionId: string, command: string, code: number, context: string): void {
  const key = k(sessionId, command)
  store.delete(key)
  if (code === 0 || !context || isSensitiveCommand(command)) return // a later success makes the old output stale
  store.set(key, context)
  while (store.size > FAILED_OUTPUT_CAP) store.delete(store.keys().next().value as string)
}

/** D22c: lightweight capture used when command blocks are off. One pending command per session. */
export type Capture = { command: string; out: string }

export function captureStart(caps: Map<string, Capture>, sessionId: string, command: string): void {
  const c = command.trim()
  // sensitive commands are never captured (same rule as history)
  if (!c || isSensitiveCommand(c)) caps.delete(sessionId)
  else caps.set(sessionId, { command: c, out: '' })
}

/** D22d: command reported by Shell Integration after it ran (typed in the terminal). A command-bar capture keeps its own line. */
export function captureCommand(caps: Map<string, Capture>, sessionId: string, command: string): void {
  const c = command.trim()
  const cap = caps.get(sessionId) ?? { command: '', out: '' }
  if (cap.command) return
  // sensitive: keep an empty command so the exit drops the output
  cap.command = isSensitiveCommand(c) ? '' : c
  caps.set(sessionId, cap)
}

export function captureChunk(caps: Map<string, Capture>, sessionId: string, text: string, rolling = false): void {
  let cap = caps.get(sessionId)
  if (!cap) {
    // D22d: with Shell Integration, keep a rolling prompt-to-prompt buffer so typed commands can be attributed later
    if (!rolling) return
    cap = { command: '', out: '' }
    caps.set(sessionId, cap)
  }
  const next = cap.out + stripAnsi(text).replace(/\r/g, '')
  cap.out = next.length > CAPTURE_TAIL * 2 ? next.slice(-CAPTURE_TAIL * 2) : next
}

/** On exit: failed commands go into the store (redacted, tail only); the pending capture is dropped either way. */
export function captureExit(caps: Map<string, Capture>, store: FailedOutputStore, sessionId: string, code: number): void {
  const cap = caps.get(sessionId)
  if (!cap) return
  caps.delete(sessionId)
  if (!cap.command) return
  let out = cap.out
  // drop the echoed command line at the start
  const nl = out.indexOf('\n')
  if (nl >= 0 && out.slice(0, nl).includes(cap.command)) out = out.slice(nl + 1)
  out = out.length > CAPTURE_TAIL ? out.slice(-CAPTURE_TAIL) : out
  rememberFailed(store, sessionId, cap.command, code, redactAuditText(`$ ${cap.command}\n${out.trimEnd()}`))
}

/** D46: the last finished command of a session, for "Ask AI" on a selection. */
export type LastRun = { command: string; code: number; at: number }
export const LAST_RUN_FRESH_MS = 10 * 60 * 1000

/** Prefix the selection with the last command + exit code when it is recent and not sensitive. */
export function withLastRun(selection: string, last: LastRun | null | undefined, now: number, sensitive: (cmd: string) => boolean): string {
  if (!last || !last.command.trim() || now - last.at > LAST_RUN_FRESH_MS || sensitive(last.command)) return selection
  return `$ ${redactAuditText(last.command.trim())}   # exit ${last.code}\n${selection}`
}

export function failedContext(store: FailedOutputStore, sessionId: string, command: string, code: number): { text: string; hasOutput: boolean } {
  const ctx = store.get(k(sessionId, command))
  if (ctx) return { text: ctx, hasOutput: true }
  return { text: `$ ${command.trim()}\n(exit ${code})`, hasOutput: false }
}
