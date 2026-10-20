/** D6: wrap a terminal selection as a fenced block for the AI composer. Keeps the tail when too long. */
/** D66: error-looking lines worth keeping from the middle of a long selection */
export const KEY_LINE_RE = /\b(error|fail(ed|ure)?|exception|fatal|panic|denied|refused|traceback|caused by|segfault|oom|killed)\b|错误|失败|异常/i

/**
 * D66: shrink a long multi-line selection to `max` chars keeping the head (where it started), the tail
 * (where it ended) and error-looking lines from the middle. Few-line text keeps the old tail-only cut.
 */
export function trimLog(body: string, max: number): string {
  if (body.length <= max) return body
  const lines = body.split('\n')
  if (lines.length < 6) return '…\n' + body.slice(body.length - max)
  const headBudget = Math.floor(max * 0.3)
  const tailBudget = Math.floor(max * 0.55)
  let keyBudget = max - headBudget - tailBudget
  let used = 0
  let h = 0
  while (h < lines.length && used + lines[h]!.length + 1 <= headBudget) used += lines[h++]!.length + 1
  used = 0
  let t = lines.length
  while (t > h && used + lines[t - 1]!.length + 1 <= tailBudget) used += lines[--t]!.length + 1
  if (h === 0 && t === lines.length) return '…\n' + body.slice(body.length - max)
  const middle = lines.slice(h, t)
  const keys: string[] = []
  for (const l of middle) {
    if (!KEY_LINE_RE.test(l)) continue
    const s = l.length > 200 ? l.slice(0, 200) + '…' : l
    if (s.length + 1 > keyBudget) break
    keys.push(s)
    keyBudget -= s.length + 1
  }
  const omitted = middle.length - keys.length
  const mark = `… (${omitted} lines omitted${keys.length ? `, ${keys.length} error lines kept` : ''}) …`
  return [...lines.slice(0, h), mark, ...keys, ...(keys.length ? ['…'] : []), ...lines.slice(t)].join('\n')
}

export function fenceSelection(text: string, max = 4000): string {
  let body = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
  if (body.length > max) body = trimLog(body, max)
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}\n${body}\n${fence}`
}
