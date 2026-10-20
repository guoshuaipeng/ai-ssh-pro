/**
 * D14: optional Shell Integration (bash / zsh). Opt-in, off by default.
 * One line is written into the interactive shell (leading space: skipped by history when HISTCONTROL has ignorespace).
 * It defines a prompt hook that prints OSC 133;D;<exit> and OSC 7 (cwd) before every prompt.
 * No files on the server are touched; closing the session removes it.
 * Shells other than bash/zsh (fish, sh, busybox, network gear) never answer → we fall back to the printf marker.
 */
export const SHELL_INT_KEY = 'aiss.shellIntegration'
export const SHELL_INT_TIMEOUT_MS = 5000

export function shellIntegrationEnabled(get: (k: string) => string | null): boolean {
  return get(SHELL_INT_KEY) === '1'
}

const HOOK = (hostVar: string) =>
  `__aiss_si(){ local e=$?; printf '\\033]133;D;%s\\007\\033]7;file://%s%s\\007' "$e" "\${${hostVar}:-}" "$PWD"; return $e; }`

/** The single line written to the shell (no trailing newline). Idempotent: re-running does not stack hooks. */
export function shellIntegrationScript(): string {
  return (
    ' if [ -n "${ZSH_VERSION:-}" ]; then ' +
    HOOK('HOST') +
    '; autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd __aiss_si; ' +
    'elif [ -n "${BASH_VERSION:-}" ]; then ' +
    HOOK('HOSTNAME') +
    '; case ";${PROMPT_COMMAND:-};" in *";__aiss_si;"*) ;; *) PROMPT_COMMAND="__aiss_si${PROMPT_COMMAND:+;$PROMPT_COMMAND}";; esac; fi'
  )
}

export type Osc133 = { kind: 'A' | 'B' | 'C' | 'D'; code: number | null }

/** Payload after `133;` as handed over by xterm's OSC handler, e.g. "D;1", "A". */
export function parseOsc133(data: string): Osc133 | null {
  const m = /^([ABCD])(?:;(-?\d{1,3}))?(?:;.*)?$/.exec(String(data ?? ''))
  if (!m) return null
  const kind = m[1] as Osc133['kind']
  const code = m[2] != null ? Number(m[2]) : null
  return { kind, code: kind === 'D' ? code : null }
}

export type IntegrationState = 'off' | 'pending' | 'active' | 'unsupported'

export function integrationVerdict(sentAt: number | null, seen: boolean, now: number, timeoutMs = SHELL_INT_TIMEOUT_MS): IntegrationState {
  if (seen) return 'active'
  if (sentAt == null) return 'off'
  return now - sentAt >= timeoutMs ? 'unsupported' : 'pending'
}

/** Inject only into a live, writable, primary-screen terminal. */
export function canInject(o: { enabled: boolean; inputBlocked: boolean; mirrorOnly: boolean; alternate: boolean; already: boolean; idle: boolean }): boolean {
  return o.enabled && !o.inputBlocked && !o.mirrorOnly && !o.alternate && !o.already && o.idle
}

/** The cursor sits right after a prompt with nothing typed, so the injected line cannot mix with user input. */
export function atIdlePrompt(lineBeforeCursor: string): boolean {
  return /[$#%>❯]\s?$/.test(lineBeforeCursor) && lineBeforeCursor.trim().length > 1
}
