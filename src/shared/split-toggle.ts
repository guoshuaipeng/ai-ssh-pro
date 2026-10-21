/**
 * Split / broadcast toggle decision. App keeps the live value in a ref and calls this from a
 * memoised menu handler, so the decision never depends on a stale closure (bug: second click
 * read the old `false` and "turned it on" again, so the button looked dead).
 */
export type ToggleOutcome = { next: boolean; toast: 'on' | 'off' | 'needTwo' }

export function decideSplitToggle(on: boolean, liveSessions: number): ToggleOutcome {
  if (on) return { next: false, toast: 'off' }
  if (liveSessions < 2) return { next: false, toast: 'needTwo' }
  return { next: true, toast: 'on' }
}

/** Latest-value box: write on every render and synchronously on every toggle (rapid clicks). */
export type LiveFlag = { current: boolean }

export function applySplitToggle(flag: LiveFlag, liveSessions: number): ToggleOutcome {
  const r = decideSplitToggle(flag.current, liveSessions)
  flag.current = r.next
  return r
}

/** S41b: the tab-bar split popover picks one of three modes. */
export type SplitOrientation = 'horizontal' | 'vertical'
export type SplitMode = 'off' | SplitOrientation
export type ModeOutcome = { enabled: boolean; orientation: SplitOrientation; toast: 'on' | 'off' | 'needTwo' | 'orient' | 'noop' }

export function splitModeOf(enabled: boolean, orientation: SplitOrientation): SplitMode {
  return enabled ? orientation : 'off'
}

/** Decide from the live boxes (never from memoised state); writes them synchronously for rapid picks. */
export function applySplitMode(flag: LiveFlag, orient: { current: SplitOrientation }, liveSessions: number, target: SplitMode): ModeOutcome {
  const on = flag.current
  if (target === 'off') {
    flag.current = false
    return { enabled: false, orientation: orient.current, toast: on ? 'off' : 'noop' }
  }
  if (!on) {
    if (liveSessions < 2) return { enabled: false, orientation: orient.current, toast: 'needTwo' }
    flag.current = true
    orient.current = target
    return { enabled: true, orientation: target, toast: 'on' }
  }
  if (orient.current === target) return { enabled: true, orientation: target, toast: 'noop' }
  orient.current = target
  return { enabled: true, orientation: target, toast: 'orient' }
}
