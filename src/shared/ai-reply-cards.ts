/** Plain-text fragments for AI reply cards. Metrics render as yellow highlights. */
export type HighlightPart = { kind: 'text' | 'mark' | 'strong'; text: string }

const METRIC_SOURCE =
  '(?<![A-Za-z0-9.])(?:\\d+(?:\\.\\d+)?\\s?%|\\d+(?:\\.\\d+)?\\s?(?:TiB|GiB|MiB|KiB|TB|GB|MB|KB|[TGMK])(?:\\s*\\/\\s*\\d+(?:\\.\\d+)?\\s?(?:TiB|GiB|MiB|KiB|TB|GB|MB|KB|[TGMK]))?)'

function pushMerged(out: HighlightPart[], part: HighlightPart): void {
  if (!part.text) return
  const prev = out[out.length - 1]
  if (prev && prev.kind === part.kind) prev.text += part.text
  else out.push({ kind: part.kind, text: part.text })
}

/**
 * When a description is one line of `1) … 2) … 3) …`, insert a real newline before each
 * numbered item that is not already on its own line. A Chinese colon or semicolon counts
 * as a break, so `证据：1) …；2) …` does not stay one paragraph. Decimals (`1.83`) stay put.
 * Items that already follow a newline stay put.
 */
export function softenNumberedBreaks(input: string): string {
  if (!input) return ''
  return input.replace(
    /(^|[\t ：:；;。．、，,])(\d+\)[ \t]*|\d+\.[ \t]+|（\d+）[ \t]*|\(\d+\)[ \t]*)/g,
    (_full, lead: string, item: string, offset: number) => {
      if (offset === 0) return item
      if (/[：:；;。．、，,]/.test(lead)) return `${lead}\n${item}`
      return `\n${item}`
    }
  )
}

export type OpsRisk = 'low' | 'medium' | 'high'

export type OpsBlock =
  | { kind: 'prose'; text: string }
  | { kind: 'finding'; n: string; text: string; risk: OpsRisk | null }
  | { kind: 'conclusion'; text: string; risk: OpsRisk | null }
  | { kind: 'commands'; commands: string[]; confirm: boolean }

export type OpsLayout = {
  risk: OpsRisk | null
  blocks: OpsBlock[]
}

const HIGH_RISK = /告警|瓶颈|严重|危险|故障|过高|高危|critical|overload/i
const MEDIUM_RISK = /压力|需关注|中等|偏高|中高|警告|warning|elevated/i
const LOW_RISK = /正常|健康|较低|低于|healthy|normal/i
const PROPOSE_RUN = /需执行|请执行|建议执行|必须(?:先)?执行|尚未执行|还未执行|未执行|可以执行/
const ALREADY_RAN = /(?<!未)已执行|(?<!未)已经执行|已获取/

const DIAG_CMD =
  /\b(?:uptime|free\s+-h|free\s+-m|df\s+-h|cat\s+\/proc\/loadavg|cat\s+\/proc\/meminfo|vmstat|iostat|ps\s+aux)\b/g

function inferRisk(text: string): OpsRisk | null {
  if (HIGH_RISK.test(text)) return 'high'
  if (MEDIUM_RISK.test(text)) return 'medium'
  if (LOW_RISK.test(text)) return 'low'
  return null
}

function higherRisk(a: OpsRisk | null, b: OpsRisk | null): OpsRisk | null {
  const rank = (r: OpsRisk | null) => (r === 'high' ? 3 : r === 'medium' ? 2 : r === 'low' ? 1 : 0)
  return rank(a) >= rank(b) ? a : b
}

function proposedCommands(text: string): string[] {
  if (!PROPOSE_RUN.test(text) || ALREADY_RAN.test(text)) return []
  const out: string[] = []
  for (const m of text.matchAll(new RegExp(DIAG_CMD.source, 'g'))) {
    const cmd = m[0].replace(/\s+/g, ' ')
    if (!out.includes(cmd)) out.push(cmd)
  }
  return out
}

function splitConclusion(body: string): { body: string; conclusion: string | null } {
  const m = body.match(/^(.*?)(?:[。；;]\s*)?结论[:：]\s*(.+)$/)
  if (!m) return { body: body.trim(), conclusion: null }
  return { body: (m[1] ?? '').replace(/[。；;\s]+$/, '').trim(), conclusion: (m[2] ?? '').trim() }
}

