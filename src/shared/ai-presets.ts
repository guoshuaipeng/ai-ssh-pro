/**
 * B2: provider presets. Every base URL below is copied from the provider's own docs
 * (checked 2026-10-23, see docsUrl). Model ids are the examples those pages use; users can edit them.
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
  },
  {
    id: 'siliconflow',
    name: { zh: '硅基流动 · SiliconFlow', en: 'SiliconFlow' },
    baseURL: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-7B-Instruct'],
    keyRequired: true,
    docsUrl: 'https://docs.siliconflow.cn/cn/userguide/quickstart',
    note: {
      zh: '小模型常有 Free 额度，具体以控制台为准。',
      en: 'Small models are often Free; check the console for the current list.'
    }
  },
  {
    id: 'modelscope',
    name: { zh: '魔搭 · ModelScope', en: 'ModelScope' },
    baseURL: 'https://api-inference.modelscope.cn/v1',
    models: ['Qwen/Qwen3.8-Flash-Next', 'deepseek-ai/DeepSeek-V4.1-Flash'],
    keyRequired: true,
    docsUrl: 'https://modelscope.cn/docs/model-service/API-Inference/intro',
    note: {
      zh: '使用 Access Token；可能需阿里云实名；有每日免费额度。',
      en: 'Uses an Access Token; Alibaba Cloud real-name may be required; daily free quota applies.'
    }
  },
  {
    id: 'lmstudio',
    name: { zh: 'LM Studio（本机）', en: 'LM Studio (local)' },
    baseURL: 'http://localhost:1234/v1',
    models: ['openai/gpt-oss-20b'],
    keyRequired: false,
    docsUrl: 'https://lmstudio.ai/docs/developer/openai-compat',
    note: {
      zh: '无需 API Key。模型名以 LM Studio 已加载的为准。',
      en: 'No API key needed. Use the model id currently loaded in LM Studio.'
    }
  },
  {
    id: 'openrouter',
    name: { zh: 'OpenRouter', en: 'OpenRouter' },
    baseURL: 'https://openrouter.ai/api/v1',
    models: ['openrouter/free', 'meta-llama/llama-3.2-3b-instruct:free'],
    keyRequired: true,
    docsUrl: 'https://openrouter.ai/docs/quickstart',
    note: {
      zh: ':free 模型列表会变；国内访问可能需要额外网络条件。',
      en: 'The :free model list changes; access from mainland China may need extra network setup.'
    }
  },
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

export type AiProviderLite = {
  id: string
  name: string
  baseURL: string
  apiKey: string
  modelList: string[]
}

export type ApplyPresetHint =
  | 'filled-need-key'
  | 'filled-keyless'
  | 'switched-need-key'
  | 'switched-keyless'
  | 'switched-has-key'

export type ApplyPresetPlan =
  | { action: 'switch'; providerId: string; hint: ApplyPresetHint }
  | { action: 'fill'; providerId: string; provider: AiProviderLite; hint: ApplyPresetHint }
  | { action: 'create'; provider: AiProviderLite; providers: AiProviderLite[]; hint: ApplyPresetHint }

function normBase(baseURL: string): string {
  return String(baseURL ?? '').trim().replace(/\/+$/, '').toLowerCase()
}

/** Cloud vs local grouping for the settings chip grid. */
export function presetGroup(preset: AiPreset): 'cloud' | 'local' {
  return keyOptional(preset.baseURL) ? 'local' : 'cloud'
}

/**
 * Decide how a chip click updates providers.
 * Same Base URL → switch (keep Key). Blank / unkeyed preset slot → fill.
 * Otherwise → create a new provider (B2: do not silently overwrite a keyed provider).
 */
export function planApplyPreset(args: {
  providers: AiProviderLite[]
  activeProviderId: string
  preset: AiPreset
  localeName: string
  newId: string
}): ApplyPresetPlan {
  const { providers, activeProviderId, preset, localeName, newId } = args
  const models = [...preset.models]
  const target = normBase(preset.baseURL)
  const existing = providers.find((p) => normBase(p.baseURL) === target)
  const keyless = !preset.keyRequired

  if (existing) {
    const hasKey = Boolean(String(existing.apiKey ?? '').trim())
    const hint: ApplyPresetHint = keyless
      ? 'switched-keyless'
      : hasKey
        ? 'switched-has-key'
        : 'switched-need-key'
    return { action: 'switch', providerId: existing.id, hint }
  }

  const draft: AiProviderLite = {
    id: newId,
    name: localeName,
    baseURL: preset.baseURL,
    apiKey: '',
    modelList: models
  }
  const hint: ApplyPresetHint = keyless ? 'filled-keyless' : 'filled-need-key'
  const active = providers.find((p) => p.id === activeProviderId)
  const canReuse =
    providers.length === 0 ||
    !activeProviderId ||
    Boolean(
      active &&
        !String(active.apiKey ?? '').trim() &&
        (!String(active.baseURL ?? '').trim() || Boolean(matchPreset(active.baseURL)))
    )

  if (canReuse && active) {
    const provider = { ...draft, id: active.id }
    return { action: 'fill', providerId: active.id, provider, hint }
  }

  const provider = draft
  const next = providers.length === 0 ? [provider] : [...providers, provider]
  return { action: 'create', provider, providers: next, hint }
}

export function matchPreset(baseURL: string): AiPreset | undefined {
  const norm = String(baseURL ?? '').trim().replace(/\/+$/, '').toLowerCase()
  return AI_PRESETS.find((p) => p.baseURL.toLowerCase() === norm)
}
