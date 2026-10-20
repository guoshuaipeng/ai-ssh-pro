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

export type ScriptRun = { sessionId: string; steps: string[]; index: number; awaiting?: boolean; paused?: { code: number } }

/** After the current step was submitted, the next state (null = finished). Other commands do not advance. */
export function advanceScript(run: ScriptRun, submitted: string, waitExit = false): ScriptRun | null | 'same' {
  if (run.awaiting || run.paused) return 'same'
  if (submitted.trim() !== run.steps[run.index]?.trim()) return 'same'
  // D16c: when the exit code can be observed, wait for it before filling the next line
  if (waitExit) return { ...run, awaiting: true }
  const next = run.index + 1
  return next >= run.steps.length ? null : { ...run, index: next }
}

export type ExitOutcome = { run: ScriptRun | null; event: 'next' | 'done' | 'paused' | 'ignored' }

/** D16c: exit code of the awaited step. Non-zero pauses (nothing further is filled); zero moves on. */
export function afterExit(run: ScriptRun, code: number): ExitOutcome {
  if (!run.awaiting) return { run, event: 'ignored' }
  if (code !== 0) return { run: { ...run, awaiting: false, paused: { code } }, event: 'paused' }
  return skipStep({ ...run, awaiting: false })
}

/** D16c: continue after a pause (skip the failed line) or after a successful one. */
export function skipStep(run: ScriptRun): ExitOutcome {
  const next = run.index + 1
  if (next >= run.steps.length) return { run: null, event: 'done' }
  return { run: { sessionId: run.sessionId, steps: run.steps, index: next }, event: 'next' }
}
