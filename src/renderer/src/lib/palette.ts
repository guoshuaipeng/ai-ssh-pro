import { menuLabel, type MenuAction, type SharedMenu } from '../../../shared/menus'

export type PaletteEntry = { id: MenuAction; label: string; group: string; shortcut?: string; hay: string }

/** clipboard items and the palette itself are not useful as palette entries */
export const PALETTE_HIDDEN: ReadonlySet<MenuAction> = new Set<MenuAction>(['commandPalette', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])

/** F4: every menu action becomes a palette entry; both languages and the action id are searchable. */
export function buildPaletteEntries(menus: ReadonlyArray<SharedMenu>, locale: string): PaletteEntry[] {
  const out: PaletteEntry[] = []
  for (const m of menus) {
    const group = menuLabel(m.label, locale)
    for (const it of m.items) {
      if (it.type !== 'item' || PALETTE_HIDDEN.has(it.id)) continue
      const label = menuLabel(it.label, locale).replace(/…$/, '')
      const other = (locale === 'zh-CN' ? it.label.en : it.label.zh).replace(/…$/, '')
      out.push({ id: it.id, label, group, shortcut: it.shortcut, hay: `${label} ${other} ${group} ${it.id}`.toLowerCase() })
    }
  }
  return out
}

export function filterPaletteEntries(entries: PaletteEntry[], q: string): PaletteEntry[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return entries
  return entries
    .filter((e) => words.every((w) => e.hay.includes(w)))
    .sort((a, b) => Number(!a.label.toLowerCase().startsWith(words[0]!)) - Number(!b.label.toLowerCase().startsWith(words[0]!)))
}
