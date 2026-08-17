/** 三栏布局偏好（侧栏 | 终端 | AI），持久化到 localStorage */

export type LayoutPrefs = {
  showSidebar: boolean
  showMain: boolean
  showAi: boolean
  sidebarWidth: number
  aiWidth: number
}

const KEY = 'aiss-layout-v1'
const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 520
const AI_MIN = 260
const AI_MAX = 640

export const LAYOUT_DEFAULTS: LayoutPrefs = {
  showSidebar: true,
  showMain: true,
  showAi: true,
  sidebarWidth: 240,
  aiWidth: 360
}

export function clampSidebarWidth(n: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(n)))
}

export function clampAiWidth(n: number): number {
  return Math.min(AI_MAX, Math.max(AI_MIN, Math.round(n)))
}

export function loadLayoutPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...LAYOUT_DEFAULTS }
    const o = JSON.parse(raw) as Partial<LayoutPrefs>
    return {
      showSidebar: o.showSidebar !== false,
      showMain: o.showMain !== false,
      showAi: o.showAi !== false,
      sidebarWidth: clampSidebarWidth(
        typeof o.sidebarWidth === 'number' ? o.sidebarWidth : LAYOUT_DEFAULTS.sidebarWidth
      ),
      aiWidth: clampAiWidth(typeof o.aiWidth === 'number' ? o.aiWidth : LAYOUT_DEFAULTS.aiWidth)
    }
  } catch {
    return { ...LAYOUT_DEFAULTS }
  }
}

export function saveLayoutPrefs(prefs: LayoutPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

/** 至少保留一栏可见 */
export function withPaneToggle(
  prefs: LayoutPrefs,
  pane: 'sidebar' | 'main' | 'ai',
  next: boolean
): LayoutPrefs {
  const draft = { ...prefs }
  if (pane === 'sidebar') draft.showSidebar = next
  if (pane === 'main') draft.showMain = next
  if (pane === 'ai') draft.showAi = next
  const visible = [draft.showSidebar, draft.showMain, draft.showAi].filter(Boolean).length
  if (visible === 0) return prefs
  return draft
}
