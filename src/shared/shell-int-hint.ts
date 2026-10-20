/** D27: one-time hint to turn on Shell Integration (exit codes / cwd / failure capture depend on it). */
export const SI_HINT_KEY = 'aiss.shellInt.hintShown'

export function shouldHintShellInt(o: {
  enabled: boolean
  shown: boolean
  kind: 'ssh' | 'local' | undefined
  demo: boolean
  level: 'normal' | 'production' | 'readonly'
}): boolean {
  // never nudge on protected hosts: the hook writes one line into the shell; users can still enable it in the Session menu
  return !o.enabled && !o.shown && !o.demo && o.kind !== 'local' && o.level === 'normal'
}
