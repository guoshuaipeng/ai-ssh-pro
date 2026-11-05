/**
 * 路线图 2.3：对话内执行回放。
 * 每条由 AI 写入终端（或被只读拦截）的命令，在对话里留下一条执行记录：状态、耗时、输出摘要、对应审计记录 id。
 * 记录随对话历史持久化，恢复历史对话后仍可展开复盘。
 */
import { redactAuditText } from './audit-log'

export type ExecStatus = 'ok' | 'failed' | 'sent' | 'blocked'
export const EXEC_STATUSES: readonly ExecStatus[] = ['ok', 'failed', 'sent', 'blocked']

export type ExecFailureKind = 'nonzero' | 'stderr' | 'timeout' | 'write'
export const EXEC_FAILURE_KINDS: readonly ExecFailureKind[] = ['nonzero', 'stderr', 'timeout', 'write']

/** Round 21: retry budget signal pinned with a failed exec (align Core-A S27). */
export type ExecRetryBudget = {
  count: number
  cap: number
  exhausted: boolean
}

export type ExecRecord = {
  status: ExecStatus
  /** 写入终端的时间（ms） */
  at: number
  /** 从写入到读取输出的耗时；拦截时不填 */
  durationMs?: number
  /** 仅在 SSH 层报告了退出码时存在 */
  exitCode?: number
  /** 去掉命令行与提示符后的输出尾部，已脱敏 */
  summary?: string
  /** 输出总行数（摘要可能只是尾部） */
  outputLines?: number
  /** 对应的审计记录 id（审计关闭时为空） */
  auditId?: string
  /** B1：状态为「已执行」时没有退出码的原因 */
  noExit?: NoExitReason
  /** Round 21: classified failure kind when status=failed */
  failureKind?: ExecFailureKind
  /** Round 21: citeable evidence lines (command=/exit=/stderr/timeout); already redacted upstream */
  evidence?: string
  /** Round 21: consecutive confirmed failures for this command path */
  retryBudget?: ExecRetryBudget
}

/** Cap evidence shown on the pinned failure card (Chinese UI). */
export const FAILURE_EVIDENCE_MAX_CHARS = 600

/** Build a stable evidence block from structured fields when the agent omitted `evidence`. */
export function buildFailureEvidenceText(input: {
  command?: string
  exitCode?: number | null
  stderr?: string
  timedOut?: boolean
  timeoutMark?: string
  writeOk?: boolean
  summary?: string
}): string {
  const lines: string[] = []
  const cmd = (input.command ?? '').trim()
  if (cmd) lines.push(`command=${cmd}`)
  if (typeof input.exitCode === 'number' && Number.isFinite(input.exitCode) && input.exitCode !== 0) {
    lines.push(`exit=${input.exitCode}`)
  }
  const stderr = (input.stderr ?? '').replace(/\r/g, '').trim()
  if (stderr) lines.push(stderr)
  if (input.timedOut === true) lines.push((input.timeoutMark ?? '').trim() || 'timeout')
  if (input.writeOk === false) lines.push('writeOk=false')
  if (!lines.length) {
    const sum = (input.summary ?? '').trim()
    if (sum) lines.push(sum)
  }
  return lines.join('\n')
}

export function clipFailureEvidence(text: string, max = FAILURE_EVIDENCE_MAX_CHARS): string {
  const t = String(text ?? '').replace(/\r/g, '').trim()
  if (!t) return ''
  if (t.length <= max) return t
  return t.slice(0, Math.max(0, max - 1)) + '…'
}

/** View model for the pinned failure evidence card (S27 visibility). */
export function buildFailureEvidenceView(
  exec: Pick<ExecRecord, 'status' | 'exitCode' | 'summary' | 'failureKind' | 'evidence' | 'retryBudget'>,
  command?: string
): {
  kind: ExecFailureKind | null
  evidence: string
  budget: ExecRetryBudget | null
  exhausted: boolean
} | null {
  if (exec.status !== 'failed') return null
  const raw =
    (exec.evidence && exec.evidence.trim()) ||
    buildFailureEvidenceText({
      command,
      exitCode: exec.exitCode,
      summary: exec.summary,
      timedOut: exec.failureKind === 'timeout',
      writeOk: exec.failureKind === 'write' ? false : undefined
    })
  const evidence = clipFailureEvidence(raw)
  if (!evidence) return null
  const kind =
    exec.failureKind && (EXEC_FAILURE_KINDS as readonly string[]).includes(exec.failureKind)
      ? exec.failureKind
      : typeof exec.exitCode === 'number' && exec.exitCode !== 0
        ? 'nonzero'
        : null
  const budget = exec.retryBudget
    ? {
        count: Math.max(0, Math.floor(Number(exec.retryBudget.count) || 0)),
        cap: Math.max(1, Math.floor(Number(exec.retryBudget.cap) || 2)),
        exhausted: exec.retryBudget.exhausted === true
      }
    : null
  return {
    kind,
    evidence,
    budget,
    exhausted: budget?.exhausted === true
  }
}

