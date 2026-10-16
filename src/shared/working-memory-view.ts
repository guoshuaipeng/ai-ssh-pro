/** One-line working-memory label. Blank goals render nothing. */
export function visibleWorkingGoal(goal: string | null | undefined): string | null {
  const text = (goal ?? '').replace(/\s+/g, ' ').trim()
  return text || null
}
