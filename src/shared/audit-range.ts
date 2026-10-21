export type AuditRange = 'all' | '1d' | '7d' | '30d' | 'custom'

/** AU2: preset range -> local YYYY-MM-DD lower bound ('' = no bound). */
export function auditRangeSince(r: AuditRange, now: Date): string {
  const days = r === '1d' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : 0
  if (!days) return ''
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
