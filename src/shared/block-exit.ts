/**
 * D11: exit codes on command blocks.
 * Command-bar / AI-panel commands get the B1 printf marker when blocks are on and the pref allows it;
 * the renderer parses the (xterm-invisible) OSC 777 marker and finishes the running block with $?.
 * Commands typed straight into the shell carry no marker, so their blocks show no code.
 */
import { ExitMarkerParser, newExitNonce, stripEchoedMarker, wrapWithExitMarker, type ExitHit } from './exit-marker'
import { finishBlock, type TermBlock } from './terminal-blocks'

export const BLOCK_EXIT_PREF_KEY = 'aiss.blocks.exitCode'

/** Default on (blocks are already opt-in); stored only when turned off. */
export function blockExitEnabled(get: (k: string) => string | null): boolean {
  return get(BLOCK_EXIT_PREF_KEY) !== '0'
}

/** Wire form of a command written from the command bar; plain command when not capturing or not eligible. */
export function blockWire(command: string, capture: boolean, nonce = newExitNonce()): string {
  if (!capture) return command
  const { wire, marked } = wrapWithExitMarker(command, nonce)
  return marked ? wire : command
}

/** Finish the running block with the first exit hit. Extra hits (no running block) are ignored. */
export function applyExitHits(blocks: TermBlock[], hits: ExitHit[]): TermBlock[] {
  let next = blocks
  for (const h of hits) {
    const last = next[next.length - 1]
    if (!last || !last.running) continue
    next = finishBlock(next, h.code)
  }
  return next
}

export function createBlockExitParser(): { feed: (text: string) => { clean: string; hits: ExitHit[] } } {
  const p = new ExitMarkerParser()
  return {
    feed(text: string) {
      const { clean, exits } = p.feed(text)
      return { clean: stripEchoedMarker(clean), hits: exits }
    }
  }
}

export function blockFailed(b: Pick<TermBlock, 'exitCode' | 'running'>): boolean {
  return !b.running && b.exitCode != null && b.exitCode !== 0
}

/** Context (command + output tail) for the AI composer; the question goes after the fence and the user still presses send. */
export function failedBlockContext(b: Pick<TermBlock, 'command' | 'output'>, max = 4000): string {
  const out = b.output.length > max ? b.output.slice(-max) : b.output
  return `$ ${b.command}\n${out.trimEnd()}`
}
