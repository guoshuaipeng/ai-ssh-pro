/** Stack of recently closed session tabs for reopen (Ctrl+Shift+T). */

export const CLOSED_TABS_MAX = 10

export type ClosedTabSnap = {
  connectOpts: {
    host: string
    port?: number
    username?: string
    password?: string
    privateKeyPath?: string
    passphrase?: string
    label?: string
    [key: string]: unknown
  }
  profileId?: string
  hostInventoryId?: string
  kind?: 'ssh' | 'local'
  title?: string
}

export function pushClosedTab(stack: ClosedTabSnap[], snap: ClosedTabSnap, max = CLOSED_TABS_MAX): ClosedTabSnap[] {
  return [snap, ...stack].slice(0, max)
}

export function popClosedTab(stack: ClosedTabSnap[]): { next: ClosedTabSnap[]; snap: ClosedTabSnap | undefined } {
  if (!stack.length) return { next: stack, snap: undefined }
  const [snap, ...rest] = stack
  return { next: rest, snap }
}
