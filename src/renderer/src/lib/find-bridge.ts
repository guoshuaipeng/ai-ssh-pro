/** D19: terminal find bar <-> blocks strip */
export const BLOCKS_QUERY_EVENT = 'aiss-blocks-query'
export const BLOCKS_STEP_EVENT = 'aiss-blocks-step'
export const BLOCKS_HITS_EVENT = 'aiss-blocks-hits'
export type BlocksQueryDetail = { sessionId: string; query: string; caseSensitive: boolean; regex: boolean }
export type BlocksStepDetail = { sessionId: string; back: boolean }
export type BlocksHitsDetail = { sessionId: string; index: number; total: number }
