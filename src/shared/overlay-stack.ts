/**
 * PNG-1: one product overlay at a time.
 *
 * Visible order (first match wins):
 *   1. system update (V2)
 *   2. changelog / What's New (V3)
 *   3. welcome (PF-1)
 *   4. optional G2 guided tour — never on screen with welcome
 *   5. quick start
 *   6. getting-started task cards — never on top of welcome
 *
 * A second request does not open another dimmer. A higher-priority request
 * takes the visible slot and the current one waits. A lower-priority request
 * waits. The same overlay again is refused. Help → tour may take the slot
 * from welcome, and Help → 重新欢迎 may take it back; the other one waits.
 *
 * Esc closes only the visible product layer, and only when a menu, the
 * command palette, or a dialog is not already in front. Focus returns to the
 * surface that was active before the product layer opened (a terminal goes
 * through the session API). It is not moved onto the empty-state
 * New connection control.
 *
 * A cold start that already has hosts does not force welcome. That rule
 * stays in `shouldShowWelcome` (`hostCount > 0` without Help replay).
 */

export const PRODUCT_OVERLAY_ORDER = ['systemUpdate', 'releaseNotes', 'welcome', 'tour', 'quickStart', 'tasks'] as const

export type ProductOverlay = (typeof PRODUCT_OVERLAY_ORDER)[number]

/**
 * P11-1: the product moments a person actually meets, in order.
 * What's New, then Welcome, then the optional tour. A system-update dialog
 * still outranks them. Only one of these is visible at a time.
 */
export const PRODUCT_MOMENT_ORDER = ['releaseNotes', 'welcome', 'tour'] as const

export type ProductMoment = (typeof PRODUCT_MOMENT_ORDER)[number]

/** Relative order inside the full stack. Earlier moments outrank later ones. */
export function productMomentRank(id: ProductMoment): number {
  return PRODUCT_OVERLAY_ORDER.indexOf(id)
}

export type ProductAdmission = 'show' | 'queue' | 'refuse'

/** Menus, palette, and context menus sit above the product stack. Esc closes them first. */
export const HIGHER_CHROME_SELECTOR =
  '.titlebar-menu.is-open, .titlebar-popover, .session-context-menu, .ctx-menu, .tab-overflow-menu, .cmdp-backdrop'

const MODAL_PRODUCTS = new Set<ProductOverlay>(['systemUpdate', 'releaseNotes'])

export function isHigherChromeOpen(root: { querySelector: (selector: string) => unknown }): boolean {
  return Boolean(root.querySelector(HIGHER_CHROME_SELECTOR))
}

export function pickProductOverlay(input: {
  /** V2 "new version" dialog. Wins over changelog and welcome. */
  systemUpdate?: boolean
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
  if (input.systemUpdate) return 'systemUpdate'
  if (input.releaseNotes) return 'releaseNotes'
  if (input.tour && input.tourExplicit) return 'tour'
  if (input.quickStart && input.quickExplicit) return 'quickStart'
  if (input.welcome && !input.tourExplicit && !input.quickExplicit) return 'welcome'
  if (input.tour) return 'tour'
  if (input.quickStart) return 'quickStart'
  if (input.tasks) return 'tasks'
  return null
}

/**
 * What to do with `request` while `visible` is already up.
 * `show` — request becomes the visible layer; the previous one stays pending.
 * `queue` — request waits; the visible layer stays. No second dimmer.
 * `refuse` — that overlay is already the visible one.
 */
export function admitProductOverlay(
  visible: ProductOverlay | null,
  request: ProductOverlay,
  opts?: { explicit?: boolean }
): ProductAdmission {
  if (visible == null) return 'show'
  if (visible === request) return 'refuse'
  const welcomeVsTour =
    (visible === 'welcome' && (request === 'tour' || request === 'quickStart')) ||
    (visible === 'tour' && request === 'welcome')
  const welcomeVsTasks = (visible === 'welcome' && request === 'tasks') || (visible === 'tasks' && request === 'welcome')
  if (welcomeVsTour || welcomeVsTasks) {
    if (opts?.explicit && (request === 'tour' || request === 'quickStart' || request === 'welcome')) return 'show'
    return 'queue'
  }
  const rank = (id: ProductOverlay) => PRODUCT_OVERLAY_ORDER.indexOf(id)
  if (rank(request) < rank(visible)) return 'show'
  return 'queue'
}

/** Modal dimmers the visible product layer contributes. Never more than one. */
export function productBackdropCount(visible: ProductOverlay | null): 0 | 1 {
  if (visible && MODAL_PRODUCTS.has(visible)) return 1
  return 0
}


/** Floating product cards (no modal dimmer). Park while CmdK / menus / workspace editors are up. */
export function isParkableProduct(id: ProductOverlay): boolean {
  return id === 'welcome' || id === 'tour' || id === 'quickStart' || id === 'tasks'
}

/**
 * Hide parkable product UI while higher chrome (palette, menus) or a workspace
 * editor (new connection, import preview) is in front. State stays queued; when
 * chrome closes, pickProductOverlay may show the same layer again.
 */
export function suppressParkableProduct(
  product: ProductOverlay | null,
  opts: { higherChrome?: boolean; workspaceEditor?: boolean }
): ProductOverlay | null {
  if (!product) return null
  if (opts.higherChrome && isParkableProduct(product)) return null
  if (opts.workspaceEditor && (product === 'quickStart' || product === 'tour' || product === 'welcome')) return null
  return product
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
  const ownModal = input.product === 'releaseNotes' || input.product === 'systemUpdate' ? 1 : 0
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
