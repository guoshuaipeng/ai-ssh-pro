/** Quit policy: last window close exits on Windows/Linux; macOS keeps the app. */

/** Force-exit if Electron helpers hang after cleanup. */
export const FORCE_EXIT_MS = 2500

/** Non-darwin: closing the last window should quit (no idle keep-alive). */
export function shouldQuitOnAllWindowsClosed(platform: NodeJS.Platform | string): boolean {
  return platform !== 'darwin'
}
