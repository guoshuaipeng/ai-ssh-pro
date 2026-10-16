/** Polish-12 toast restraint: ≤2 visible, same-theme merge, no synonym stack after value moment. */

export const TOAST_VISIBLE_CAP = 2

export type ToastTheme =
  | 'import'
  | 'connect'
  | 'update'
  | 'error'
  | 'info'
  | 'undo'
  | 'generic'

export type QueuedToast = {
  id: number
  message: string
  theme: ToastTheme
  kind: 'info' | 'error'
}

/** Guess a merge theme from message text when callers omit one. */
export function inferToastTheme(message: string, kind: 'info' | 'error' = 'info'): ToastTheme {
  if (kind === 'error') return 'error'
  const m = message.trim()
  if (/已导入|Imported\s+\d|import/i.test(m) && /台|host/i.test(m)) return 'import'
  if (/导入|Imported|import/i.test(m)) return 'import'
  if (/连接|connect|reconnect|重连/i.test(m)) return 'connect'
  if (/更新|update|version/i.test(m)) return 'update'
  if (/撤销|undo/i.test(m)) return 'undo'
  return 'generic'
}

/**
 * Admit a toast into the visible queue.
 * Same theme replaces the prior peer (merge); hard cap is TOAST_VISIBLE_CAP.
 */
export function admitToast(
  prev: ReadonlyArray<QueuedToast>,
  next: QueuedToast,
  cap: number = TOAST_VISIBLE_CAP
): QueuedToast[] {
  const withoutSame = prev.filter((t) => t.theme !== next.theme)
  const merged = [...withoutSame, next]
  return merged.slice(-Math.max(1, cap))
}

/** When the import value strip is showing, skip a synonym import toast/sideInfo. */
export function suppressImportSynonymToast(valueMomentImport: boolean, theme: ToastTheme): boolean {
  return valueMomentImport && theme === 'import'
}
