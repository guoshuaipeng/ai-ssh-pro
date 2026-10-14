/** A4: build a truncated prompt from one host's metric snapshot and recent journal. */
export const ALERT_JOURNAL_MAX = 3500

export type AlertSnapshot = {
  cpuPercent?: number | null
  memPercent?: number | null
  disks?: Array<{ mount?: string; percent?: number }>
}

export function formatSnapshot(snap: AlertSnapshot | null | undefined): string {
  if (!snap) return ''
  const lines: string[] = []
  if (snap.cpuPercent != null) lines.push(`cpu ${Math.round(snap.cpuPercent)}%`)
  if (snap.memPercent != null) lines.push(`mem ${Math.round(snap.memPercent)}%`)
  for (const d of snap.disks ?? []) {
    if (d.percent == null) continue
    lines.push(`disk ${d.mount || '/'} ${Math.round(d.percent)}%`)
  }
  return lines.join('\n')
}

export function truncateJournal(text: string | undefined | null, max = ALERT_JOURNAL_MAX): string {
  const raw = String(text ?? '').trim()
  if (raw.length <= max) return raw
  return raw.slice(raw.length - max)
}

export function buildAlertContext(opts: {
  host: string
  ruleId: string
  value: number
  threshold: number
  snapshot?: AlertSnapshot | null
  journal?: string | null
}): string {
  const snap = formatSnapshot(opts.snapshot)
  const journal = truncateJournal(opts.journal)
  return [
    `Host: ${opts.host}`,
    `Alert: ${opts.ruleId} value=${Math.round(opts.value)} threshold=${opts.threshold}`,
    snap ? `Metrics:\n${snap}` : '',
    journal ? `Recent journal (truncated):\n${journal}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}
