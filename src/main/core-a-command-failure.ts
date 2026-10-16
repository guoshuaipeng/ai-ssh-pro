import { mt } from './main-i18n'

/**
 * A confirmed SSH command that exits nonzero, writes stderr, times out, or
 * fails to send is evidence, not a cue to run it again. A retry is a new
 * confirm. Deny and cancel stay distinct: deny stays cancelled, cancel returns
 * to planning (S23).
 *
 * The same command may be confirmed again until its retry budget is spent.
 * The cap is two consecutive confirmed failures of that path (the first run
 * and one retry). The next write does not run. The turn ends with the failure
 * evidence and says the budget is exhausted. Deny and cancel still do not write.
 */

/** Consecutive confirmed failures of one command before another write of it is refused. */
export const RETRY_BUDGET_CAP = 2

export type RetryBudgetSignal = {
  /** Confirmed failures of `command` on this path. Zero when nothing has failed. */
  count: number
  /** Failures allowed before the next write of the same command is refused. */
  cap: number
  /** The command the count belongs to. Empty when nothing has failed. */
  command: string
  /** `count >= cap`. Another write of this command is over budget. */
  exhausted: boolean
  /** A failure is already on the books and one more would reach the cap, or the cap is already reached. */
  nearBudget: boolean
}

/** Budget for the current failure streak. The cap is fixed; a harness reads `count` and `cap`. */
export function observeRetryBudget(count: number, command = ''): RetryBudgetSignal {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  const exhausted = safe >= RETRY_BUDGET_CAP
  return {
    count: safe,
    cap: RETRY_BUDGET_CAP,
    command: command.trim(),
    exhausted,
    nearBudget: safe > 0 && safe >= RETRY_BUDGET_CAP - 1
  }
}

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
 * Same failed command may be written again only after a new approval, and only
 * while its consecutive-failure count is still under the retry budget.
 * A different command still needs its own approval; this gate does not add one.
 * The first run has no failed command yet, so a fresh request id is enough.
 * Deny (`approved: false`) never writes. Over budget never writes, even with a new request id.
 */
export function retryWritePermitted(input: {
  command: string
  failedCommand: string | null
  requestId: string | null
  priorRequestId: string | null
  approved: boolean
  /** Confirmed failures already recorded for `failedCommand`. Omitted means none. */
  failureCount?: number
}): boolean {
  if (!input.approved) return false
  const requestId = input.requestId?.trim() || ''
  if (!requestId) return false
  const failed = input.failedCommand?.trim() || ''
  if (!failed || failed !== input.command.trim()) return true
  if ((input.failureCount ?? 0) >= RETRY_BUDGET_CAP) return false
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

/**
 * The same path is already at the cap. Cite the failure evidence and stop.
 * This does not invite another confirm that would write.
 */
export function explainRetryBudgetStop(failure: CommandFailureEvidence, budget: RetryBudgetSignal): string {
  const lead = mt(
    '同一命令已连续失败，重试预算已用尽。证据不足，需要人工处理。',
    'The same command has failed again and the retry budget is exhausted. Evidence is insufficient and a person needs to decide.'
  )
  const offer = mt(
    '不会自动重跑。重试预算已用尽，不再等待新的确认。',
    'This will not run again on its own. The retry budget is exhausted, so a new confirmation will not write it.'
  )
  const signal = `retryBudget count=${budget.count} cap=${budget.cap}`
  return explainFailedCommand(`${lead}\n${signal}`, failure, offer)
}
