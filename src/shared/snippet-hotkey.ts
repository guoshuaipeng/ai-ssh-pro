/**
 * Per-snippet keyboard shortcuts. Canonical form matches keymap: Ctrl+Alt+2, Ctrl+Shift+Q, …
 * Must include Ctrl plus Alt or Shift (plain Ctrl+letter stays with the shell in a terminal).
 */
import { KEYMAP } from './keymap'
import type { CommandSnippet } from './ipc'

export const SNIPPET_HOTKEY_EVENT = 'aiss-snippets-changed'

type KeyLike = { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift'] as const

/** Normalize user / captured chord to Ctrl+Alt+2 style, or null if invalid. */
export function normalizeSnippetHotkey(raw: string): string | null {
  const parts = String(raw ?? '')
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return null
  const mods = new Set<string>()
  let key = ''
  for (const p of parts) {
    const u = p.length === 1 ? p.toUpperCase() : p
    if (/^ctrl$/i.test(p) || /^control$/i.test(p)) mods.add('Ctrl')
    else if (/^alt$/i.test(p) || /^option$/i.test(p)) mods.add('Alt')
    else if (/^shift$/i.test(p)) mods.add('Shift')
    else if (/^meta$/i.test(p) || /^cmd$/i.test(p) || /^win$/i.test(p)) return null
    else key = u.length === 1 ? u.toUpperCase() : u
  }
  if (!key || !mods.has('Ctrl')) return null
  if (!mods.has('Alt') && !mods.has('Shift')) return null
  // Digits / letters / F-keys / a few symbols
  if (!/^([A-Z0-9]|F[1-9]|F1[0-2]|Space|,)$/i.test(key) && key.length !== 1) return null
  if (key.length === 1) key = key.toUpperCase()
  const ordered = MOD_ORDER.filter((m) => mods.has(m))
  return [...ordered, key].join('+')
}

export function eventToHotkeyString(e: KeyLike): string | null {
  if (e.metaKey) return null
  if (!e.ctrlKey) return null
  if (!e.altKey && !e.shiftKey) return null
  let key = ''
  if (e.code && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (e.code && /^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  else if (e.code && /^F([1-9]|1[0-2])$/.test(e.code)) key = e.code
  else if (e.code === 'Space' || e.key === ' ') key = 'Space'
  else if (e.code === 'Comma') key = ','
  else if (e.key.length === 1) key = e.key.toUpperCase()
  else return null
  const parts: string[] = ['Ctrl']
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(key)
  return normalizeSnippetHotkey(parts.join('+'))
}

function parseCombo(keys: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = keys.split('+')
  const key = parts[parts.length - 1]!
  return { ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt'), key }
}

function eventKeyName(e: KeyLike): string {
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3)
  if (e.code && /^Digit[0-9]$/.test(e.code)) return e.code.slice(5)
  if (e.code && /^F([1-9]|1[0-2])$/.test(e.code)) return e.code
  if (e.code === 'Comma') return ','
  if (e.code === 'Space' || e.key === ' ') return 'Space'
  if (e.key.length === 1) return e.key.toUpperCase()
  return e.key
}

/** Reserved app chords (skip ellipsis display-only entries like Ctrl+1…9). */
export function keymapReservedHotkeys(): string[] {
  const out: string[] = []
  for (const k of KEYMAP) {
    if (k.keys.includes('…') || k.keys.includes('...')) continue
    const n = normalizeSnippetHotkey(k.keys)
    if (n) out.push(n)
    // Also keep raw for F1 / Ctrl+, style that normalize may reject
    out.push(k.keys)
  }
  return out
}

export function snippetHotkeyConflictsKeymap(hotkey: string): string | null {
  const n = normalizeSnippetHotkey(hotkey)
  if (!n) return null
  for (const k of KEYMAP) {
    if (k.keys.includes('…') || k.keys.includes('...')) continue
    const kn = normalizeSnippetHotkey(k.keys) || k.keys
    if (kn === n || k.keys === n) return k.id
  }
  return null
}

export function snippetHotkeyConflictsPeer(
  hotkey: string,
  snippets: ReadonlyArray<Pick<CommandSnippet, 'id' | 'title' | 'hotkey'>>,
  excludeId?: string | null
): { id: string; title: string } | null {
  const n = normalizeSnippetHotkey(hotkey)
  if (!n) return null
  for (const s of snippets) {
    if (!s.hotkey || s.id === excludeId) continue
    if (normalizeSnippetHotkey(s.hotkey) === n) return { id: s.id, title: s.title }
  }
  return null
}

export function matchSnippetHotkey(
  e: KeyLike,
  snippets: ReadonlyArray<Pick<CommandSnippet, 'id' | 'title' | 'body' | 'hotkey'>>
): CommandSnippet | undefined {
  if (e.metaKey || !e.ctrlKey) return undefined
  if (!e.altKey && !e.shiftKey) return undefined
  const name = eventKeyName(e)
  for (const s of snippets) {
    if (!s.hotkey) continue
    const n = normalizeSnippetHotkey(s.hotkey)
    if (!n) continue
    const c = parseCombo(n)
    if (c.ctrl !== e.ctrlKey || c.shift !== e.shiftKey || c.alt !== e.altKey) continue
    if (c.key.toUpperCase() !== name.toUpperCase()) continue
    return { id: s.id, title: s.title, body: s.body, hotkey: s.hotkey }
  }
  return undefined
}

/** Suggest Ctrl+Alt+2..9 then Ctrl+Shift+2..9 skipping reserved + taken. */
export function suggestSnippetHotkey(
  snippets: ReadonlyArray<Pick<CommandSnippet, 'id' | 'hotkey'>>,
  excludeId?: string | null
): string | null {
  const taken = new Set<string>()
  for (const k of keymapReservedHotkeys()) {
    const n = normalizeSnippetHotkey(k)
    if (n) taken.add(n)
  }
  for (const s of snippets) {
    if (!s.hotkey || s.id === excludeId) continue
    const n = normalizeSnippetHotkey(s.hotkey)
    if (n) taken.add(n)
  }
  for (const mod of ['Ctrl+Alt+', 'Ctrl+Shift+'] as const) {
    for (let d = 2; d <= 9; d++) {
      const cand = mod + d
      if (!taken.has(cand)) return cand
    }
  }
  return null
}

export function notifySnippetsChanged(): void {
  const g = globalThis as { dispatchEvent?: (e: Event) => boolean; CustomEvent?: typeof CustomEvent }
  if (typeof g.dispatchEvent !== 'function' || typeof g.CustomEvent !== 'function') return
  g.dispatchEvent(new g.CustomEvent(SNIPPET_HOTKEY_EVENT))
}
