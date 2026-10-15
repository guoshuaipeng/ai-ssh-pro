import { menuLabel, type MenuAction, type SharedMenu } from '../../../shared/menus'
import { paletteCategory, type PaletteCat } from '../../../shared/palette-rank'

export type PaletteEntry = {
  id: MenuAction
  label: string
  group: string
  shortcut?: string
  hay: string
  category: PaletteCat
  order: number
  /** UX-37: shown when an AI action is unavailable */
  note?: string
  /** D2: saved sync profile id; id stays folderSync */
  syncId?: string
  disabled?: boolean
}

/** clipboard items and the palette itself are not useful as palette entries */
export const PALETTE_HIDDEN: ReadonlySet<MenuAction> = new Set<MenuAction>(['commandPalette', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])

/** UX-11: common pinyin / English aliases so Ctrl+K finds Chinese features faster */
export const PINYIN_ALIASES: Readonly<Partial<Record<MenuAction, string>>> = {
  connection: 'xinjianlianjie new conn',
  sftp: 'wenjian sftp chuanshu',
  smartComplete: 'zhineng buquan complete history',
  clearHostHistory: 'qingchu lishi history clear',
  resourceMonitor: 'jiankong ziyuan monitor cpu',
  serverTools: 'gongjuxiang toolbox jincheng',
  dashboard: 'kanban duoji multihost',
  opsHome: 'home gzt yunwei dashboard-home yunwei shouye',
  refreshHomeHealth: 'sxjk shuaxin jiankang refresh home health',
  switchTab: 'tab qhbq qiehuan biaoqian switch tab',
  alertWorkbench: 'gaojing gongzuotai alert workbench chuli',
  alertRules: 'gaojing guize alert',
  alertHistory: 'gaojing lishi alert history',
  fixPlaybook: 'fix playbook xfjb juben gaojing',
  dryRunPlaybook: 'dry run shiyunxing playbook',
  fileSnapshots: 'snapshot history kz kuaizhao',
  exportPostmortem: 'postmortem fp fupan',
  toggleBlockStrip: 'blocks fk fenkuai',
  auditLog: 'shenji audit log',
  playbooks: 'playbook juben jb yunwei yunwei-jb',
  runPlaybook: 'playbook run juben run-playbook',
  sessionRecordings: 'record replay luzhi lz',
  toggleBlocks: 'blocks fenkuai output',
  startupSettings: 'qidong startup home',
  batchExec: 'piliang batch',
  toggleBroadcast: 'guangbo broadcast',
  broadcastTargets: 'guangbo mubiao',
  commandPalette: 'sousuo palette',
  snippets: 'pianduan snippet',
  inventory: 'zhuji dang an profile',
  portForward: 'duankou zhuanfa forward',
  aiCommand: 'ziran yuyan nl command ai',
  aiExplainError: 'jieshi baocuo explain ai',
  aiInspect: 'xunjian inspect health jiancha ai',
  refreshDocker: 'docker sxd shuaxin',
  updateChannel: 'gengxin tongdao gitee github',
  taskCards: 'renwu rukou onboarding',
  sftpComfort: 'midu shushi compact sftp',
  setJumpHosts: 'jump tiaoban bastion proxy',
  checkCerts: 'cert zhengshu sk fido key',
  testJump: 'jump test tiaoban',
  openDocker: 'docker rongqi container',
  syncConflicts: 'sync conflict chongtu',
  syncPreview: 'sync preview yulan',
  cloudSync: 'sync yun tongbu ybtb yuntb cloud-sync gist',
  syncNow: 'sync now tongbu',
  folderSync: 'tongbu wenjianjia sync folder wjjtb folder-sync'
}

/** F4: every menu action becomes a palette entry; both languages and the action id are searchable. */
/** Palette-only actions (not a second menu row). */
export const PALETTE_EXTRAS: ReadonlyArray<{ id: MenuAction; zh: string; en: string }> = [
  { id: 'setJumpHosts', zh: '为当前连接设置跳板机…', en: 'Set jump hosts for this connection…' },
  { id: 'checkCerts', zh: '检查密钥与证书…', en: 'Check keys and certificates…' },
  { id: 'testJump', zh: '测试跳板连接', en: 'Test jump connection' },
  { id: 'openDocker', zh: 'Docker', en: 'Docker' },
  { id: 'syncConflicts', zh: '同步冲突', en: 'Sync conflict' },
  { id: 'syncPreview', zh: '同步预览', en: 'Sync preview' },
  { id: 'fixPlaybook', zh: '为当前告警生成修复剧本', en: 'Create fix playbook for selected alert' },
  { id: 'dryRunPlaybook', zh: '试运行剧本…', en: 'Dry-run playbook…' },
  { id: 'fileSnapshots', zh: '文件快照…', en: 'File snapshots…' },
  { id: 'exportPostmortem', zh: '导出当前告警复盘…', en: 'Export postmortem for selected alert…' },
  { id: 'toggleBlockStrip', zh: '显示 / 隐藏输出分块条', en: 'Show / hide output blocks' },
  { id: 'refreshHomeHealth', zh: '刷新首页健康', en: 'Refresh home health' },
  { id: 'switchTab', zh: '切换标签…', en: 'Switch tab…' }
]

export function buildPaletteEntries(menus: ReadonlyArray<SharedMenu>, locale: string): PaletteEntry[] {
  const out: PaletteEntry[] = []
  let order = 0
  const seen = new Set<MenuAction>()
  const push = (id: MenuAction, label: string, other: string, group: string, shortcut?: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const alias = PINYIN_ALIASES[id] ?? ''
    out.push({
      id,
      label,
      group,
      shortcut,
      category: paletteCategory(id),
      order: order++,
      hay: `${label} ${other} ${group} ${id} ${alias}`.toLowerCase()
    })
  }
  for (const m of menus) {
    const group = menuLabel(m.label, locale)
    for (const it of m.items) {
      if (it.type !== 'item' || PALETTE_HIDDEN.has(it.id)) continue
      const label = menuLabel(it.label, locale)
      const other = locale === 'zh-CN' ? it.label.en : it.label.zh
      push(it.id, label, other, group, it.shortcut)
    }
  }
  for (const extra of PALETTE_EXTRAS) {
    const label = locale === 'zh-CN' ? extra.zh : extra.en
    const other = locale === 'zh-CN' ? extra.en : extra.zh
    push(extra.id, label, other, '', undefined)
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
