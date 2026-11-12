# -*- coding: utf-8 -*-
"""R21 item1: extend ExecRecord + helpers for failure evidence."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
p = ROOT / "src/shared/ai-exec-replay.ts"
text = p.read_text(encoding="utf-8")

needle = """export type ExecRecord = {
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
}
"""

replacement = """export type ExecFailureKind = 'nonzero' | 'stderr' | 'timeout' | 'write'
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
  const stderr = (input.stderr ?? '').replace(/\\r/g, '').trim()
  if (stderr) lines.push(stderr)
  if (input.timedOut === true) lines.push((input.timeoutMark ?? '').trim() || 'timeout')
  if (input.writeOk === false) lines.push('writeOk=false')
  if (!lines.length) {
    const sum = (input.summary ?? '').trim()
    if (sum) lines.push(sum)
  }
  return lines.join('\\n')
}

export function clipFailureEvidence(text: string, max = FAILURE_EVIDENCE_MAX_CHARS): string {
  const t = String(text ?? '').replace(/\\r/g, '').trim()
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
"""

if "buildFailureEvidenceView" not in text:
    if needle not in text:
        raise SystemExit("ExecRecord block not found")
    text = text.replace(needle, replacement, 1)
else:
    print("helpers already present")

# Extend normalizeExecRecord
norm_old = """  if (out.status === 'sent' && typeof r.noExit === 'string' && (NO_EXIT as readonly string[]).includes(r.noExit)) out.noExit = r.noExit as NoExitReason
  return out
}
"""
norm_new = """  if (out.status === 'sent' && typeof r.noExit === 'string' && (NO_EXIT as readonly string[]).includes(r.noExit)) out.noExit = r.noExit as NoExitReason
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
"""
if "out.failureKind" not in text:
    if norm_old not in text:
        raise SystemExit("normalizeExecRecord tail not found")
    text = text.replace(norm_old, norm_new, 1)

p.write_text(text, encoding="utf-8")
print("ai-exec-replay.ts patched")
