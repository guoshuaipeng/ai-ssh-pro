/** D60: open terminals register a reader for their buffer so one search can cover every tab (memory only). */
const readers = new Map<string, () => string[]>()

export const SEARCH_ALL_TERMS_EVENT = 'aiss-search-all-terms'

export function registerTermBuffer(sessionId: string, read: () => string[]): () => void {
  readers.set(sessionId, read)
  return () => {
    if (readers.get(sessionId) === read) readers.delete(sessionId)
  }
}

export function readTermBuffers(): { sessionId: string; lines: string[] }[] {
  const out: { sessionId: string; lines: string[] }[] = []
  for (const [sessionId, read] of readers) {
    try {
      out.push({ sessionId, lines: read() })
    } catch {
      /* pane gone */
    }
  }
  return out
}
