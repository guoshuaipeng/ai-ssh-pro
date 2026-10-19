/** Human AI provider HTTP / network failures for chat and assist. */

export type AiHttpLocale = 'zh-CN' | 'en'

function bodyHints(body: string): {
  invalidKey: boolean
  forbidden: boolean
  rate: boolean
  model: boolean
  network: boolean
} {
  const t = String(body ?? '')
  return {
    invalidKey:
      /invalid.?api.?key|incorrect.?api.?key|api.?key.*(invalid|incorrect|wrong)|unauthorized|authentication.?fail|无效.*(密钥|key)|密钥.*(无效|错误)/i.test(
        t
      ),
    forbidden: /permission.?denied|forbidden|not allowed|access.?denied|没有权限/i.test(t),
    rate: /rate.?limit|too many requests|quota|exceeded|额度|限流|频率/i.test(t),
    model: /model.*(not found|does not exist|invalid)|unknown model|模型.*(不存在|无效)/i.test(t),
    network: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network|ERR_CONNECTION|无法连接/i.test(t)
  }
}

export function aiHttpErrorMessages(status: number, body = ''): { zh: string; en: string } {
  const code = Number.isFinite(status) ? Math.floor(status) : 0
  const hints = bodyHints(body)

  if (hints.invalidKey || code === 401) {
    return {
      zh: 'API Key 无效或未授权。请打开 AI 配置检查密钥是否完整、是否选对了 Provider。',
      en: 'API key is invalid or unauthorized. Open AI settings and check the key and active provider.'
    }
  }
  if (code === 403 || hints.forbidden) {
    return {
      zh: 'API 拒绝访问（403）。请确认该密钥有权调用所选模型，或账号已开通服务。',
      en: 'API forbidden (403). Confirm the key can call this model, or that the account is enabled.'
    }
  }
  if (code === 429 || hints.rate) {
    return {
      zh: '请求过于频繁或额度用尽（429）。请稍后再试，或换一个 Provider / 模型。',
      en: 'Rate limited or quota exceeded (429). Retry later, or switch provider / model.'
    }
  }
  if (hints.model || code === 404) {
    return {
      zh: '接口或模型不存在。请检查 Base URL（常以 /v1 或 /compatible-mode/v1 结尾）和模型名。',
      en: 'Endpoint or model not found. Check Base URL (often ends with /v1 or /compatible-mode/v1) and model name.'
    }
  }
  if (hints.network || code === 0) {
    return {
      zh: '无法连接 AI 服务。请检查 Base URL 是否可访问，以及本机网络 / 代理。',
      en: 'Could not reach the AI provider. Check Base URL reachability and your network / proxy.'
    }
  }
  if (code >= 500) {
    return {
      zh: `AI 服务暂时不可用（HTTP ${code}）。请稍后重试。`,
      en: `AI provider is temporarily unavailable (HTTP ${code}). Try again later.`
    }
  }
  const snippet = String(body ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  const codeLabel = code || '?'
  return {
    zh: 'AI 请求失败（HTTP ' + codeLabel + '）' + (snippet ? '：' + snippet : ''),
    en: 'AI request failed (HTTP ' + codeLabel + ')' + (snippet ? ': ' + snippet : '')
  }
}

/** Locale-aware one-liner for renderer / tests. */
export function friendlyAiHttpError(status: number, body = '', locale: AiHttpLocale = 'zh-CN'): string {
  const m = aiHttpErrorMessages(status, body)
  return locale === 'en' ? m.en : m.zh
}

/** Match legacy `HTTP 401: ...` strings already in the UI. */
export function parseAiHttpErrorMessage(raw: string): { status: number; body: string } | null {
  const m = /^HTTP\s+(\d{3})\s*:?\s*([\s\S]*)$/i.exec(String(raw ?? '').trim())
  if (!m) return null
  return { status: Number(m[1]), body: (m[2] ?? '').trim() }
}

