/** UX-55 / Polish-3: the center tab strip stays one row. Extra tabs scroll; ⋯ lists them. UX-55b adds search. */

/** Initials for titles the product itself uses. Unknown characters stay searchable as themselves. */
const PINYIN_INITIAL: Record<string, string> = {
  运: 'y', 维: 'w', 首: 's', 页: 'y', 告: 'g', 警: 'j', 工: 'g', 作: 'z', 台: 't',
  设: 's', 置: 'z', 文: 'w', 件: 'j', 同: 't', 步: 'b', 监: 'j', 控: 'k', 演: 'y',
  示: 's', 主: 'z', 机: 'j', 标: 'b', 签: 'q', 连: 'l', 接: 'j', 断: 'd', 开: 'k',
  会: 'h', 话: 'h', 终: 'z', 端: 'd', 资: 'z', 源: 'y', 看: 'k', 板: 'b', 剧: 'j',
  本: 'b', 审: 's', 计: 'j', 录: 'l', 制: 'z', 云: 'y', 冲: 'c', 突: 't', 预: 'y',
  览: 'l', 导: 'd', 入: 'r', 出: 'c', 备: 'b', 份: 'f', 快: 'k', 捷: 'j', 键: 'j',
  帮: 'b', 助: 'z', 关: 'g', 于: 'y', 更: 'g', 新: 'x', 搜: 's', 索: 's', 切: 'q',
  换: 'h', 已: 'y', 闭: 'b', 无: 'w', 法: 'f', 等: 'd', 待: 'd', 采: 'c', 样: 'y',
  健: 'j', 康: 'k', 刷: 's', 知: 'z', 道: 'd', 了: 'l', 不: 'b', 再: 'z', 显: 'x',
  组: 'z', 分: 'f', 历: 'l', 史: 's', 命: 'm', 令: 'l', 片: 'p', 段: 'd', 口: 'k',
  转: 'z', 发: 'f', 广: 'g', 播: 'b', 自: 'z', 动: 'd', 重: 'c', 试: 's', 正: 'z',
  在: 'z', 生: 's', 产: 'c', 只: 'z', 读: 'd', 窗: 'c'
}

export function pinyinInitials(text: string): string {
  let out = ''
  for (const ch of text) {
    const lower = ch.toLowerCase()
    if (lower >= 'a' && lower <= 'z') out += lower
    else if (PINYIN_INITIAL[ch]) out += PINYIN_INITIAL[ch]
  }
  return out
}

export const TAB_SEARCH_MIN = 10

export type TabListRow = {
  tabId: string
  title: string
  host?: string
  username?: string
  status?: string
  view?: string
  kind?: string
}

export function showTabSearch(count: number): boolean {
  return count >= TAB_SEARCH_MIN
}

/** Same word match as the command palette: every word must sit in the haystack. */
export function tabListHay(row: Pick<TabListRow, 'title' | 'host' | 'username'>): string {
  const title = row.title ?? ''
  const host = row.host ?? ''
  const username = row.username ?? ''
  const ident = username && host ? `${username}@${host}` : ''
  return [title, host, username, ident, pinyinInitials(title), pinyinInitials(host)].join(' ').toLowerCase()
}

export function filterTabList<T extends Pick<TabListRow, 'title' | 'host' | 'username'>>(rows: T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return rows
  return rows.filter((row) => {
    const hay = tabListHay(row)
    return words.every((word) => hay.includes(word))
  })
}

/** Session tabs that dropped. Tool tabs (home, alerts, settings, …) do not count. */
export function isDisconnectedSession(row: Pick<TabListRow, 'status' | 'view' | 'kind'>): boolean {
  if (row.kind === 'local') return false
  if (row.view && row.view !== 'session') return false
  return row.status === 'disconnected'
}

export function disconnectedSessions<T extends Pick<TabListRow, 'status' | 'view' | 'kind'>>(rows: T[]): T[] {
  return rows.filter(isDisconnectedSession)
}

export function tabStripOverflow(opts: {
  containerWidth: number
  tabWidths: number[]
  reserved?: number
  gap?: number
}): { visibleCount: number; overflow: boolean; hidden: number; wraps: false } {
  const gap = opts.gap ?? 2
  const reserved = opts.reserved ?? 0
  let budget = Math.max(0, opts.containerWidth - reserved)
  let visible = 0
  for (const w of opts.tabWidths) {
    const need = w + (visible > 0 ? gap : 0)
    if (need > budget) break
    budget -= need
    visible += 1
  }
  if (visible === 0 && opts.tabWidths.length > 0 && opts.containerWidth > 0) visible = 1
  const hidden = Math.max(0, opts.tabWidths.length - visible)
  return { visibleCount: visible, overflow: hidden > 0, hidden, wraps: false }
}

/** Minimum pixels a ← / → click moves the strip. A wide strip steps about one viewport. */
export const TAB_STRIP_NUDGE = 160

/** Pixels for one DOM_DELTA_LINE notch. Pixel wheels (deltaMode 0) are unchanged. */
export const TAB_WHEEL_LINE_PX = 48

/** About one screen of tabs, and never less than the named nudge (or 120px). */
export function tabStripNudgePx(clientWidth: number, floor = TAB_STRIP_NUDGE): number {
  const page = clientWidth > 48 ? Math.round(clientWidth * 0.85) : 0
  return Math.max(120, floor, page)
}

/**
 * Visible overflow control. ⌄ plus the hidden count — not the toolbar ⋯ (“更多”).
 * The button’s accessible name stays “所有标签”.
 */
export function tabOverflowMark(hidden: number): string {
  const n = Number.isFinite(hidden) ? Math.max(0, Math.floor(hidden)) : 0
  return n > 0 ? `⌄ ${n}` : '⌄'
}

/** How far to add to scrollLeft so a tab rect (relative to the visible box) sits in view. */
export function tabStripRevealDelta(opts: {
  tabLeft: number
  tabRight: number
  clientWidth: number
  pad?: number
}): number {
  const pad = opts.pad ?? 8
  const width = opts.clientWidth
  if (!(width > 0)) return 0
  const left = opts.tabLeft
  const right = opts.tabRight
  if (right - left >= width) return left - pad
  if (left < pad) return left - pad
  if (right > width - pad) return right - (width - pad)
  return 0
}

/** Arrows and the ⌄ list show together, and only while tabs overflow. */
export function tabStripChrome(overflowing: boolean): { arrows: boolean; menu: boolean } {
  return { arrows: overflowing, menu: overflowing }
}

/**
 * Map a wheel gesture onto the tab strip.
 * A vertical wheel (the common mouse wheel) scrolls sideways.
 * A mostly-horizontal trackpad gesture keeps deltaX.
 * Line and page modes are scaled so a notch moves more than a pixel.
 */
export function tabStripWheelDelta(deltaX: number, deltaY: number, deltaMode = 0, pagePx = 320): number {
  const raw = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX
  if (!raw) return 0
  if (deltaMode === 1) return raw * TAB_WHEEL_LINE_PX
  if (deltaMode === 2) return raw * (pagePx > 0 ? pagePx : 320)
  return raw
}
