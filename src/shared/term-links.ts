/** D70: http(s) URLs in a terminal line. Columns are 0-based [start, end). Trailing punctuation is trimmed. */
export type UrlHit = { start: number; end: number; url: string }

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi

export function findUrls(line: string): UrlHit[] {
  const out: UrlHit[] = []
  URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_RE.exec(line))) {
    let url = m[0]
    // drop trailing punctuation and unbalanced closing brackets
    for (;;) {
      const last = url[url.length - 1]
      if (!last) break
      if ('.,;:!?'.includes(last)) url = url.slice(0, -1)
      else if (last === ')' && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1)
      else if (last === ']' && (url.match(/\[/g)?.length ?? 0) < (url.match(/\]/g)?.length ?? 0)) url = url.slice(0, -1)
      else break
    }
    if (url.length > 'https://'.length) out.push({ start: m.index, end: m.index + url.length, url })
  }
  return out
}
