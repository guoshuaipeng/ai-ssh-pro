/** Lightweight syntax highlighter for D4 (no third-party dependency). */

export type LangId =
  | 'text'
  | 'shell'
  | 'yaml'
  | 'json'
  | 'ini'
  | 'dockerfile'
  | 'python'
  | 'js'
  | 'sql'
  | 'xml'
  | 'markdown'
  | 'nginx'

const EXT_MAP: Array<[RegExp, LangId]> = [
  [/\.(sh|bash|zsh|fish)$/i, 'shell'],
  [/^\.?bashrc$|^\.?profile$|^\.?zshrc$/i, 'shell'],
  [/\.(ya?ml)$/i, 'yaml'],
  [/\.json$/i, 'json'],
  [/\.(ini|conf|cfg|toml|properties|env)$/i, 'ini'],
  [/^Dockerfile$/i, 'dockerfile'],
  [/\.py$/i, 'python'],
  [/\.(js|jsx|mjs|cjs|ts|tsx)$/i, 'js'],
  [/\.sql$/i, 'sql'],
  [/\.(xml|html?)$/i, 'xml'],
  [/\.(md|markdown)$/i, 'markdown'],
  [/nginx/i, 'nginx']
]

export function detectLang(path: string, content?: string): LangId {
  const base = path.replace(/\\/g, '/').split('/').pop() || path
  for (const [re, lang] of EXT_MAP) if (re.test(base) || re.test(path)) return lang
  const first = (content ?? '').split('\n')[0] ?? ''
  if (/^#!.*\b(bash|sh|zsh)\b/.test(first)) return 'shell'
  if (/^#!.*python/.test(first)) return 'python'
  return 'text'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const KW: Partial<Record<LangId, RegExp>> = {
  shell: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|export|local|source|sudo|echo|cd|ls|grep|awk|sed|cat|chmod|chown|systemctl|docker|kubectl)\b/g,
  python: /\b(def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|yield|lambda|True|False|None|and|or|not|in|is|pass|break|continue|async|await)\b/g,
  js: /\b(const|let|var|function|return|import|export|from|as|if|else|for|while|try|catch|finally|class|extends|async|await|new|typeof|instanceof|true|false|null|undefined)\b/g,
  sql: /\b(SELECT|FROM|WHERE|AND|OR|INSERT|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|ORDER|BY|LIMIT|CREATE|TABLE|INDEX|VALUES|INTO|SET|AS|ON|NULL|NOT|IN)\b/gi,
  dockerfile: /\b(FROM|RUN|CMD|ENTRYPOINT|ENV|ARG|COPY|ADD|WORKDIR|USER|EXPOSE|VOLUME|LABEL|HEALTHCHECK|SHELL)\b/g,
  nginx: /\b(server|location|listen|proxy_pass|root|index|upstream|worker_processes|http|events|include|ssl_certificate)\b/g
}

/** Returns HTML for a <pre> with spans. Large files should skip highlighting. */
export function highlightToHtml(source: string, lang: LangId): string {
  if (lang === 'text' || source.length > 2_000_000) return esc(source)
  const lines = source.split('\n')
  return lines
    .map((line) => {
      let s = esc(line)
      // comments
      if (lang === 'shell' || lang === 'python' || lang === 'yaml' || lang === 'ini' || lang === 'dockerfile' || lang === 'nginx') {
        s = s.replace(/(^|\s)(#.*)$/g, (_m, a, b) => `${a}<span class="hl-cmt">${b}</span>`)
      }
      if (lang === 'js' || lang === 'sql') {
        s = s.replace(/(\/\/.*)$/g, '<span class="hl-cmt">$1</span>')
      }
      // strings
      s = s.replace(/(&quot;|&#39;|'|")(?:(?!\1).)*\1/g, (m) => `<span class="hl-str">${m}</span>`)
      // numbers
      s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="hl-num">$1</span>')
      const kw = KW[lang]
      if (kw) s = s.replace(kw, (m) => `<span class="hl-kw">${m}</span>`)
      if (lang === 'json' || lang === 'yaml') {
        s = s.replace(/^(\s*)([\w.-]+)(:)/, (_m, a, k, c) => `${a}<span class="hl-key">${k}</span>${c}`)
      }
      return s
    })
    .join('\n')
}

export type DiffLine = { type: 'same' | 'add' | 'del'; text: string; a?: number; b?: number }

/** Line-based LCS diff (fine for config files < ~2MB). */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n')
  const B = b.split('\n')
  const n = A.length
  const m = B.length
  // For very large files, fall back to simple compare
  if (n * m > 4_000_000) {
    const out: DiffLine[] = []
    const max = Math.max(n, m)
    for (let i = 0; i < max; i++) {
      if (i < n && i < m && A[i] === B[i]) out.push({ type: 'same', text: A[i]!, a: i + 1, b: i + 1 })
      else {
        if (i < n) out.push({ type: 'del', text: A[i]!, a: i + 1 })
        if (i < m) out.push({ type: 'add', text: B[i]!, b: i + 1 })
      }
    }
    return out
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = A[i] === B[j] ? (dp[i + 1]![j + 1]! + 1) : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ type: 'same', text: A[i]!, a: i + 1, b: j + 1 })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: 'del', text: A[i]!, a: i + 1 })
      i++
    } else {
      out.push({ type: 'add', text: B[j]!, b: j + 1 })
      j++
    }
  }
  while (i < n) {
    out.push({ type: 'del', text: A[i]!, a: i + 1 })
    i++
  }
  while (j < m) {
    out.push({ type: 'add', text: B[j]!, b: j + 1 })
    j++
  }
  return out
}

export function diffStats(lines: DiffLine[]): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const l of lines) {
    if (l.type === 'add') add++
    if (l.type === 'del') del++
  }
  return { add, del }
}
