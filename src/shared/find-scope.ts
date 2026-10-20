/**
 * D19: one search entry. Ctrl+F opens the terminal find bar; when output blocks are on it can switch scope to blocks
 * (command + output), with the same case / regex options. The last scope is remembered.
 */
export type FindScope = 'terminal' | 'blocks'
export const FIND_SCOPE_KEY = 'aiss.find.scope'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadFindScope(store: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): FindScope {
  try {
    return store?.getItem(FIND_SCOPE_KEY) === 'blocks' ? 'blocks' : 'terminal'
  } catch {
    return 'terminal'
  }
}

export function saveFindScope(scope: FindScope, store: Store | undefined = globalThis.localStorage): FindScope {
  try {
    store?.setItem(FIND_SCOPE_KEY, scope)
  } catch {
    /* ignore */
  }
  return scope
}

/** Blocks scope only applies while blocks are on for this session. */
export function effectiveScope(scope: FindScope, blocksOn: boolean): FindScope {
  return scope === 'blocks' && blocksOn ? 'blocks' : 'terminal'
}

export type MatchOpts = { caseSensitive?: boolean; regex?: boolean }

/** null = empty query (match everything); 'error' = bad regex. */
export function blockMatcher(query: string, opts: MatchOpts = {}): ((s: string) => boolean) | null | 'error' {
  const q = String(query ?? '')
  if (!q.trim()) return null
  if (opts.regex) {
    try {
      const re = new RegExp(q, opts.caseSensitive ? '' : 'i')
      return (s) => re.test(s)
    } catch {
      return 'error'
    }
  }
  if (opts.caseSensitive) return (s) => s.includes(q)
  const lq = q.toLowerCase()
  return (s) => s.toLowerCase().includes(lq)
}

/** Next (or previous) matching block index after `current`, wrapping; -1 when none. */
export function stepMatch(matches: number[], current: number, back: boolean): number {
  if (!matches.length) return -1
  if (back) {
    for (let i = matches.length - 1; i >= 0; i--) if (matches[i]! < current) return matches[i]!
    return matches[matches.length - 1]!
  }
  for (const m of matches) if (m > current) return m
  return matches[0]!
}
