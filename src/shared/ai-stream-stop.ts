/** H04/H05: pure helpers for mid-stream stop without DOM injection. */

export type StreamStopLine = {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

/** Finalize every streaming assistant row; if none and still busy, append a cancelled assistant line. */
export function finalizeStoppedLines<T extends StreamStopLine>(
  lines: T[],
  cancelledMessage: string,
  opts?: { ensureCancelledRow?: boolean }
): T[] {
  let changed = false
  const next = lines.map((row) => {
    if (row.role === 'assistant' && row.streaming) {
      changed = true
      const content = (row.content || '').trim() || cancelledMessage
      return { ...row, content, streaming: false }
    }
    return row
  })
  if (changed) return next
  if (!opts?.ensureCancelledRow) return lines
  const last = next[next.length - 1]
  // Already have a finalized assistant (partial or prior cancel) — double-stop is a no-op.
  if (last?.role === 'assistant' && !last.streaming) return lines
  return [...next, { role: 'assistant', content: cancelledMessage, streaming: false } as T]
}

/** Apply a delta chunk onto the live streaming assistant row (create one if needed). */
export function applyStreamDelta<T extends StreamStopLine>(lines: T[], chunk: string): T[] {
  const next = [...lines]
  const last = next[next.length - 1]
  if (last?.role === 'assistant' && last.streaming) {
    next[next.length - 1] = { ...last, content: (last.content || '') + chunk }
    return next
  }
  next.push({ role: 'assistant', content: chunk, streaming: true } as T)
  return next
}
