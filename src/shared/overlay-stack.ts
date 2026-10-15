/** PNG-1: at most one product overlay. What's New, then welcome, then optional G2. */

export type ProductOverlay = 'releaseNotes' | 'welcome' | 'tour' | 'quickStart' | 'tasks'

/** Menus, palette, and context menus sit above the product stack. Esc closes them first. */
export const HIGHER_CHROME_SELECTOR =
  '.titlebar-menu.is-open, .titlebar-popover, .session-context-menu, .ctx-menu, .tab-overflow-menu, .cmdp-backdrop'

export function isHigherChromeOpen(root: { querySelector: (selector: string) => unknown }): boolean {
  return Boolean(root.querySelector(HIGHER_CHROME_SELECTOR))
}

export function pickProductOverlay(input: {
  releaseNotes: boolean
  welcome: boolean
  tour: boolean
  /** Help → tour (or an explicit replay) yields the welcome card. */
  tourExplicit: boolean
  quickStart: boolean
  /** Help → quick start yields the welcome card. */
  quickExplicit: boolean
  tasks: boolean
}): ProductOverlay | null {
  if (input.releaseNotes) return 'releaseNotes'
  if (input.welcome && !input.tourExplicit && !input.quickExplicit) return 'welcome'
  if (input.tour) return 'tour'
  if (input.quickStart) return 'quickStart'
  if (input.tasks) return 'tasks'
  return null
}

/**
 * Esc closes only the topmost product overlay.
 * A menu, palette, or a dialog stacked above it stays in front.
 */
export function escProductTarget(input: {
  product: ProductOverlay | null
  higherChrome: boolean
  /** `.modal-backdrop` nodes currently in the document. */
  modalBackdrops: number
}): ProductOverlay | null {
  if (!input.product || input.higherChrome) return null
  const ownModal = input.product === 'releaseNotes' ? 1 : 0
  if (input.modalBackdrops > ownModal) return null
  return input.product
}

/** After the welcome card is actually seen and a host exists, G2 may follow. Never at the same time. */
export function shouldOfferTourAfterWelcome(input: {
  welcomeWasVisible: boolean
  completedNow: boolean
  tourDone: boolean
  replay: boolean
}): boolean {
  return input.welcomeWasVisible && input.completedNow && !input.tourDone && !input.replay
}
