/** D16b: an AI multi-line answer filled into the command bar one line at a time. */
const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console', 'shellsession', 'terminal'])

/** 2–20 independent lines, or null (heredoc / continuation / other languages / single line). */
export function scriptSteps(code: string, lang: string): string[] | null {
  if (!SHELL_LANGS.has(String(lang ?? '').trim().toLowerCase())) return null
  const raw = String(code ?? '').replace(/\r\n?/g, '\n')
  if (/<</.test(raw)) return null
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/^\$\s+/, ''))
  if (lines.length < 2 || lines.length > 20) return null
  if (lines.some((l) => /\\$/.test(l) || /(&&|\|\||\|)$/.test(l) || /^(do|done|then|fi|else|elif|esac|\}|\{)$/.test(l) || /^(for|while|if|case)\b/.test(l))) return null
  return lines
}

export type ScriptRun = { sessionId: string; steps: string[]; index: number }

/** After the current step was submitted, the next state (null = finished). Other commands do not advance. */
export function advanceScript(run: ScriptRun, submitted: string): ScriptRun | null | 'same' {
  if (submitted.trim() !== run.steps[run.index]?.trim()) return 'same'
  const next = run.index + 1
  return next >= run.steps.length ? null : { ...run, index: next }
}