/**
 * Turn an ops-style diagnostic paragraph into blocks: lead prose, one card per
 * numbered finding, a conclusion, and a command strip only when the reply asks
 * to run something. A result write-up that merely names `uptime` stays prose.
 */
export function layoutOpsReply(raw: string): OpsLayout {
  const text = softenNumberedBreaks(raw).trim()
  if (!text) return { risk: null, blocks: [] }
  const blocks: OpsBlock[] = []
  let prose: string[] = []
  const flushProse = () => {
    const chunk = prose.join('\n').trim()
    prose = []
    if (!chunk) return
    blocks.push({ kind: 'prose', text: chunk })
    const commands = proposedCommands(chunk)
    if (commands.length) blocks.push({ kind: 'commands', commands, confirm: true })
  }
  for (const line of text.split('\n')) {
    const finding = /^(?:(\d+)\)|（(\d+)）|\((\d+)\))\s*(.*)$/.exec(line.trim())
    if (!finding) {
      const conc = line.trim().match(/^结论[:：]\s*(.+)$/)
      if (conc) {
        flushProse()
        const sentence = (conc[1] ?? '').trim()
        if (sentence) blocks.push({ kind: 'conclusion', text: sentence, risk: inferRisk(sentence) })
      } else {
        prose.push(line)
      }
      continue
    }
    flushProse()
    const n = finding[1] || finding[2] || finding[3] || ''
    const split = splitConclusion(finding[4] ?? '')
    if (split.body) blocks.push({ kind: 'finding', n, text: split.body, risk: inferRisk(split.body) })
    if (split.conclusion) blocks.push({ kind: 'conclusion', text: split.conclusion, risk: inferRisk(split.conclusion) })
  }
  flushProse()
  let risk: OpsRisk | null = null
  for (const block of blocks) {
    if (block.kind === 'finding' || block.kind === 'conclusion') risk = higherRisk(risk, block.risk)
  }
  return { risk, blocks }
}

/** One shell line the Agree button can inject. Multiple diagnostics are joined, not auto-run. */
export function commandBundle(commands: string[]): string {
  return commands.map((c) => c.trim()).filter(Boolean).join(' && ')
}

/** Split a chunk on key metrics (percent, size, size/size). */
export function splitMetricTokens(chunk: string): HighlightPart[] {
  const out: HighlightPart[] = []
  const re = new RegExp(METRIC_SOURCE, 'g')
  let last = 0
  for (const m of chunk.matchAll(re)) {
    const index = m.index ?? 0
    if (index > last) pushMerged(out, { kind: 'text', text: chunk.slice(last, index) })
    pushMerged(out, { kind: 'mark', text: m[0] })
    last = index + m[0].length
  }
  if (last < chunk.length) pushMerged(out, { kind: 'text', text: chunk.slice(last) })
  return out
}

/**
 * Highlight key numbers in assistant prose.
 * `**85%**` and bare `371G/466G` become marks. Long bold sentences stay strong, not a yellow wall.
 */
export function highlightKeyNumbers(raw: string): HighlightPart[] {
  const input = softenNumberedBreaks(raw)
  if (!input) return []
  const out: HighlightPart[] = []
  const bold = /\*\*([^*]+)\*\*/g
  let last = 0
  for (const m of input.matchAll(bold)) {
    const index = m.index ?? 0
    if (index > last) {
      for (const p of splitMetricTokens(input.slice(last, index))) pushMerged(out, p)
    }
    const inner = m[1] ?? ''
    const innerParts = splitMetricTokens(inner)
    const marked = innerParts.some((p) => p.kind === 'mark')
    if (marked) {
      for (const p of innerParts) pushMerged(out, p)
    } else if (/\d/.test(inner) && inner.trim().length <= 24) {
      pushMerged(out, { kind: 'mark', text: inner })
    } else if (inner) {
      pushMerged(out, { kind: 'strong', text: inner })
    }
    last = index + m[0].length
  }
  if (last < input.length) {
    for (const p of splitMetricTokens(input.slice(last))) pushMerged(out, p)
  }
  return out.length > 0 ? out : [{ kind: 'text', text: input }]
}

/** Command steps always need Agree / Decline. Risk level does not bypass confirmation. */
export function commandAutoRunAllowed(_riskLevel?: string | null): false {
  return false
}
