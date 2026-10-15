/** Shared {{name}} parser for playbooks and command snippets (W2 / UX-28). */

export const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
export const BUILTIN_VARS = ['host', 'user'] as const

const VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

export function isValidVarName(name: string): boolean {
  return VAR_NAME.test(name)
}

export function isBuiltinVar(name: string): boolean {
  return name === 'host' || name === 'user'
}

/** Unique placeholder names in first-seen order. Invalid tokens are ignored. */
export function extractVarNames(body: string, limit = 32): string[] {
  const out: string[] = []
  for (const m of String(body ?? '').matchAll(VAR_RE)) {
    const name = m[1]!
    if (!out.includes(name)) out.push(name)
  }
  return out.slice(0, limit)
}

/** Single-quote a shell word. `a b'c` → `'a b'\''c'`. */
export function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

const SPECIAL = /[;|&$`\n]/

export type ExpandVar = { name: string; quote?: boolean; sensitive?: boolean; required?: boolean }

export type ExpandResult = {
  /** What would be sent. Missing placeholders stay as {{name}}. */
  text: string
  /** Display form. Sensitive values are ••••. */
  display: string
  missing: string[]
  unquotedSpecial: boolean
  multilineNoQuote: boolean
}

export function expandTemplate(
  command: string,
  values: Record<string, string>,
  vars: ExpandVar[] = [],
  builtins?: { host?: string; user?: string }
): ExpandResult {
  const meta = new Map(vars.map((v) => [v.name, v]))
  const missing: string[] = []
  let unquotedSpecial = false
  let multilineNoQuote = false
  const fill = (mask: boolean) =>
    String(command ?? '').replace(VAR_RE, (whole, name: string) => {
      if (name === 'host' && builtins) return builtins.host ?? ''
      if (name === 'user' && builtins) return builtins.user ?? ''
      if (!Object.prototype.hasOwnProperty.call(values, name) || values[name] == null || values[name] === '') {
        if (!missing.includes(name)) missing.push(name)
        return whole
      }
      const spec = meta.get(name)
      const raw = values[name] ?? ''
      if (mask && spec?.sensitive) return '••••'
      const quote = spec?.quote !== false && !isBuiltinVar(name)
      if (!quote && raw.includes('\n')) multilineNoQuote = true
      if (!quote && SPECIAL.test(raw)) unquotedSpecial = true
      return quote ? shellQuote(raw) : raw
    })
  return { text: fill(false), display: fill(true), missing, unquotedSpecial, multilineNoQuote }
}
