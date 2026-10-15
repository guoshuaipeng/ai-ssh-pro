/**
 * A confirmed SSH command that exits nonzero, writes stderr, times out, or
 * fails to send is evidence, not a cue to run it again. A retry is a new
 * confirm. Deny and cancel stay distinct: deny stays cancelled, cancel returns
 * to planning (S23).
 */

export type CommandFailureKind = 'nonzero' | 'stderr' | 'timeout' | 'write'

export type CommandOutcomeInput = {
  exitCode?: number | null
  stderr?: string
  timedOut?: boolean
  /** Harness marker for a timeout. Production omits it and the evidence says `timeout`. */
  timeoutMark?: string
  /** `ssh.write` returned false. A successful send is `true` or omitted. */
  writeOk?: boolean
}

export type CommandFailureEvidence = {
  kind: CommandFailureKind
  command: string
  exitCode: number | null
  stderr: string
  timedOut: boolean
  evidence: string
}

export type ConfirmedCommandOutcome = {
  exitCode?: number | null
  stderr?: string
  timedOut?: boolean
  timeoutMark?: string
}

/** Optional probe. The production SSH manager does not implement it. */
export function readConfirmedCommandOutcome(
  ssh: object,
  sessionId: string,
  command: string
): ConfirmedCommandOutcome | null {
  const probe = ssh as {
    confirmedCommandOutcome?: (sessionId: string, command: string) => ConfirmedCommandOutcome | null
  }
  if (typeof probe.confirmedCommandOutcome !== 'function') return null
  const outcome = probe.confirmedCommandOutcome(sessionId, command)
  if (!outcome || typeof outcome !== 'object') return null
  return outcome
}

/**
 * Nonzero exit, stderr, timeout, or a failed send. A command whose stdout
 * merely mentions a failure (service down, permission denied) is not this:
 * callers pass the structured outcome, not the ring text.
 */
export function classifyCommandFailure(command: string, outcome: CommandOutcomeInput): CommandFailureEvidence | null {
  const commandText = command.trim()
  if (!commandText) return null
  const exitCode = typeof outcome.exitCode === 'number' && Number.isFinite(outcome.exitCode) ? outcome.exitCode : null
  const stderr = (outcome.stderr ?? '').replace(/\r/g, '').trim()
  const timedOut = outcome.timedOut === true
  const writeFailed = outcome.writeOk === false
  const nonzero = exitCode != null && exitCode !== 0
  if (!timedOut && !nonzero && !stderr && !writeFailed) return null
  const kind: CommandFailureKind = timedOut ? 'timeout' : nonzero ? 'nonzero' : stderr ? 'stderr' : 'write'
  const lines = [`command=${commandText}`]
  if (nonzero && exitCode != null) lines.push(`exit=${exitCode}`)
  if (stderr) lines.push(stderr)
  if (timedOut) lines.push((outcome.timeoutMark ?? '').trim() || 'timeout')
  if (writeFailed) lines.push('writeOk=false')
  return { kind, command: commandText, exitCode, stderr, timedOut, evidence: lines.join('\n') }
}

/**
 * Same failed command may be written again only after a new approval.
 * A different command still needs its own approval; this gate does not add one.
 * The first run has no failed command yet, so a fresh request id is enough.
 */
export function retryWritePermitted(input: {
  command: string
  failedCommand: string | null
  requestId: string | null
  priorRequestId: string | null
  approved: boolean
}): boolean {
  if (!input.approved) return false
  const requestId = input.requestId?.trim() || ''
  if (!requestId) return false
  const failed = input.failedCommand?.trim() || ''
  if (!failed || failed !== input.command.trim()) return true
  const prior = input.priorRequestId?.trim() || ''
  if (!prior) return true
  return requestId !== prior
}

/** End text cites the evidence and the no-auto-retry offer. Already-present lines are kept once. */
export function explainFailedCommand(description: string, failure: CommandFailureEvidence, offer: string): string {
  let text = description.trim()
  if (!text.includes(failure.evidence)) text = `${text}\n${failure.evidence}`
  const line = offer.trim()
  if (line && !text.includes(line)) text = `${text}\n${line}`
  return text
}
