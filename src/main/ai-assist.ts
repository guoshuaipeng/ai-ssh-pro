import type { AiAssistRequest, AiAssistResult, AiSettings } from '../shared/ipc'

/** A1 / A2: short, single-shot JSON completions against the active OpenAI-compatible provider. */
const inflight = new Map<string, AbortController>()

function systemPrompt(req: AiAssistRequest): string {
  const zh = req.locale === 'zh-CN'
  const lang = zh ? '用简体中文回答。' : 'Answer in English.'
  if (req.kind === 'explainError') {
    return [
      'You are a senior Linux / DevOps engineer helping a user who just hit an error in an SSH terminal.',
      'Explain the most likely cause in 1-3 short sentences and give up to 3 shell commands that diagnose or fix it.',
      'Prefer safe, read-only diagnostics first. Never invent hostnames or credentials.',
      'Reply with ONE JSON object only, no markdown: {"cause": string, "fixes": [{"command": string, "note": string}], "notes": string}.',
      lang
    ].join('\n')
  }
  return [
    'You turn a natural-language request into ONE POSIX shell command for a Linux server reached over SSH.',
    'Prefer common tools (ss, ps, grep, find, systemctl, journalctl, df, du). Do not chain unrelated commands.',
    'Classify risk: "safe" (read-only), "caution" (changes state but recoverable), "danger" (destructive / irreversible).',
    'Reply with ONE JSON object only, no markdown: {"command": string, "explanation": string, "risk": "safe"|"caution"|"danger"}.',
    lang
  ].join('\n')
}

function extractJson(text: string): Record<string, unknown> {
  const t = text.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  const body = (fenced ? fenced[1]! : t).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  const raw = JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body) as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object')
  return raw as Record<string, unknown>
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function normalizeAssist(kind: AiAssistRequest['kind'], o: Record<string, unknown>): AiAssistResult {
  if (kind === 'explainError') {
    const fixes = (Array.isArray(o.fixes) ? o.fixes : [])
      .map((f): Record<string, unknown> => (f && typeof f === 'object' ? (f as Record<string, unknown>) : { command: f }))
      .map((f) => ({ command: str(f.command, 500).replace(/[\r\n]+/g, ' '), note: str(f.note, 300) || undefined }))
      .filter((f) => f.command)
      .slice(0, 5)
    const cause = str(o.cause)
    if (!cause && !fixes.length) return { ok: false, code: 'error', message: 'empty answer' }
    return { ok: true, kind, cause, fixes, notes: str(o.notes) || undefined }
  }
  const command = str(o.command, 500).replace(/[\r\n]+/g, ' ')
  if (!command) return { ok: false, code: 'error', message: 'empty answer' }
  // unknown or missing risk is treated conservatively
  const risk = o.risk === 'danger' || o.risk === 'safe' ? o.risk : 'caution'
  return { ok: true, kind, command, explanation: str(o.explanation, 600), risk }
}

export async function runAiAssist(req: AiAssistRequest, settings: AiSettings): Promise<AiAssistResult> {
  const providers = Array.isArray(settings?.providers) ? settings.providers : []
  const provider = providers.find((p) => p.id === settings.activeProviderId) ?? providers[0]
  const apiKey = provider?.apiKey?.trim()
  if (!provider || !apiKey || !provider.baseURL?.trim() || !settings?.model?.trim()) return { ok: false, code: 'not-configured' }
  const text = String(req.text ?? '').trim()
  if (!text) return { ok: false, code: 'error', message: 'empty input' }
  const ctrl = new AbortController()
  inflight.get(req.requestId)?.abort()
  inflight.set(req.requestId, ctrl)
  const timer = setTimeout(() => ctrl.abort(), 60_000)
  try {
    const url = `${provider.baseURL.replace(/\/$/, '')}/chat/completions`
    const user =
      req.kind === 'explainError'
        ? `${req.host ? `Host: ${req.host}\n` : ''}Terminal output (most recent last):\n${text.slice(-6000)}`
        : `${req.host ? `Host: ${req.host}\n` : ''}Request: ${text.slice(0, 1000)}`
    const body = {
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt(req) },
        { role: 'user', content: user }
      ],
      temperature: 0.1
    }
    const post = (extra: Record<string, unknown>) =>
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ...extra }),
        signal: ctrl.signal
      })
    let res = await post({ response_format: { type: 'json_object' } })
    if (!res.ok && res.status === 400) res = await post({})
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, code: 'error', message: `HTTP ${res.status} ${t.slice(0, 200)}`.trim() }
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content
    if (!content) return { ok: false, code: 'error', message: 'empty answer' }
    return normalizeAssist(req.kind, extractJson(content))
  } catch (e) {
    if (ctrl.signal.aborted) return { ok: false, code: 'aborted' }
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
    if (inflight.get(req.requestId) === ctrl) inflight.delete(req.requestId)
  }
}

export function abortAiAssist(requestId: string): void {
  inflight.get(requestId)?.abort()
}
