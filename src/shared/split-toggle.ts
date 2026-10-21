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
