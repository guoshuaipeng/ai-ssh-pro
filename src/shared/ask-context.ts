/** D6: wrap a terminal selection as a fenced block for the AI composer. Keeps the tail when too long. */
export function fenceSelection(text: string, max = 4000): string {
  let body = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
  if (body.length > max) body = '…\n' + body.slice(body.length - max)
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}\n${body}\n${fence}`
}
