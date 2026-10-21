/** PB2: reorder playbook steps (drag handle / keyboard). Returns a new array; out-of-range is a no-op. */
export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  const list = steps.slice()
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item as T)
  return list
}
