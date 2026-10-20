/** D17: per-host block history (local only) + search. */
import type { TermBlock } from './terminal-blocks'

export const BLOCK_HIST_PREFIX = 'aiss.blocks.hist.v1:'
export const BLOCK_HIST_MAX = 30
export const BLOCK_HIST_OUTPUT_MAX = 8000

export type StoredBlock = { command: string; output: string; exitCode: number | null; at: number }

/** Finished blocks only, newest last, output tail capped. */
export function toStored(blocks: TermBlock[], now = Date.now(), max = BLOCK_HIST_MAX): StoredBlock[] {
  return blocks
    .filter((b) => !b.running && b.command.trim())
    .slice(-max)
    .map((b) => ({
      command: b.command,
      output: b.output.length > BLOCK_HIST_OUTPUT_MAX ? b.output.slice(-BLOCK_HIST_OUTPUT_MAX) : b.output,
      exitCode: b.exitCode,
      at: now
    }))
}

export function parseStored(raw: string | null): StoredBlock[] {
  try {
    const v = JSON.parse(raw ?? '[]')
    if (!Array.isArray(v)) return []
    return v
      .filter((x) => x && typeof x.command === 'string' && typeof x.output === 'string')
      .slice(-BLOCK_HIST_MAX)
      .map((x) => ({ command: x.command, output: x.output, exitCode: typeof x.exitCode === 'number' ? x.exitCode : null, at: Number(x.at) || 0 }))
  } catch {
    return []
  }
}

/** Restored blocks are collapsed and marked so the strip can dim them. */
export function fromStored(list: StoredBlock[]): (TermBlock & { restored: true })[] {
  return list.map((s, i) => ({
    id: `blk-r-${s.at}-${i}`,
    command: s.command,
    output: s.output,
    exitCode: s.exitCode,
    running: false,
    collapsed: true,
    large: false,
    restored: true
  }))
}

/** Merge restored history with this session's blocks for saving (history first, capped). */
export function mergeForSave(prev: StoredBlock[], live: StoredBlock[], max = BLOCK_HIST_MAX): StoredBlock[] {
  return [...prev, ...live].slice(-max)
}

/** Case-insensitive match on command or output. Empty query → all. Returns indexes. */
export function searchBlocks(blocks: Pick<TermBlock, 'command' | 'output'>[], query: string): number[] {
  const q = query.trim().toLowerCase()
  const out: number[] = []
  blocks.forEach((b, i) => {
    if (!q || b.command.toLowerCase().includes(q) || b.output.toLowerCase().includes(q)) out.push(i)
  })
  return out
}
