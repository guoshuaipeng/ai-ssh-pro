/** D7: multi-line paste preview. */
import { assessCommandRisk, type RiskReasonKey } from './command-risk'

export type PastePlan = {
  lines: string[]
  /** more than one non-empty line → needs a preview */
  multiline: boolean
  /** ends with a newline → the last line would run too */
  runsLast: boolean
  risky: { index: number; reasonKey: RiskReasonKey }[]
  /** single-line form, or null when joining is unsafe (heredoc, continuation, comments) */
  joined: string | null
}

export function planPaste(text: string): PastePlan {
  const norm = String(text ?? '').replace(/\r\n?/g, '\n')
  const runsLast = /\n\s*$/.test(norm)
  const lines = norm.replace(/\n+$/, '').split('\n')
  const nonEmpty = lines.filter((l) => l.trim())
  const risky: PastePlan['risky'] = []
  lines.forEach((l, index) => {
    const r = assessCommandRisk(l)
    if (r) risky.push({ index, reasonKey: r.reasonKey })
  })
  const unsafeJoin = /<</.test(norm) || lines.some((l) => /\\\s*$/.test(l) || /^\s*#/.test(l) || /(&&|\|\||\||;)\s*$/.test(l.trim()))
  const joined = nonEmpty.length > 1 && !unsafeJoin ? nonEmpty.map((l) => l.trim()).join(' && ') : null
  return { lines, multiline: nonEmpty.length > 1, runsLast, risky, joined }
}
