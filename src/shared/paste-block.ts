import { fenceSelection } from './ask-context'
import { redactAuditText } from './audit-log'

/** D94: a long paste into the AI composer becomes a collapsed, redacted block. */
export const PASTE_COLLAPSE_LINES = 12
export const PASTE_COLLAPSE_CHARS = 1500
export const PASTE_BLOCK_MAX = 8000

export type PasteBlock = { id: string; fenced: string; lines: number; chars: number; preview: string[]; redacted: boolean }

export function shouldCollapsePaste(text: string): boolean {
  const t = text.replace(/\r\n?/g, '\n')
  return t.split('\n').length >= PASTE_COLLAPSE_LINES || t.length >= PASTE_COLLAPSE_CHARS
}

export function buildPasteBlock(text: string, id: string): PasteBlock {
  const raw = text.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')
  const clean = redactAuditText(raw)
  const lines = raw.split('\n')
  return {
    id,
    fenced: fenceSelection(clean, PASTE_BLOCK_MAX),
    lines: lines.length,
    chars: raw.length,
    preview: clean.split('\n').slice(0, 3).map((l) => (l.length > 120 ? l.slice(0, 120) + '…' : l)),
    redacted: clean !== raw
  }
}

/** Text that is actually sent: typed question first, then each block. */
export function composeWithBlocks(typed: string, blocks: readonly PasteBlock[]): string {
  return [typed.trim(), ...blocks.map((b) => b.fenced)].filter(Boolean).join('\n\n')
}
