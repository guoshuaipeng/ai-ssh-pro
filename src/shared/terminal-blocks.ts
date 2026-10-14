/** L5 output blocks. Default off. Turning them off does not discard terminal scrollback. */

export const BLOCKS_LS_KEY = 'aiss.blocks.enabled'
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
}

export function blocksEnabled(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  return store.getItem(BLOCKS_LS_KEY) === '1'
}

export function setBlocksEnabled(on: boolean, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  store.setItem(BLOCKS_LS_KEY, on ? '1' : '0')
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
