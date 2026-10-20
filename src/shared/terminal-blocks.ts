/** L5 output blocks. Default off. Turning them off does not discard terminal scrollback. */

export const BLOCKS_LS_KEY = 'aiss.blocks.enabled'
export const BLOCKS_HEIGHT_KEY = 'aiss.blocks.height'
export const BLOCKS_COLLAPSED_KEY = 'aiss.blocks.collapsed'
export const BLOCK_HEIGHT_DEFAULT = 0.25
export const BLOCK_HEIGHT_MIN = 0.15
export const BLOCK_HEIGHT_MAX = 0.5
export const BLOCK_HEIGHT_FLOOR_PX = 72
export const BLOCKS_DEFAULT_ON = false
export const LARGE_CHARS = 2_000_000
export const LARGE_LINES = 20_000

export type TermBlock = {
  id: string
  command: string
  output: string
  exitCode: number | null
  running: boolean
  collapsed: boolean
  large: boolean
  /** D20: the connection dropped while it was running */
  interrupted?: boolean
}

/** D20: after a reconnect nothing is running any more; keep the blocks, mark the open one interrupted. */
export function interruptRunning<T extends TermBlock>(blocks: T[]): T[] {
  if (!blocks.some((b) => b.running)) return blocks
  return blocks.map((b) => (b.running ? { ...b, running: false, interrupted: true } : b))
}

export function blocksEnabled(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  return store.getItem(BLOCKS_LS_KEY) === '1'
}

export function setBlocksEnabled(on: boolean, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  store.setItem(BLOCKS_LS_KEY, on ? '1' : '0')
}

export function clampBlockRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return BLOCK_HEIGHT_DEFAULT
  return Math.min(BLOCK_HEIGHT_MAX, Math.max(BLOCK_HEIGHT_MIN, ratio))
}

export function loadBlockRatio(store: Pick<Storage, 'getItem'> = globalThis.localStorage): number {
  const n = Number(store.getItem(BLOCKS_HEIGHT_KEY))
  return clampBlockRatio(Number.isFinite(n) && n > 0 ? n : BLOCK_HEIGHT_DEFAULT)
}

export function saveBlockRatio(ratio: number, store: Pick<Storage, 'setItem'> = globalThis.localStorage): number {
  const next = clampBlockRatio(ratio)
  store.setItem(BLOCKS_HEIGHT_KEY, String(next))
  return next
}

/** Pixel height of the strip. Below the floor the strip snaps closed. */
export function blockStripPx(terminalPx: number, ratio: number): { px: number; collapsed: boolean } {
  const px = Math.round(Math.max(0, terminalPx) * clampBlockRatio(ratio))
  if (px < BLOCK_HEIGHT_FLOOR_PX) return { px: 24, collapsed: true }
  return { px, collapsed: false }
}

/** Closing blocks keeps the xterm scrollback. Callers must not clear the terminal. */
export function disableBlocksKeepsScrollback(): { scrollbackKept: true } {
  return { scrollbackKept: true }
}

function isLarge(output: string): boolean {
  if (output.length > LARGE_CHARS) return true
  let lines = 1
  for (let i = 0; i < output.length; i++) if (output.charCodeAt(i) === 10) lines += 1
  return lines > LARGE_LINES
}

export function startBlock(blocks: TermBlock[], command: string, now = Date.now()): TermBlock[] {
  const finished = blocks.map((b) => (b.running ? { ...b, running: false, exitCode: b.exitCode } : b))
  return [
    ...finished,
    { id: `blk-${now}-${finished.length}`, command, output: '', exitCode: null, running: true, collapsed: false, large: false }
  ]
}

export function appendBlockOutput(blocks: TermBlock[], text: string): TermBlock[] {
  if (!blocks.length || !text) return blocks
  const next = blocks.slice()
  const last = { ...next[next.length - 1]! }
  if (!last.running && last.exitCode != null) return blocks
  last.output += text
  last.large = isLarge(last.output)
  if (last.large) last.collapsed = true
  next[next.length - 1] = last
  return next
}

export function finishBlock(blocks: TermBlock[], code: number | null): TermBlock[] {
  if (!blocks.length) return blocks
  const next = blocks.slice()
  const last = { ...next[next.length - 1]! }
  last.running = false
  last.exitCode = code
  next[next.length - 1] = last
  return next
}

export function toggleBlock(blocks: TermBlock[], id: string): TermBlock[] {
  return blocks.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b))
}

export function snippetFromBlock(block: TermBlock, includeOutput = false): { title: string; body: string } {
  const title = block.command.trim().split('\n')[0]?.slice(0, 48) || 'block'
  return { title, body: includeOutput ? `${block.command}\n${block.output}`.trim() : block.command }
}

/** Insert a command snippet, or replace the one with the same title. Same body returns the same list. */
export function upsertCommandSnippet<T extends { id: string; title: string; body: string }>(
  list: T[],
  snippet: { title: string; body: string },
  newId: string
): T[] {
  const title = snippet.title.trim() || 'block'
  const body = snippet.body
  const idx = list.findIndex((s) => s.title === title)
  if (idx < 0) return [...list, { id: newId, title, body } as T]
  const cur = list[idx]!
  if (cur.body === body) return list
  const next = list.slice()
  next[idx] = { ...cur, title, body }
  return next
}
