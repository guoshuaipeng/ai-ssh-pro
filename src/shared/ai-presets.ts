/**
 * B2: provider presets. Every base URL below is copied from the provider's own docs
 * (checked 2026-10-20, see docsUrl). Model ids are the examples those pages use; users can edit them.
 * Do not add an endpoint here without a docs link that shows it.
 */

export type AiPreset = {
  id: string
  name: { zh: string; en: string }
  baseURL: string
  models: string[]
  /** Local servers ignore the key; requests go out without Authorization. */
  keyRequired: boolean
  docsUrl: string
  note?: { zh: string; en: string }
}

export const AI_PRESETS: readonly AiPreset[] = [
  {
    id: 'dashscope',
    name: { zh: '阿里云百炼 · 千问（北京）', en: 'Alibaba Model Studio · Qwen (Beijing)' },
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.8-max', 'qwen3.7-plus'],
    keyRequired: true,
    docsUrl: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
    note: {
      zh: '官方建议改用业务空间专属域名 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1；API Key 需与地域一致。',
      en: 'The docs recommend the workspace domain https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1. The API key must match the region.'
    }
  },
  {
    id: 'dashscope-intl',
    name: { zh: '阿里云百炼 · 千问（新加坡）', en: 'Alibaba Model Studio · Qwen (Singapore)' },
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.8-max', 'qwen3.7-plus'],
    keyRequired: true,
    docsUrl: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
    note: {
      zh: '新加坡地域的 API Key 与北京不通用。',
      en: 'Singapore keys do not work in Beijing and vice versa.'
    }
  },
  {
    id: 'deepseek',
    name: { zh: 'DeepSeek', en: 'DeepSeek' },
    baseURL: 'https://api.deepseek.com',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    keyRequired: true,
    docsUrl: 'https://api-docs.deepseek.com/'
  },
  {
    id: 'moonshot',
    name: { zh: '月之暗面 · Kimi', en: 'Moonshot · Kimi' },
    baseURL: 'https://api.moonshot.cn/v1',
    models: ['kimi-k3', 'kimi-k2.6', 'kimi-k2.7-code-highspeed'],
    keyRequired: true,
    docsUrl: 'https://platform.moonshot.cn/docs/guide/start-using-kimi-api'
  },
  {
    id: 'zhipu',
    name: { zh: '智谱 · GLM', en: 'Zhipu · GLM' },
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5.3', 'glm-5.3-flash'],
    keyRequired: true,
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction'
  },
  {
    id: 'ollama',
    name: { zh: 'Ollama（本机）', en: 'Ollama (local)' },
    baseURL: 'http://localhost:11434/v1',
    models: ['qwen3:8b', 'gpt-oss:20b'],
    keyRequired: false,
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    note: {
      zh: '无需 API Key。先在本机执行 ollama pull <模型>，模型名以 ollama list 为准。',
      en: 'No API key needed. Run ollama pull <model> first; use the names from ollama list.'
    }
  }
]

export function findPreset(id: string): AiPreset | undefined {
  return AI_PRESETS.find((p) => p.id === id)
}

function hostOf(baseURL: string): string {
  try {
    return new URL(String(baseURL ?? '').trim()).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return ''
  }
}

/** Loopback servers (Ollama, LM Studio, vLLM on this computer) may run without a key. */
export function keyOptional(baseURL: string): boolean {
  const h = hostOf(baseURL)
  return h === 'localhost' || h === '::1' || /^127\./.test(h)
}

/** Key is present, or the endpoint is local. */
export function hasUsableKey(baseURL: string, apiKey: string | undefined): boolean {
  return Boolean(String(apiKey ?? '').trim()) || keyOptional(baseURL)
}

/** Authorization only when a key exists; local servers get none. */
export function aiAuthHeaders(apiKey: string | undefined): Record<string, string> {
  const k = String(apiKey ?? '').trim()
  return k ? { Authorization: `Bearer ${k}` } : {}
}

/** Which preset a saved provider came from, by base URL. */
export function matchPreset(baseURL: string): AiPreset | undefined {
  const norm = String(baseURL ?? '').trim().replace(/\/+$/, '').toLowerCase()
  return AI_PRESETS.find((p) => p.baseURL.toLowerCase() === norm)
}
