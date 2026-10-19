/** UX-47 / UX-54: container widths, not window widths, drive L7/L2 density. */

import { OPS_HOME_TWO_LINE_WIDTH, opsHomeRowLayout, type OpsRowLayout } from './ops-home-density'

export const DENSITY = {
  /** M17: ops home is one column; under this container width attention rows go two-line (`@container (max-width: 759px)`). */
  opsTwoLine: OPS_HOME_TWO_LINE_WIDTH,
  /** L2 list+detail stacks. Kept aligned with the existing 1099 container query. */
  l2Stack: 1099,
  /** Search drops to its own row before the action row iconifies. */
  filterWrap: 1040,
  /** Secondary alert actions become icons; Locate keeps its word. */
  iconify: 900
} as const

export type L7Mode = OpsRowLayout
export type L2Mode = 'split' | 'stacked'
export type L2Actions = 'text' | 'icons'
export type L2Filter = 'single' | 'search-row'

export function l7Mode(contentWidth: number): L7Mode {
  return opsHomeRowLayout(contentWidth)
}

export function l2Mode(contentWidth: number): L2Mode {
  return contentWidth > DENSITY.l2Stack ? 'split' : 'stacked'
}

export function l2Actions(contentWidth: number): L2Actions {
  return contentWidth <= DENSITY.iconify ? 'icons' : 'text'
}

export function l2Filter(contentWidth: number): L2Filter {
  return contentWidth <= DENSITY.filterWrap ? 'search-row' : 'single'
}

/** Density gates never allow the page itself to scroll sideways. */
export function allowsPageScrollX(): boolean {
  return false
}
