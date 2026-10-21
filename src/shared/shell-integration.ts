/**
 * D14: optional Shell Integration (bash / zsh). Opt-in, off by default.
 * One line is written into the interactive shell (leading space: skipped by history when HISTCONTROL has ignorespace).
 * It defines a prompt hook that prints OSC 133;D;<exit> and OSC 7 (cwd) before every prompt.
 * No files on the server are touched; closing the session removes it.
 * Shells other than bash/zsh (fish, sh, busybox, network gear) never answer → we fall back to the printf marker.
 */
export const SHELL_INT_KEY = 'aiss.shellIntegration'
export const SHELL_INT_TIMEOUT_MS = 5000
/** D107: renderer event: the injected line was just written to this session */
export const SI_GATE_EVENT = 'aiss-si-gate'

export function shellIntegrationEnabled(get: (k: string) => string | null): boolean {
  return get(SHELL_INT_KEY) === '1'
}

const HOOK = (hostVar: string) =>
  `__aiss_si(){ local e=$? h; h=$(fc -l -1 2>/dev/null | tr -d '\\000-\\037'); printf '\\033]133;E;%s\\007\\033]133;D;%s\\007\\033]7;file://%s%s\\007' "$h" "$e" "\${${hostVar}:-}" "$PWD"; return $e; }`

/** The single line written to the shell (no trailing newline). Idempotent: re-running does not stack hooks. */
export function shellIntegrationScript(): string {
  return (
    ' if [ -n "${ZSH_VERSION:-}" ]; then ' +
    HOOK('HOST') +
    '; autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd __aiss_si; ' +
    'elif [ -n "${BASH_VERSION:-}" ]; then ' +
    HOOK('HOSTNAME') +
    '; case ";${PROMPT_COMMAND:-};" in *";__aiss_si;"*) ;; *) PROMPT_COMMAND="__aiss_si${PROMPT_COMMAND:+;$PROMPT_COMMAND}";; esac; ' +
    // D107: drop this line from bash history even without HISTCONTROL=ignorespace
    'case "$(HISTTIMEFORMAT= builtin history 1 2>/dev/null)" in *__aiss_si*) builtin history -d "$(HISTTIMEFORMAT= builtin history 1 | sed \'s/^ *\\([0-9]*\\).*/\\1/\')" 2>/dev/null;; esac; fi; ' +
    // D107: end marker; the renderer hides everything (the tty echo of this line) up to here
    "printf '\\033]6973;aiss-si\\007'"
  )
}

/** D107: OSC printed when the injected line has run. The echoed source has the escaped text, never the real ESC. */
export const SI_DONE = '\x1b]6973;aiss-si\x07'

/**
 * D107: the tty echoes the injected line before the shell runs it. While a gate is on, output is held back;
 * at SI_DONE it is dropped and the old prompt line is cleared, so the shell's next prompt takes its place.
 * If SI_DONE never comes (fish, sh, network gear), flush() shows only the last line (the new prompt).
 */
export function createEchoGate(timeoutMs = SHELL_INT_TIMEOUT_MS) {
  let on = false
  let buf = ''
  let at = 0
  const flush = (): string => {
    if (!on) return ''
    on = false
    const tail = buf.slice(buf.lastIndexOf('\n') + 1)
    buf = ''
    return tail
  }
  return {
    start(now: number) {
      on = true
      buf = ''
      at = now
    },
    active: () => on,
    flush,
    feed(chunk: string, now: number): string {
      if (!on) return chunk
      buf += chunk
      const i = buf.indexOf(SI_DONE)
      if (i >= 0) {
        on = false
        const rest = buf.slice(i + SI_DONE.length)
        buf = ''
        return '\r\x1b[2K' + rest
      }
      if (now - at >= timeoutMs || buf.length > 65536) return flush()
      return ''
    }
  }
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

/** D22d: `133;E;<history line>` sent by the hook just before D, e.g. "  42  make build" (bash marks edited entries with *). */
export function parseOsc133E(data: string): { num: number; command: string } | null {
  const m = /^E;\s*(\d+)\*?\s+([\s\S]*)$/.exec(String(data ?? ''))
  if (!m) return null
  const command = m[2]!.trim()
  return command ? { num: Number(m[1]), command } : null
}

/** Bare Enter re-reports the previous history entry; only a new number is a new command. */
export function isNewTyped(prevNum: number | undefined, num: number): boolean {
  return prevNum !== num
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
