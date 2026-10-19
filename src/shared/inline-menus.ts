/**
 * IX-5: host tree, tab strip, alert rows, and health cards build the ⋯ menu
 * and the right-click menu from one function. Entry does not change the items.
 * Danger items sit at the bottom, under a single separator.
 */

export type MenuEntry = 'overflow' | 'context'

export type BuiltItem = {
  type: 'item'
  id: string
  labelKey?: string
  /** Literal label. Folder names are not i18n keys. */
  label?: string
  labelVars?: Record<string, string | number>
  danger?: boolean
  disabled?: boolean
  hint?: string
  hintKey?: string
  title?: string
  titleKey?: string
  testId?: string
}

export type BuiltEmpty = {
  type: 'empty'
  id: string
  labelKey?: string
  label?: string
}

export type BuiltSub = {
  type: 'sub'
  id: string
  labelKey: string
  children: Array<BuiltItem | BuiltEmpty>
}

export type BuiltSep = { type: 'sep' }

export type BuiltNode = BuiltItem | BuiltSub | BuiltSep | BuiltEmpty

export type HostFolderRef = { id: string; name: string }

export type HostMenuCtx = {
  selection: 'single' | 'multi'
  count: number
  demo?: boolean
  currentFolderId?: string
  folders: HostFolderRef[]
}

export type TabMenuCtx = {
  pinned: boolean
  readOnlyOn: boolean
  canDuplicate: boolean
  canSessionTools: boolean
  canForward: boolean
  closeOthersDisabled: boolean
  closeRightDisabled: boolean
}

export type AlertMenuCtx = {
  fix: boolean
  markDone: boolean
  ignore: boolean
  board: boolean
  maintenance: boolean
  canResolve: boolean
  fixDisabled?: boolean
  fixTitle?: string
}

/** Health cards have no ⋯. The right-click menu still uses buildHealthCardMenu. */
export const HEALTH_CARD_HAS_OVERFLOW = false

function moveSub(ctx: HostMenuCtx): BuiltSub {
  const single = ctx.selection === 'single'
  const children: Array<BuiltItem | BuiltEmpty> = [
    {
      type: 'item',
      id: 'move-to:ungrouped',
      labelKey: 'app.ungrouped',
      disabled: single && !ctx.currentFolderId
    }
  ]
  if (ctx.folders.length === 0) {
    children.push({ type: 'empty', id: 'move-empty', labelKey: 'app.noFolders' })
  } else {
    for (const folder of ctx.folders) {
      children.push({
        type: 'item',
        id: `move-to:${folder.id}`,
        label: folder.name,
        disabled: single && ctx.currentFolderId === folder.id
      })
    }
  }
  return { type: 'sub', id: 'move', labelKey: 'app.moveTo', children }
}

function levelSub(): BuiltSub {
  return {
    type: 'sub',
    id: 'setLevel',
    labelKey: 'l4.setLevel',
    children: [
      { type: 'item', id: 'set-level:normal', labelKey: 'l4.normal' },
      { type: 'item', id: 'set-level:production', labelKey: 'l4.production' },
      { type: 'item', id: 'set-level:readonly', labelKey: 'l4.readonly' }
    ]
  }
}

/** Move danger items to the bottom. One separator sits immediately above the first of them. */
export function placeDanger(nodes: readonly BuiltNode[]): BuiltNode[] {
  const safe: BuiltNode[] = []
  const danger: BuiltItem[] = []
  for (const node of nodes) {
    if (node.type === 'item' && node.danger) danger.push(node)
    else safe.push(node)
  }
  const collapsed: BuiltNode[] = []
  for (const node of safe) {
    if (node.type === 'sep' && (collapsed.length === 0 || collapsed[collapsed.length - 1]?.type === 'sep')) continue
    collapsed.push(node)
  }
  while (collapsed.length && collapsed[collapsed.length - 1]?.type === 'sep') collapsed.pop()
  if (!danger.length) return collapsed
  if (!collapsed.length) return danger
  return [...collapsed, { type: 'sep' }, ...danger]
}

export function menuItemIds(nodes: readonly BuiltNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.type === 'sep' || node.type === 'empty') continue
    ids.push(node.id)
    if (node.type === 'sub') {
      for (const child of node.children) {
        if (child.type === 'empty') continue
        ids.push(child.id)
      }
    }
  }
  return ids
}

