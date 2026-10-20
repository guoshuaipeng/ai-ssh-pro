/** D18: one-time, unobtrusive hint that output blocks exist (blocks stay default off). */
export const BLOCKS_HINT_KEY = 'aiss.blocks.hintShown'
export const BLOCKS_HINT_AFTER = 3

export function shouldHintBlocks(o: { enabled: boolean; shown: boolean; submitted: number; demo: boolean }): boolean {
  return !o.enabled && !o.shown && !o.demo && o.submitted >= BLOCKS_HINT_AFTER
}
