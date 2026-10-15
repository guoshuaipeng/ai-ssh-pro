/** Active terminal publishes its current selection so Ctrl+K can read it. */

type SelectionReader = () => { sessionId: string; text: string }

let reader: SelectionReader | null = null

export function registerTerminalSelection(fn: SelectionReader): () => void {
  reader = fn
  return () => {
    if (reader === fn) reader = null
  }
}

export function currentTerminalSelection(): { sessionId: string; text: string } | null {
  return reader ? reader() : null
}
