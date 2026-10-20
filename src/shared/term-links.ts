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

/**
 * D72: path-looking tokens (absolute, ~/, ./, ../, or containing a slash). A trailing :line[:col] is dropped from
 * `path` but kept in the range so the whole "file.ts:12:3" is clickable. URL spans are skipped.
 */
export type PathHit = { start: number; end: number; path: string }

const PATH_RE = /(?:~\/|\.{1,2}\/|\/)?[\w.@+-]+(?:\/[\w.@+-]+)+\/?|~\/?|(?<![\w/])\/[\w.@+-]+\/?/g

export function findPaths(line: string): PathHit[] {
  const urls = findUrls(line)
  const inUrl = (i: number) => urls.some((u) => i >= u.start && i < u.end)
  const out: PathHit[] = []
  PATH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PATH_RE.exec(line))) {
    const start = m.index
    let tok = m[0]
    if (tok === '~' || tok === '/' || inUrl(start)) continue
    // token glued to a scheme like "http:" is part of a URL we skipped
    if (line[start - 1] === ':' && /[a-z]$/i.test(line.slice(0, start - 1))) continue
    let end = start + tok.length
    const tail = /^:\d+(?::\d+)?/.exec(line.slice(end))
    if (tail) end += tail[0].length
    tok = tok.replace(/[.,;]+$/, '')
    if (!tok.includes('/') || /^[\d/.:-]+$/.test(tok)) continue // dates, fractions, versions
    out.push({ start, end: Math.max(start + tok.length, tail ? end : start + tok.length), path: tok })
  }
  return out
}
