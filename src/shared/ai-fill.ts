/** D16: AI answer → command bar → result back to the same AI conversation. */
const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console', 'shellsession', 'terminal'])

/** The one command a code block holds, or null (multi-line scripts, other languages, empty). Strips a leading `$ ` prompt. */
export function fillableCommand(code: string, lang: string): string | null {
  if (!SHELL_LANGS.has(String(lang ?? '').trim().toLowerCase())) return null
  const lines = String(code ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  if (lines.length !== 1) return null
  const one = lines[0]!.replace(/^\$\s+/, '')
  if (!one || /\\$/.test(one) || /<</.test(one)) return null
  return one
}

const key = (sessionId: string, command: string) => `${sessionId}\n${command.trim()}`

/** Commands filled from an AI answer, so their blocks offer "send result to AI". */
export function createOriginSet(max = 100) {
  const set = new Set<string>()
  return {
    mark(sessionId: string, command: string) {
      const k = key(sessionId, command)
      set.delete(k)
      set.add(k)
      if (set.size > max) set.delete(set.values().next().value as string)
    },
    has(sessionId: string, command: string) {
      return set.has(key(sessionId, command))
    }
  }
}
