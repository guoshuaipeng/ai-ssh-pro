/** D64: compare batch-exec outputs across hosts: group identical results and flag hosts that differ from the majority. */
import type { BatchExecSessionResult } from './workspace-features'

export type BatchGroup = { key: string; sessionIds: string[] }
export type BatchCompare = { groups: BatchGroup[]; majority: string | null; outliers: string[] }

export const BATCH_DIFF_TAIL = 800
export const BATCH_DIFF_MAX = 8000

function norm(s: string): string {
  return s.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim()
}

export function outputKey(r: Pick<BatchExecSessionResult, 'code' | 'stdout' | 'stderr' | 'error'>): string {
  return `${r.error ?? ''}\u0000${r.code ?? ''}\u0000${norm(r.stdout)}\u0000${norm(r.stderr)}`
}

/** Majority = the single largest group with at least 2 hosts; ties or all-unique give no majority. */
export function compareBatch(rows: BatchExecSessionResult[]): BatchCompare {
  const map = new Map<string, string[]>()
  for (const r of rows) {
    const k = outputKey(r)
    map.set(k, [...(map.get(k) ?? []), r.sessionId])
  }
  const groups = [...map.entries()].map(([key, sessionIds]) => ({ key, sessionIds })).sort((a, b) => b.sessionIds.length - a.sessionIds.length)
  const top = groups[0]
  const tie = groups.length > 1 && groups[1]!.sessionIds.length === top?.sessionIds.length
  const majority = top && top.sessionIds.length >= 2 && !tie && groups.length > 1 ? top.key : null
  const outliers = majority ? rows.filter((r) => outputKey(r) !== majority).map((r) => r.sessionId) : []
  return { groups, majority, outliers }
}

function tail(s: string): string {
  const t = norm(s)
  return t.length > BATCH_DIFF_TAIL ? '…' + t.slice(-BATCH_DIFF_TAIL) : t
}

function block(r: BatchExecSessionResult): string {
  const out = [r.error ? `error: ${r.error}` : '', tail(r.stdout), r.stderr.trim() ? `[stderr]\n${tail(r.stderr)}` : ''].filter(Boolean).join('\n')
  return `exit ${r.code ?? '-'}` + (out ? `\n${out}` : '')
}

/** AI context: the command, the majority result once, then each differing host. Redacted and capped. */
export function batchDiffContext(command: string, rows: BatchExecSessionResult[], cmp: BatchCompare, redact: (s: string) => string): string {
  if (!cmp.majority || !cmp.outliers.length) return ''
  const name = (r: BatchExecSessionResult) => r.label || r.host || r.sessionId
  const major = rows.filter((r) => outputKey(r) === cmp.majority)
  const parts = [`$ ${command.trim()}`, `## majority (${major.length}): ${major.map(name).join(', ')}\n${block(major[0]!)}`]
  for (const r of rows) if (cmp.outliers.includes(r.sessionId)) parts.push(`## differs: ${name(r)}\n${block(r)}`)
  let text = redact(parts.join('\n\n'))
  if (text.length > BATCH_DIFF_MAX) text = text.slice(0, BATCH_DIFF_MAX) + '\n…'
  return text
}
