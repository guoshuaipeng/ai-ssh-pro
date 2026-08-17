/** 侧栏展开状态：仅持久化「会话分组」；主机 Docker 树每次启动默认折叠 */

export type SidebarExpandPrefs = {
  folders: Record<string, boolean>
}

const KEY = 'aiss-sidebar-expand-v1'

function asBoolMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === 'string' && k.trim() && typeof v === 'boolean') out[k] = v
  }
  return out
}

export function loadSidebarExpandPrefs(): SidebarExpandPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { folders: {} }
    const o = JSON.parse(raw) as Partial<SidebarExpandPrefs>
    return { folders: asBoolMap(o.folders) }
  } catch {
    return { folders: {} }
  }
}

export function saveSidebarExpandPrefs(prefs: SidebarExpandPrefs): void {
  try {
    // 故意不写入 hosts / dockerGroups，避免重启后显示已展开却未加载
    localStorage.setItem(KEY, JSON.stringify({ folders: prefs.folders }))
  } catch {
    /* ignore */
  }
}