export function buildHostMenu(ctx: HostMenuCtx): BuiltNode[] {
  if (ctx.selection === 'multi') {
    return placeDanger([
      { type: 'item', id: 'connectAll', labelKey: 'ctx.connectAll', labelVars: { n: ctx.count } },
      { type: 'item', id: 'maint', labelKey: 'l2d.openForSelected' },
      { type: 'item', id: 'batch', labelKey: 'ctx.batch' },
      { type: 'item', id: 'monitorBoard', labelKey: 'host.menu.boardN', labelVars: { n: ctx.count } },
      levelSub(),
      moveSub(ctx),
      { type: 'sep' },
      { type: 'item', id: 'delete', labelKey: 'ctx.deleteMany', labelVars: { n: ctx.count }, danger: true, hint: 'Del' }
    ])
  }
  return placeDanger([
    { type: 'item', id: 'connect', labelKey: 'app.connect', hint: 'Enter' },
    { type: 'item', id: 'connectNew', labelKey: 'ctx.connectNewTab' },
    { type: 'sep' },
    { type: 'item', id: 'sftp', labelKey: 'ctx.sftp' },
    { type: 'item', id: 'monitor', labelKey: 'ctx.monitor' },
    { type: 'item', id: 'toolbox', labelKey: 'ctx.toolbox' },
    { type: 'sep' },
    {
      type: 'item',
      id: 'edit',
      labelKey: 'ctx.edit',
      disabled: Boolean(ctx.demo),
      hintKey: ctx.demo ? 'g1.readOnly' : undefined
    },
    { type: 'item', id: 'maint', labelKey: 'l2d.openForHost' },
    { type: 'item', id: 'profile', labelKey: 'host.menu.inventory', titleKey: 'host.menu.inventoryTip' },
    { type: 'item', id: 'tags', labelKey: 'ctx.tags' },
    { type: 'item', id: 'rename', labelKey: 'ctx.rename', hint: 'F2' },
    moveSub(ctx),
    { type: 'item', id: 'copyAddr', labelKey: 'ctx.copyAddr' },
    { type: 'sep' },
    { type: 'item', id: 'delete', labelKey: 'app.delete', danger: true, hint: 'Del' }
  ])
}

export function hostMenuItems(ctx: HostMenuCtx, entry: MenuEntry): BuiltNode[] {
  void entry
  return buildHostMenu(ctx)
}

export function buildTabMenu(ctx: TabMenuCtx): BuiltNode[] {
  return placeDanger([
    {
      type: 'item',
      id: 'readonly',
      labelKey: ctx.readOnlyOn ? 's4.offSession' : 's4.onSession',
      testId: 's4-session-toggle'
    },
    { type: 'item', id: 'pin', labelKey: ctx.pinned ? 'tab.unpin' : 'tab.pin', testId: 'tab-pin' },
    { type: 'item', id: 'rename', labelKey: 'tab.rename' },
    { type: 'item', id: 'duplicate', labelKey: 'tab.duplicate', disabled: !ctx.canDuplicate },
    { type: 'sep' },
    { type: 'item', id: 'sftp', labelKey: 'ctx.sftp', disabled: !ctx.canSessionTools },
    { type: 'item', id: 'monitor', labelKey: 'menu.resourceMonitor', disabled: !ctx.canSessionTools },
    { type: 'item', id: 'forward', labelKey: 'menu.portForward', disabled: !ctx.canForward },
    { type: 'sep' },
    {
      type: 'item',
      id: 'closeOthers',
      labelKey: 'tab.closeOthers',
      hintKey: 'tab.closeOthersKeep',
      disabled: ctx.closeOthersDisabled,
      danger: true,
      testId: 'tab-close-others'
    },
    {
      type: 'item',
      id: 'closeRight',
      labelKey: 'tab.closeRight',
      disabled: ctx.closeRightDisabled,
      danger: true,
      testId: 'tab-close-right',
      titleKey: ctx.closeRightDisabled ? 'tab.closeRightDisabled' : undefined
    },
    { type: 'item', id: 'close', labelKey: 'tab.close', danger: true }
  ])
}

export function tabMenuItems(ctx: TabMenuCtx, entry: MenuEntry): BuiltNode[] {
  void entry
  return buildTabMenu(ctx)
}

export function buildAlertRowMenu(ctx: AlertMenuCtx): BuiltNode[] {
  const nodes: BuiltNode[] = []
  if (ctx.fix) {
    nodes.push({
      type: 'item',
      id: 'w1-row-fix',
      labelKey: 'w1.create',
      disabled: ctx.fixDisabled,
      title: ctx.fixTitle
    })
  }
  if (ctx.markDone) {
    nodes.push({
      type: 'item',
      id: 'w1-row-done',
      labelKey: 'w1.rowMenu.markDone',
      disabled: !ctx.canResolve
    })
  }
  if (ctx.ignore) {
    nodes.push({
      type: 'item',
      id: 'w1-row-ignore',
      labelKey: 'w1.rowMenu.ignore',
      disabled: !ctx.canResolve
    })
  }
  nodes.push({ type: 'sep' })
  if (ctx.board) nodes.push({ type: 'item', id: 'w1-row-board', labelKey: 'w1.rowMenu.board' })
  if (ctx.maintenance) nodes.push({ type: 'item', id: 'l2d-row', labelKey: 'l2d.openForHost' })
  nodes.push({ type: 'item', id: 'w1-row-copy', labelKey: 'w1.rowMenu.copy' })
  return placeDanger(nodes)
}

export function alertMenuItems(ctx: AlertMenuCtx, entry: MenuEntry): BuiltNode[] {
  void entry
  return buildAlertRowMenu(ctx)
}

export function buildHealthCardMenu(): BuiltNode[] {
  return [
    { type: 'item', id: 'monitor', labelKey: 'menu.resourceMonitor' },
    { type: 'item', id: 'connect', labelKey: 'l7.connect' },
    { type: 'item', id: 'workbench', labelKey: 'l7.viewInWorkbench' },
    { type: 'item', id: 'guard', labelKey: 'l4.menu' }
  ]
}

export function healthMenuItems(entry: MenuEntry): BuiltNode[] {
  if (!HEALTH_CARD_HAS_OVERFLOW && entry === 'overflow') return []
  return buildHealthCardMenu()
}