export type NoExitReason = 'disabled' | 'ineligible' | 'timeout' | 'unsupported'
const NO_EXIT: readonly NoExitReason[] = ['disabled', 'ineligible', 'timeout', 'unsupported']

/** B1：等待退出码的上限（毫秒）；超过后先按「已执行」记录，长命令不阻塞 AI */
export const EXIT_WAIT_DEFAULT_MS = 10_000
export function exitWaitMs(env?: string): number {
  const n = env ? Number(env) : EXIT_WAIT_DEFAULT_MS
  return Number.isFinite(n) && n >= 500 ? Math.min(60_000, Math.floor(n)) : EXIT_WAIT_DEFAULT_MS
}

export const SUMMARY_MAX_LINES = 8
export const SUMMARY_MAX_CHARS = 800

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g
const PROMPT = /^\S*[@:~\]][^\n]*[$#>%]\s*$|^[$#>%]\s*$/

/** 从命令执行后的终端快照中取出该命令的输出：从最后一次出现命令的行之后，到结尾提示符之前。 */
export function summarizeExecOutput(
  snapshot: string | null | undefined,
  command: string,
  maxLines = SUMMARY_MAX_LINES,
  maxChars = SUMMARY_MAX_CHARS
): { summary: string; outputLines: number } {
  const text = String(snapshot ?? '').replace(ANSI, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const cmd = command.trim()
  let start = 0
  if (cmd) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(cmd)) {
        start = i + 1
        break
      }
    }
  }
  const out = lines.slice(start)
  while (out.length && !out[out.length - 1].trim()) out.pop()
  if (out.length && PROMPT.test(out[out.length - 1].trim())) out.pop()
  while (out.length && !out[out.length - 1].trim()) out.pop()
  while (out.length && !out[0].trim()) out.shift()
  const outputLines = out.length
  let summary = redactAuditText(out.slice(-maxLines).join('\n'))
  if (summary.length > maxChars) summary = '…' + summary.slice(summary.length - maxChars + 1)
  return { summary, outputLines }
}

/** 状态：写入失败 / 非零退出 / 超时为失败；退出码 0 为成功；拿不到退出码时为「已执行」，不猜测成败。 */
export function execStatusFrom(input: { writeOk: boolean; exitCode?: number | null; timedOut?: boolean; stderr?: string }): ExecStatus {
  if (!input.writeOk) return 'failed'
  if (input.timedOut) return 'failed'
  if (typeof input.exitCode === 'number' && Number.isFinite(input.exitCode)) return input.exitCode === 0 ? 'ok' : 'failed'
  if (input.stderr && input.stderr.trim()) return 'failed'
  return 'sent'
}

/** 历史读取时的校验：丢弃未知字段，数值做边界处理。 */
export function normalizeExecRecord(raw: unknown): ExecRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.status !== 'string' || !(EXEC_STATUSES as readonly string[]).includes(r.status)) return undefined
  const at = Number(r.at)
  if (!Number.isFinite(at) || at <= 0) return undefined
  const out: ExecRecord = { status: r.status as ExecStatus, at }
  const d = Number(r.durationMs)
  if (r.durationMs != null && Number.isFinite(d) && d >= 0) out.durationMs = Math.round(d)
  const ec = Number(r.exitCode)
  if (r.exitCode != null && Number.isInteger(ec)) out.exitCode = ec
  if (typeof r.summary === 'string' && r.summary) out.summary = r.summary.slice(0, SUMMARY_MAX_CHARS)
  const n = Number(r.outputLines)
  if (r.outputLines != null && Number.isInteger(n) && n >= 0) out.outputLines = n
  if (typeof r.auditId === 'string' && r.auditId.trim()) out.auditId = r.auditId.trim().slice(0, 96)
  if (out.status === 'sent' && typeof r.noExit === 'string' && (NO_EXIT as readonly string[]).includes(r.noExit)) out.noExit = r.noExit as NoExitReason
  if (out.status === 'failed') {
    if (typeof r.failureKind === 'string' && (EXEC_FAILURE_KINDS as readonly string[]).includes(r.failureKind)) {
      out.failureKind = r.failureKind as ExecFailureKind
    }
    if (typeof r.evidence === 'string' && r.evidence.trim()) {
      out.evidence = clipFailureEvidence(r.evidence)
    }
    if (r.retryBudget && typeof r.retryBudget === 'object') {
      const b = r.retryBudget as Record<string, unknown>
      const count = Number(b.count)
      const cap = Number(b.cap)
      if (Number.isFinite(count) && count >= 0 && Number.isFinite(cap) && cap >= 1) {
        out.retryBudget = {
          count: Math.floor(count),
          cap: Math.floor(cap),
          exhausted: b.exhausted === true || Math.floor(count) >= Math.floor(cap)
        }
      }
    }
  }
  return out
}

/** 1.2 s / 850 ms / 2 分 05 秒 */
export function formatExecDuration(ms: number | undefined, locale: 'zh' | 'en'): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return locale === 'zh' ? `${m} 分 ${String(s).padStart(2, '0')} 秒` : `${m}m ${String(s).padStart(2, '0')}s`
}
