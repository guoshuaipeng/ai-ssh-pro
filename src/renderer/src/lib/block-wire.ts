/** D11: wire form for commands the app writes on the user's behalf (command bar, AI panel run). */
import { BLOCK_EXIT_PREF_KEY, blockExitEnabled, blockWire } from '@shared/block-exit'
import { blocksEnabled } from '@shared/terminal-blocks'
import { integrationState } from './shell-integration'

function get(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

export function blockExitOn(): boolean {
  return blockExitEnabled(get)
}

export function setBlockExitOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(BLOCK_EXIT_PREF_KEY)
    else localStorage.setItem(BLOCK_EXIT_PREF_KEY, '0')
  } catch {
    /* ignore */
  }
}

/**
 * Marked only while blocks are on and exit capture is on; otherwise the plain command.
 * D14: an active Shell Integration already reports $? (OSC 133;D), so no printf suffix / echo.
 */
export function commandWire(command: string, sessionId?: string): string {
  if (sessionId && integrationState(sessionId) === 'active') return command
  return blockWire(command, blocksEnabled() && blockExitOn())
}
