/** Formal product name. About, the title bar, and the tray/taskbar hover share this string. */
export const PRODUCT_NAME = 'AI-SSH-Pro'

const DEBUG_PATH = /[\\/]|file:|\.html?\b|\.tsx?\b|\.jsx?\b|node_modules|\b(?:src|out|dist)\b|localhost|:\d{2,5}/

/** TR-1: hover name for the tray and the taskbar. Never a debug path. */
export function trayHoverTitle(): string {
  if (DEBUG_PATH.test(PRODUCT_NAME)) {
    throw new Error('tray title must be the formal product name')
  }
  return PRODUCT_NAME
}
