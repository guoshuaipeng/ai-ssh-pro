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
  /** Insert snippet body into the active terminal (id stays snippets) */
  snippetId?: string
  snippetBody?: string
  /** Open a saved SSH session (id stays connection) */
  sessionProfileId?: string
  /** D13b: quick-connect text typed into the palette */
  quickText?: string
  disabled?: boolean
}

/** clipboard items and the palette itself are not useful as palette entries */
export const PALETTE_HIDDEN: ReadonlySet<MenuAction> = new Set<MenuAction>(['commandPalette', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])

/** UX-11: common pinyin / English aliases so Ctrl+K finds Chinese features faster */
export const PINYIN_ALIASES: Readonly<Partial<Record<MenuAction, string>>> = {
  serialPort: 'chuan kou serialport com uart',
  connection: 'xinjianlianjie new conn',
  focusTerminal: 'jujiao zhongduan focus terminal',
  focusAiPanel: 'ai mianban focus panel jujiao',
  copyLastAiReply: 'fuzhi ai reply copy last assistant',
  copyLastOutput: 'fuzhi shuchu copy last command output',
  clearAiChat: 'qingkong duihua clear ai chat',
  closeOtherTabs: 'guanbi qita close other tabs',
  closeTabsToRight: 'guanbi youce close right tabs',
  closeDisconnectedTabs: 'guanbi yiduan disconnected tabs close dropped',
  openAllTabs: 'quanbu biaoqian all tabs overview',
  reopenClosedTab: 'chongxin dakai reopen closed tab',
  backup: 'beifen backup 备份 加密备份 encrypted restore',
  checkUpdate: 'jiancha gengxin check update jcgx 检查更新',
  whatsNew: 'gengxin neirong whats new gxnr 更新内容',
  github: 'github gitee yuanma source 源码',
  uiTheme: 'zhuti theme jiemian 界面主题',
  toggleUiTheme: 'qianse shense light dark theme 切换浅色深色',
  toggleTabPin: 'guding pin unpin tab',
  editSessionNote: 'beizhu note session remark',
  copyConnectionString: 'fuzhi lianjie copy ssh conn string',
  toggleLanguage: 'yuyan language yingwen zhongwen 切换语言',
  sftp: 'wenjian sftp chuanshu',
  sftpTransferQueue: 'sftp queue chuanshu duilie transfers',
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
  exportAudit: '审计导出 合规导出 audit export sjdc hgdc 审计 / 合规 s1b',
  playbooks: 'playbook juben jb yunwei yunwei-jb',
  runPlaybook: 'playbook run juben run-playbook',
  sessionRecordings: 'record replay luzhi lz',
  toggleBlocks: 'blocks fenkuai output',
  toggleShellIntegration: 'shell integration osc 133 exit code jicheng',
  startupSettings: 'qidong startup home',
  batchExec: 'piliang batch',
  toggleBroadcast: 'guangbo broadcast',
  broadcastTargets: 'guangbo mubiao',
  commandPalette: 'sousuo palette',
  snippets: 'pianduan snippet',
  builtinSnippets: '内置片段 builtin snippet w9 pianduan',
  builtinPlaybooks: '内置示例剧本 builtin playbook built-in sample w9 juben',
  inventory: 'zhuji dang an profile',
  openProdGuard: '生产防护 production guard prod-guard scfh fanghu',
  portForward: 'duankou zhuanfa forward',
  aiCommand: 'ziran yuyan nl command ai',
  askAgain: 'chongxin tiwen ask again stale confirm cxwt 重新提问',
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
  explainSelection: 'jieshi xuanqu explain selection a6 解释选区',
  diffFixPlaybook: 'diff playbook xiufu l8b',
  reconnectPolicy: '重连策略 reconnect chonglian celue l9 keepalive',
  reconnectNow: '立即重连 reconnect now l9',
  disconnectAllSessions: 'duankai quanbu disconnect all sessions',
  reconnectAllDropped: '重连全部已断开 reconnect all dropped qbcl clqb',
  readonlyOn: '只读会话 readonly session zhidu s4',
  readonlyOff: '关闭只读 readonly off s4',
  setProtection: '保护级别 protection level baohu s2 s4',
  batchConnect: '批量连接 连接所选 连接所选主机 piliang lianjie connect-selected l10',
  batchConnectGroup: '连接分组 当前分组 fenzu connect-group l10',
  sftpComfort: 'midu shushi compact sftp',
  setJumpHosts: '跳板 jump tiaoban bastion proxy proxyjump',
  checkCerts: 'cert zhengshu sk fido key',
  knownHosts: 'known_hosts zhuji miyao host key fingerprint ssh dir',
  importSshConfig: 'openssh config ssh_config daoru ~/.ssh/config',
  testJump: 'jump test tiaoban',
  openDocker: 'docker rongqi container',
  syncConflicts: 'sync conflict chongtu',
  syncPreview: 'sync preview yulan',
  cloudSync: '云同步 sync yun tongbu ybtb yuntb cloud-sync gist',
  exportOpenTabsList: 'biaoqian tabs list copy export open',
  saveWorkspaceNow: 'baocun gongzuoqu save workspace now layout',
  syncNow: 'sync now tongbu',
  folderSync: 'tongbu wenjianjia sync folder wjjtb folder-sync'
}

/** F4: every menu action becomes a palette entry; both languages and the action id are searchable. */
/** Palette-only actions (not a second menu row). */
export const PALETTE_EXTRAS: ReadonlyArray<{ id: MenuAction; zh: string; en: string }> = [
  { id: 'openProdGuard', zh: '生产防护…', en: 'Production guard…' },
  { id: 'setJumpHosts', zh: '为当前连接设置跳板机…', en: 'Set jump hosts for this connection…' },
  { id: 'checkCerts', zh: '检查密钥与证书…', en: 'Check keys and certificates…' },
  { id: 'knownHosts', zh: '主机密钥与本机密钥…', en: 'Known hosts & local keys…' },
  { id: 'importSshConfig', zh: '导入 OpenSSH config…', en: 'Import OpenSSH config…' },
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
  { id: 'explainSelection', zh: '解释选区', en: 'Explain selection' },
  { id: 'diffFixPlaybook', zh: '从差异生成修复剧本', en: 'Draft fix playbook from diff' },
  { id: 'reconnectPolicy', zh: '重连策略…', en: 'Reconnect policy…' },
  { id: 'reconnectNow', zh: '立即重连当前会话', en: 'Reconnect current session now' },
  { id: 'reconnectAllDropped', zh: '重连全部已断开的会话', en: 'Reconnect all dropped sessions' },
  { id: 'askAgain', zh: '重新提问（填回上次问题）', en: 'Ask again (fill last question)' },
  { id: 'readonlyOn', zh: '开启只读会话', en: 'Enable read-only session' },
  { id: 'readonlyOff', zh: '关闭只读会话', en: 'Disable read-only session' },
  { id: 'setProtection', zh: '设置保护级别…', en: 'Set protection level…' },
  { id: 'batchConnect', zh: '连接所选主机', en: 'Connect selected hosts' },
  { id: 'batchConnectGroup', zh: '连接当前分组的主机', en: 'Connect hosts in the current group' },
  { id: 'builtinSnippets', zh: '内置片段示例', en: 'Built-in snippets' },
  { id: 'builtinPlaybooks', zh: '内置示例剧本', en: 'Built-in sample playbooks' }
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
