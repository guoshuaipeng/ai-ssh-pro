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

export function captureChunk(caps: Map<string, Capture>, sessionId: string, text: string): void {
  const cap = caps.get(sessionId)
  if (!cap) return
  const next = cap.out + stripAnsi(text).replace(/\r/g, '')
  cap.out = next.length > CAPTURE_TAIL * 2 ? next.slice(-CAPTURE_TAIL * 2) : next
}

/** On exit: failed commands go into the store (redacted, tail only); the pending capture is dropped either way. */
export function captureExit(caps: Map<string, Capture>, store: FailedOutputStore, sessionId: string, code: number): void {
  const cap = caps.get(sessionId)
  if (!cap) return
  caps.delete(sessionId)
  let out = cap.out
  // drop the echoed command line at the start
  const nl = out.indexOf('\n')
  if (nl >= 0 && out.slice(0, nl).includes(cap.command)) out = out.slice(nl + 1)
  out = out.length > CAPTURE_TAIL ? out.slice(-CAPTURE_TAIL) : out
  rememberFailed(store, sessionId, cap.command, code, redactAuditText(`$ ${cap.command}\n${out.trimEnd()}`))
}

export function failedContext(store: FailedOutputStore, sessionId: string, command: string, code: number): { text: string; hasOutput: boolean } {
  const ctx = store.get(k(sessionId, command))
  if (ctx) return { text: ctx, hasOutput: true }
  return { text: `$ ${command.trim()}\n(exit ${code})`, hasOutput: false }
}
