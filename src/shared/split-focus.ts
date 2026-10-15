/** IX-6: which side of a dual split is focused. Left is the first pane, right the second. */

export type SplitSide = 'left' | 'right'

/** Clicking a side (its tab strip or its content) focuses that side. */
export function reduceSplitFocus(_focused: SplitSide, click: SplitSide): SplitSide {
  return click
}

/** `aria-current` for the focused side. Omitted on the other side. */
export function splitSideCurrent(side: SplitSide, focused: SplitSide): 'true' | undefined {
  return side === focused ? 'true' : undefined
}

/** Focused side carries `is-focused` so its tab strip can paint the 2px accent. */
export function splitPaneClass(side: SplitSide, focused: SplitSide): string {
  return side === focused ? 'split-pane is-focused' : 'split-pane'
}
