import { menuLabel, type MenuAction, type SharedMenu } from '../../../shared/menus'

export type PaletteEntry = {
  id: MenuAction
  label: string
  group: string
  shortcut?: string
  hay: string
  /** UX-37: shown when an AI action is unavailable */
  note?: string
  /** D2: saved sync profile id; id stays folderSync */
  syncId?: string
}

/** clipboard items and the palette itself are not useful as palette entries */
export const PALETTE_HIDDEN: ReadonlySet<MenuAction> = new Set<MenuAction>(['commandPalette', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])

/** UX-11: common pinyin / English aliases so Ctrl+K finds Chinese features faster */
export const PINYIN_ALIASES: Readonly<Partial<Record<MenuAction, string>>> = {
  connection: 'xinjianlianjie new conn',
  sftp: 'wenjian sftp chuanshu',
  folderSync: 'tongbu wenjianjia sync folder',
  smartComplete: 'zhineng buquan complete history',
  clearHostHistory: 'qingchu lishi history clear',
  resourceMonitor: 'jiankong ziyuan monitor cpu',
  serverTools: 'gongjuxiang toolbox jincheng',
  dashboard: 'kanban duoji multihost',
  alertRules: 'gaojing guize alert',
  alertHistory: 'gaojing lishi',
  batchExec: 'piliang batch',
  aiInspect: 'xunjian inspect health jiancha',
  toggleBroadcast: 'guangbo broadcast',
  broadcastTargets: 'guangbo mubiao',
  commandPalette: 'sousuo palette',
  snippets: 'pianduan snippet',
  inventory: 'zhuji dang an profile',
  portForward: 'duankou zhuanfa forward',
  aiCommand: 'ziran yuyan nl command',
  aiExplainError: 'jieshi baocuo explain'
}

/** F4: every menu action becomes a palette entry; both languages and the action id are searchable. */
export function buildPaletteEntries(menus: ReadonlyArray<SharedMenu>, locale: string): PaletteEntry[] {
  const out: PaletteEntry[] = []
  for (const m of menus) {
    const group = menuLabel(m.label, locale)
    for (const it of m.items) {
      if (it.type !== 'item' || PALETTE_HIDDEN.has(it.id)) continue
      const label = menuLabel(it.label, locale).replace(/…$/, '')
      const other = (locale === 'zh-CN' ? it.label.en : it.label.zh).replace(/…$/, '')
      const alias = PINYIN_ALIASES[it.id] ?? ''
      out.push({ id: it.id, label, group, shortcut: it.shortcut, hay: `${label} ${other} ${group} ${it.id} ${alias}`.toLowerCase() })
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
