import { menuLabel, SHARED_MENUS, type MenuAction, type SharedMenu } from '../../../shared/menus'
import { layoutPalette, paletteCategory, type PaletteCat } from '../../../shared/palette-rank'

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
  dashboard: 'kanban duoji multihost 看板 dashboard dkb',
  opsHome: 'home gzt yunwei dashboard-home yunwei shouye',
  refreshHomeHealth: 'sxjk shuaxin jiankang refresh home health',
  switchTab: 'tab qhbq qiehuan biaoqian switch tab',
  alertWorkbench: 'gaojing gongzuotai alert workbench chuli',
  alertRules: 'gaojing guize alert 告警规则 alert-rules gjgz rules',
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
  openProdGuard: '生产防护 production guard prod-guard scfh fanghu',
  portForward: 'duankou zhuanfa forward',
  aiCommand: 'ziran yuyan nl command ai',
  aiExplainError: 'jieshi baocuo explain ai',
  aiInspect: 'xunjian inspect health jiancha ai',
  refreshDocker: 'docker sxd shuaxin',
  updateChannel: 'gengxin tongdao gitee github',
  taskCards: 'renwu rukou onboarding',
  quickStart: 'quick start shouqi ux60',
  enableRuleTemplates: 'rule template gzmb gaojing muban',
  retryFailedProbes: 'retry failed probes csb caiyang',
  exportPlaybookPack: 'share playbook jbfx daochu',
  importPlaybookPack: 'share playbook jbfx daoru',
  gateTimeline: 'gate timeline zmjl zhamen',
  maintOpen: 'maintenance weihu chuangkou l2d',
  maintEnd: 'end maintenance jieshu weihu',
  setDryRunReminder: 'dry-run reminder shipao tixing w6',
  aiPostmortem: 'postmortem fupan a5',
  explainDiff: 'diff explain chayi l8b',
  diffFixPlaybook: 'diff playbook xiufu l8b',
  sftpComfort: 'midu shushi compact sftp',
  setJumpHosts: '跳板 jump tiaoban bastion proxy proxyjump',
  checkCerts: 'cert zhengshu sk fido key',
  testJump: 'jump test tiaoban',
  openDocker: 'docker rongqi container',
  syncConflicts: 'sync conflict chongtu',
  syncPreview: 'sync preview yulan',
  cloudSync: '云同步 sync yun tongbu ybtb yuntb cloud-sync gist',
  syncNow: 'sync now tongbu',
  folderSync: 'tongbu wenjianjia sync folder wjjtb folder-sync'
}

/** F4: every menu action becomes a palette entry; both languages and the action id are searchable. */
/** Palette-only actions (not a second menu row). */
export const PALETTE_EXTRAS: ReadonlyArray<{ id: MenuAction; zh: string; en: string }> = [
  { id: 'openProdGuard', zh: '生产防护…', en: 'Production guard…' },
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
  { id: 'switchTab', zh: '切换标签…', en: 'Switch tab…' },
  { id: 'enableRuleTemplates', zh: '启用告警规则模板…', en: 'Enable alert rule templates…' },
  { id: 'retryFailedProbes', zh: '重试失败的健康采样', en: 'Retry failed health samples' },
  { id: 'exportPlaybookPack', zh: '导出剧本分享包…', en: 'Export playbook share pack…' },
  { id: 'importPlaybookPack', zh: '导入剧本分享包…', en: 'Import playbook share pack…' },
  { id: 'gateTimeline', zh: '查看写闸门记录', en: 'View write-gate log' },
  { id: 'maintOpen', zh: '维护窗口', en: 'Maintenance window' },
  { id: 'maintEnd', zh: '结束维护', en: 'End maintenance' },
  { id: 'setDryRunReminder', zh: '试跑提醒', en: 'Dry-run reminder' },
  { id: 'aiPostmortem', zh: 'AI 复盘摘要', en: 'AI postmortem summary' },
  { id: 'explainDiff', zh: 'AI 解释差异', en: 'Explain diff' },
  { id: 'diffFixPlaybook', zh: '从差异生成修复剧本', en: 'Draft fix playbook from diff' }
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

/** IX-4: ids whose hay matches the query. Empty query returns the stable grouped order. */
export function paletteMatch(q: string, locale = 'zh-CN'): string[] {
  return layoutPalette(buildPaletteEntries(SHARED_MENUS, locale), q).items.map((e) => e.id)
}

export function filterPaletteEntries(entries: PaletteEntry[], q: string): PaletteEntry[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return entries
  return entries
    .filter((e) => words.every((w) => e.hay.includes(w)))
    .sort((a, b) => Number(!a.label.toLowerCase().startsWith(words[0]!)) - Number(!b.label.toLowerCase().startsWith(words[0]!)))
}
