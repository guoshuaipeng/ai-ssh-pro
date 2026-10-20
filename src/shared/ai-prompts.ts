/** D95: user-defined AI starter prompts (prompt text only; stored locally). */
export const AI_PROMPTS_KEY = 'aiss.ai.prompts.v1'
export const AI_PROMPTS_MAX = 8
export const AI_PROMPT_MAX_LEN = 200

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function normalizePrompts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const x of raw) {
    if (typeof x !== 'string') continue
    const s = x.replace(/\s+/g, ' ').trim().slice(0, AI_PROMPT_MAX_LEN)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= AI_PROMPTS_MAX) break
  }
  return out
}

export function loadPrompts(store: Pick<Storage, 'getItem'> = globalThis.localStorage): string[] {
  try {
    return normalizePrompts(JSON.parse(store.getItem(AI_PROMPTS_KEY) || '[]'))
  } catch {
    return []
  }
}

export function savePrompts(list: readonly string[], store: Store = globalThis.localStorage): string[] {
  const n = normalizePrompts(list)
  try {
    store.setItem(AI_PROMPTS_KEY, JSON.stringify(n))
  } catch {
    /* quota */
  }
  return n
}

export type AddResult = { ok: true; list: string[] } | { ok: false; reason: 'empty' | 'dup' | 'full' }

export function addPrompt(list: readonly string[], text: string): AddResult {
  const s = text.replace(/\s+/g, ' ').trim().slice(0, AI_PROMPT_MAX_LEN)
  if (!s) return { ok: false, reason: 'empty' }
  if (list.includes(s)) return { ok: false, reason: 'dup' }
  if (list.length >= AI_PROMPTS_MAX) return { ok: false, reason: 'full' }
  return { ok: true, list: [...list, s] }
}
