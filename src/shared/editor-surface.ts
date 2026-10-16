/**
 * IX-7: long-dwell ops editors (stay >30s, or the operator needs the list
 * in view) open as a center tab or a settings anchor. Short collect/confirm
 * stays an App Modal.
 *
 * Dev default (IA nit N2 / L2d): an in-progress long editor uses a tab.
 * L2d's maintenance window is that tab; ending it early stays a confirm.
 */

export const LONG_DWELL_SEC = 30

export type SurfacePlacement = 'center-tab' | 'settings-anchor' | 'app-modal'

export type EditorSpec = {
  id: string
  /** Expected time the operator stays in the editor, in seconds. */
  dwellSec: number
  /** True when the list or timeline must stay visible to compare. */
  compareList?: boolean
  /** Short collect/confirm. Stays an App Modal. */
  short?: boolean
  /** Settings section. A long editor with an anchor lands there. */
  anchor?: string
  /** Center-tab kind. Defaults to id. Example: alert-rules. */
  kind?: string
}

export type SurfacePlan =
  | { placement: 'center-tab'; kind: string }
  | { placement: 'settings-anchor'; anchor: string }
  | { placement: 'app-modal' }

export function classifyEditor(spec: EditorSpec): SurfacePlan {
  const long = !spec.short && (spec.dwellSec > LONG_DWELL_SEC || Boolean(spec.compareList))
  if (!long) return { placement: 'app-modal' }
  if (spec.anchor) return { placement: 'settings-anchor', anchor: spec.anchor }
  return { placement: 'center-tab', kind: spec.kind ?? spec.id }
}

export const EDITOR_CATALOG = {
  'alert-rules': { id: 'alert-rules', dwellSec: 120, compareList: true, kind: 'alert-rules' },
  'alert-history': { id: 'alert-history', dwellSec: 90, compareList: true, kind: 'alert-workbench' },
  'alert-maintenance': { id: 'alert-maintenance', dwellSec: 90, compareList: true, kind: 'alert-maintenance' },
  'probe-sampling': { id: 'probe-sampling', dwellSec: 60, anchor: 'ops' },
  'enable-template': { id: 'enable-template', dwellSec: 20, short: true },
  'end-maintenance': { id: 'end-maintenance', dwellSec: 8, short: true },
  'danger-step': { id: 'danger-step', dwellSec: 8, short: true },
  confirm: { id: 'confirm', dwellSec: 5, short: true },
  'host-picker': { id: 'host-picker', dwellSec: 12, short: true },
  'command-palette': { id: 'command-palette', dwellSec: 8, short: true }
} as const satisfies Record<string, EditorSpec>

export type EditorId = keyof typeof EDITOR_CATALOG

export function editorOpenPlan(id: EditorId): SurfacePlan {
  return classifyEditor(EDITOR_CATALOG[id])
}

/** Rule edit and other long editors do not mount the full-screen App Modal. */
export function mountsFullScreenModal(id: EditorId): boolean {
  return editorOpenPlan(id).placement === 'app-modal'
}

/** IA nit N2 / L2d: a long in-progress editor defaults to a tab, or a settings anchor. */
export function devDefaultSurface(input: {
  dwellSec: number
  compareList?: boolean
  anchor?: string
  short?: boolean
}): SurfacePlacement {
  return classifyEditor({ id: 'in-progress', ...input }).placement
}

/** In-tab alert-rules panel. Restrained so a 1366 main pane does not scroll sideways. */
export const RULES_PANEL_MAX_PX = 420
export const RULES_PANEL_MAX_PX_1366 = 320

export function rulesPanelMaxPx(viewportWidth: number): number {
  return viewportWidth <= 1366 ? RULES_PANEL_MAX_PX_1366 : RULES_PANEL_MAX_PX
}
