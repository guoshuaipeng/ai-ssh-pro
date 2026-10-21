/** DF1: pure calendar helpers for the themed DateField (Monday-first weeks, local dates). */
export type Ymd = { y: number; m: number; d: number } // m: 0-11

export function parseYmd(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(y, mo, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null
  return { y, m: mo, d }
}

export function fmtYmd(v: Ymd): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${v.y}-${p(v.m + 1)}-${p(v.d)}`
}

/** Shift by days, normalising across month / year edges. */
export function addDays(v: Ymd, n: number): Ymd {
  const dt = new Date(v.y, v.m, v.d + n)
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() }
}

/** Shift month, clamping the day (Jan 31 + 1 month -> Feb 28/29). */
export function addMonths(v: Ymd, n: number): Ymd {
  const first = new Date(v.y, v.m + n, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return { y: first.getFullYear(), m: first.getMonth(), d: Math.min(v.d, last) }
}

/** 6x7 grid of dates covering the month, Monday first; `inMonth` marks the visible month. */
export function monthGrid(y: number, m: number): Array<Ymd & { inMonth: boolean }> {
  const first = new Date(y, m, 1)
  const lead = (first.getDay() + 6) % 7
  const out: Array<Ymd & { inMonth: boolean }> = []
  for (let i = 0; i < 42; i++) {
    const dt = new Date(y, m, 1 - lead + i)
    out.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), inMonth: dt.getMonth() === m })
  }
  return out
}

/** Inclusive bounds check on YYYY-MM-DD strings; empty bound = open. */
export function withinYmd(s: string, min?: string, max?: string): boolean {
  if (min && s < min) return false
  if (max && s > max) return false
  return true
}
