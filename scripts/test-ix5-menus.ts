/** IX-5: ⋯ and contextmenu share one builder. Pure Node, no host rg. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { placeMenu } from '../src/shared/menu-place'
import {
  HEALTH_CARD_HAS_OVERFLOW,
  alertMenuItems,
  buildAlertRowMenu,
  buildHealthCardMenu,
  buildHostMenu,
  buildTabMenu,
  healthMenuItems,
  hostMenuItems,
  menuItemIds,
  placeDanger,
  tabMenuItems,
  type AlertMenuCtx,
  type BuiltNode,
  type HostMenuCtx,
  type MenuEntry,
  type TabMenuCtx
} from '../src/shared/inline-menus'

function shape(nodes: readonly BuiltNode[]): string[] {
  return nodes.map((node) => {
    if (node.type === 'sep') return 'sep'
    if (node.type === 'empty') return `empty:${node.id}`
    return `${node.id}${node.type === 'item' && node.danger ? '*' : ''}`
  })
}

function assertDangerTail(nodes: readonly BuiltNode[], label: string): void {
  const firstDanger = nodes.findIndex((node) => node.type === 'item' && node.danger)
  if (firstDanger < 0) return
  assert.equal(nodes[firstDanger - 1]?.type, 'sep', `${label} separator sits above danger`)
  for (const node of nodes.slice(firstDanger)) {
    assert.equal(node.type, 'item', `${label} only danger items after the separator`)
    assert.equal(node.type === 'item' && node.danger, true, `${label} tail is danger`)
  }
}

function sameEntry(left: readonly BuiltNode[], right: readonly BuiltNode[], label: string): void {
  assert.deepEqual(menuItemIds(left), menuItemIds(right), `${label} item ids`)
  assert.deepEqual(shape(left), shape(right), `${label} order and danger`)
  assertDangerTail(left, label)
  assertDangerTail(right, label)
}

const hostSingle: HostMenuCtx = {
  selection: 'single',
  count: 1,
  demo: true,
  currentFolderId: 'ops',
  folders: [{ id: 'ops', name: 'Ops' }]
}
const hostMulti: HostMenuCtx = {
  selection: 'multi',
  count: 3,
  folders: [{ id: 'ops', name: 'Ops' }]
}
for (const ctx of [hostSingle, hostMulti]) {
  sameEntry(hostMenuItems(ctx, 'overflow'), hostMenuItems(ctx, 'context'), `host ${ctx.selection}`)
  assert.deepEqual(menuItemIds(hostMenuItems(ctx, 'overflow')), menuItemIds(buildHostMenu(ctx)))
}
const hostIds = menuItemIds(buildHostMenu(hostSingle))
assert.ok(hostIds.includes('move-to:ops'))
assert.equal(hostIds.at(-1), 'delete')
const hostTop = buildHostMenu(hostSingle).filter((node) => node.type !== 'sep' && node.type !== 'empty').map((node) => node.id)
assert.equal(hostTop.at(-1), 'delete')
const hostDelete = buildHostMenu(hostSingle).find((node) => node.type === 'item' && node.id === 'delete')
assert.equal(hostDelete && hostDelete.type === 'item' ? hostDelete.danger : false, true)

const tabCtx: TabMenuCtx = {
  pinned: true,
  readOnlyOn: false,
  canDuplicate: true,
  canSessionTools: true,
  canForward: false,
  closeOthersDisabled: false,
  closeRightDisabled: true
}
sameEntry(tabMenuItems(tabCtx, 'overflow'), tabMenuItems(tabCtx, 'context'), 'tab')
assert.deepEqual(menuItemIds(tabMenuItems(tabCtx, 'context')), menuItemIds(buildTabMenu(tabCtx)))
const tabTop = buildTabMenu(tabCtx).filter((node) => node.type === 'item').map((node) => node.id)
assert.deepEqual(tabTop.slice(-3), ['closeOthers', 'closeRight', 'close'])

const alertFull: AlertMenuCtx = {
  fix: true,
  markDone: true,
  ignore: true,
  board: true,
  maintenance: true,
  canResolve: true,
  fixDisabled: false,
  fixTitle: '需要先配置 AI'
}
const alertNoFix: AlertMenuCtx = { ...alertFull, fix: false }
for (const ctx of [alertFull, alertNoFix]) {
  sameEntry(alertMenuItems(ctx, 'overflow'), alertMenuItems(ctx, 'context'), ctx.fix ? 'alert fix' : 'alert omit')
}
const fixIds = menuItemIds(alertMenuItems(alertFull, 'overflow'))
const omitIds = menuItemIds(alertMenuItems(alertNoFix, 'context'))
assert.ok(fixIds.includes('w1-row-fix'))
assert.equal(omitIds.includes('w1-row-fix'), false)
assert.equal(menuItemIds(alertMenuItems(alertNoFix, 'overflow')).includes('w1-row-fix'), false)
const fixItem = buildAlertRowMenu(alertFull).find((node) => node.type === 'item' && node.id === 'w1-row-fix')
assert.equal(fixItem && fixItem.type === 'item' ? fixItem.labelKey : '', 'w1.create')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'w1\.create': '生成修复剧本'/)

assert.equal(HEALTH_CARD_HAS_OVERFLOW, false)
assert.deepEqual(healthMenuItems('overflow'), [])
assert.deepEqual(menuItemIds(healthMenuItems('context')), menuItemIds(buildHealthCardMenu()))
assert.deepEqual(menuItemIds(buildHealthCardMenu()), ['monitor', 'connect', 'workbench', 'guard'])

const moved = placeDanger([
  { type: 'item', id: 'a' },
  { type: 'item', id: 'gone', danger: true },
  { type: 'sep' },
  { type: 'item', id: 'b' },
  { type: 'item', id: 'also', danger: true }
])
assert.deepEqual(shape(moved), ['a', 'sep', 'b', 'sep', 'gone*', 'also*'])

const entries: MenuEntry[] = ['overflow', 'context']
assert.deepEqual(entries, ['overflow', 'context'])

const flip = placeMenu(24, 740, 220, 280, 1366, 768)
assert.ok(flip.y < 740, 'menu flips up near the bottom edge')
assert.ok(flip.y >= 8)
assert.ok(flip.y + 280 <= 768 - 8)
assert.ok(flip.x >= 8 && flip.x + 220 <= 1366 - 8)
const right = placeMenu(1300, 40, 220, 200, 1366, 768)
assert.ok(right.x + 220 <= 1366 - 8)
assert.ok(right.y >= 8 && right.y + 200 <= 768 - 8)

const menus = readFileSync('src/shared/inline-menus.ts', 'utf8')
const branch = readFileSync('src/renderer/src/components/SessionDockerBranch.tsx', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const alertLine = readFileSync('src/renderer/src/components/AlertLine.tsx', 'utf8')
const home = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
const built = readFileSync('src/renderer/src/components/BuiltMenu.tsx', 'utf8')
const ctxMenu = readFileSync('src/renderer/src/components/ContextMenu.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
const changelog = readFileSync('CHANGELOG.md', 'utf8')

function fnBody(source: string, name: string, next: string): string {
  const start = source.indexOf(`export function ${name}`)
  const end = source.indexOf(`export function ${next}`)
  assert.ok(start >= 0 && end > start, name)
  return source.slice(start, end)
}

for (const [name, next, builder] of [
  ['hostMenuItems', 'buildTabMenu', 'buildHostMenu'],
  ['tabMenuItems', 'buildAlertRowMenu', 'buildTabMenu'],
  ['alertMenuItems', 'buildHealthCardMenu', 'buildAlertRowMenu']
] as const) {
  const body = fnBody(menus, name, next)
  assert.match(body, new RegExp(`return ${builder}\\(`))
  assert.doesNotMatch(body, /entry === ['"]overflow['"]/)
  assert.doesNotMatch(body, /entry === ['"]context['"]/)
}

assert.match(branch, /data-testid="host-row-more"/)
assert.match(branch, /onOpenMenu\(e, 'overflow'\)/)
assert.match(branch, /onOpenMenu\(e, 'context'\)/)
assert.doesNotMatch(branch, /item\('connect'/)
assert.match(app, /hostMenuItems\(ctx, sessionMenu\.entry\)/)
assert.match(app, /onOpenMenu=\{\(e, entry\)/)
assert.match(app, /data-testid="tab-row-more"/)
assert.match(app, /entry: 'overflow'/)
assert.match(app, /entry: 'context'/)
assert.match(app, /tabMenuItems\(ctx, tabMenu\.entry\)/)
assert.match(alertLine, /alertMenuItems\(rowCtx, entry\)/)
assert.match(alertLine, /openRowMenu\(e, 'context'\)/)
assert.match(alertLine, /'overflow'/)
assert.match(home, /healthMenuItems\(menu\.entry\)/)
assert.match(home, /data-overflow="none"/)
assert.match(home, /entry: 'context'/)
const card = home.slice(home.indexOf('data-testid="l7-card"'), home.indexOf('CardMetrics'))
assert.equal(card.includes('⋯'), false)
assert.match(built, /placeMenu\(/)
assert.match(built, /createPortal\(/)
assert.match(ctxMenu, /placeMenu\(/)
assert.match(features, /\.tab-context-menu button\.danger\s*\{[^}]*color:\s*var\(--danger\)/)
assert.match(styles, /\.session-context-menu-item\.danger\s*\{[^}]*color:\s*var\(--danger\)/)
assert.match(features, /\.ctx-menu-item > button\.danger\s*\{[^}]*color:\s*var\(--danger\)/)
assert.match(features, /\.tab-context-menu\s*\{[^}]*position:\s*fixed/)
assert.match(features, /\.tab-context-menu\s*\{[^}]*max-height:\s*calc\(100vh - 16px\)/)
assert.match(styles, /\.session-context-menu\s*\{[^}]*position:\s*fixed/)
assert.match(styles, /\.session-context-menu\s*\{[^}]*max-height:\s*calc\(100vh - 16px\)/)

assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-ix5-menus\.ts/)
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
/** Title line only (`- **…（IX-N）.**`). A body cross-ref must not count. */
function unreleasedBulletAt(section: string, id: string): number {
  const m = new RegExp(`^- \\*\\*[^\\n*]*（${id}）`, 'm').exec(section)
  return m ? m.index : -1
}
const ix5 = unreleasedBulletAt(unreleased, 'IX-5')
const ix3 = unreleasedBulletAt(unreleased, 'IX-3')
assert.ok(ix5 >= 0 && ix3 > ix5, 'IX-5 sits in Unreleased ahead of IX-3')
const prefix = '- **占位（IX-9）.** 正文里的 IX-5 与 IX-3 不能当成标题。\n'
const poisoned = prefix + unreleased
assert.equal(unreleasedBulletAt(poisoned, 'IX-5'), prefix.length + ix5)
assert.equal(unreleasedBulletAt(poisoned, 'IX-3'), prefix.length + ix3)
assert.ok(poisoned.indexOf('IX-5') < unreleasedBulletAt(poisoned, 'IX-5'))
const bullet = unreleased.slice(ix5, ix3)
assert.match(bullet, /Public HOLD/)
assert.match(bullet, /0\.4\.4/)
assert.match(bullet, /buildHostMenu/)
assert.match(bullet, /buildTabMenu/)
assert.match(bullet, /buildAlertRowMenu/)
assert.match(bullet, /buildHealthCardMenu/)

console.log('test-ix5-menus ok')
