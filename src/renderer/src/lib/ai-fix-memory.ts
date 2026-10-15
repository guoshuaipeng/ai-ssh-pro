/** Last AI fix list, so Ctrl+K / the workbench shortcut can draft without a second request. */

export type RememberedFix = { command: string; note?: string }

let last: { key: string; fixes: RememberedFix[] } | null = null

export function rememberAiFixes(key: string, fixes: RememberedFix[]): void {
  last = { key, fixes }
}

export function fixesFor(key: string): RememberedFix[] | undefined {
  return last?.key === key ? last.fixes : undefined
}
