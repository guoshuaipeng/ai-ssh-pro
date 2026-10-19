/** Pure helpers for AI provider "Test connection" (no network). */

import { aiHttpErrorMessages } from './ai-http-error'

export type AiProviderTestInput = {
  baseURL: string
  apiKey: string
  model: string
}

export type AiProviderTestOk = { ok: true; latencyMs: number; model: string }
export type AiProviderTestFail = {
  ok: false
  status: number
  messageZh: string
  messageEn: string
  reason?: 'baseURL' | 'apiKey' | 'model' | 'http' | 'network' | 'timeout'
}
export type AiProviderTestResult = AiProviderTestOk | AiProviderTestFail

export const AI_PROVIDER_TEST_TIMEOUT_MS = 12_000

export function normalizeAiBaseUrl(raw: string): string {
  return String(raw ?? '').trim().replace(/\/+$/, '')
}

export function aiProviderTestUrl(baseURL: string): string {
  return `${normalizeAiBaseUrl(baseURL)}/chat/completions`
}

export function validateAiProviderTestInput(
  input: AiProviderTestInput
): { ok: true } | { ok: false; reason: 'baseURL' | 'apiKey' | 'model' } {
  if (!normalizeAiBaseUrl(input.baseURL)) return { ok: false, reason: 'baseURL' }
  if (!String(input.apiKey ?? '').trim()) return { ok: false, reason: 'apiKey' }
  if (!String(input.model ?? '').trim()) return { ok: false, reason: 'model' }
  return { ok: true }
}

export function aiProviderTestBody(model: string): Record<string, unknown> {
  return {
    model: String(model ?? '').trim(),
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    stream: false,
    temperature: 0
  }
}

export function validationFailMessages(reason: 'baseURL' | 'apiKey' | 'model'): { zh: string; en: string } {
  if (reason === 'baseURL') {
    return { zh: '请先填写 Base URL（通常以 /v1 或 /compatible-mode/v1 结尾）。', en: 'Enter a Base URL first (often ends with /v1 or /compatible-mode/v1).' }
  }
  if (reason === 'apiKey') {
    return { zh: '请先填写 API Key，再测试连接。', en: 'Enter an API key before testing the connection.' }
  }
  return { zh: '请先选择或填写模型名。', en: 'Choose or enter a model name first.' }
}

export function classifyAiProviderTestResponse(
  status: number,
  body: string,
  latencyMs: number,
  model: string
): AiProviderTestResult {
  const code = Number.isFinite(status) ? Math.floor(status) : 0
  if (code >= 200 && code < 300) {
    return { ok: true, latencyMs: Math.max(0, Math.round(latencyMs)), model: String(model ?? '').trim() }
  }
  const msgs = aiHttpErrorMessages(code, body)
  return { ok: false, status: code, messageZh: msgs.zh, messageEn: msgs.en, reason: 'http' }
}

export function networkFailResult(err: unknown): AiProviderTestFail {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  if (/aborted|timeout|TimeoutError/i.test(raw)) {
    return {
      ok: false,
      status: 0,
      reason: 'timeout',
      messageZh: '连接超时。请检查 Base URL、网络或代理后重试。',
      messageEn: 'Connection timed out. Check Base URL, network, or proxy and retry.'
    }
  }
  const msgs = aiHttpErrorMessages(0, raw)
  return { ok: false, status: 0, reason: 'network', messageZh: msgs.zh, messageEn: msgs.en }
}
