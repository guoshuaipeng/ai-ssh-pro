/** v0.4.3 completion: W1b, UX-12b, UX-50b, UX-39b, UX-19b. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { DEMO_PROFILE_ID, demoProfileLabel, labelForSessionExport, profileDisplayLabel } from '../src/shared/demo-host'
import { ICON_NAMES } from '../src/shared/icon-registry'
import { placeMenu } from '../src/shared/menu-place'
import { isExplicitEmptyWorkspace, RESTORE_BIND_MS, workspaceRestoreRows } from '../src/shared/session-restore'
import { loadLastWorkspace, saveLastWorkspace } from '../src/shared/startup-pref'

const read = (p: string) => readFileSync(p, 'utf8')
const pkg = JSON.parse(read('package.json')) as { version: string; build: { win: Record<string, unknown> } }
const changelog = read('CHANGELOG.md').replace(/\r\n/g, '\n')
const app = read('src/renderer/src/App.tsx')
const alertLine = read('src/renderer/src/components/AlertLine.tsx')
const workbench = read('src/renderer/src/components/AlertWorkbenchTab.tsx')
const card = read('src/renderer/src/components/AiAssistCard.tsx')
const zh = read('src/renderer/src/lib/i18n.tsx')
const css = read('src/renderer/src/features.css')
const styles = read('src/renderer/src/styles.css')
const main = read('src/main/index.ts')

assert.equal(pkg.version, '0.6.57')
assert.equal('fileVersion' in pkg.build.win, false)
assert.ok(changelog.includes('## v0.4.3\n'))
assert.ok(changelog.includes('## v0.4.2\n'))
assert.ok(changelogFor('0.4.3').length >= 4)
assert.ok(ICON_NAMES.length >= 30 && ICON_NAMES.length <= 40)

const demo = { id: DEMO_PROFILE_ID, label: '演示主机 (demo)', host: 'demo.ai-ssh-pro.local', username: 'demo' }
assert.equal(profileDisplayLabel(demo, 'zh-CN'), '演示主机 (demo)')
assert.equal(profileDisplayLabel(demo, 'en'), 'Demo host (demo)')
assert.equal(profileDisplayLabel({ ...demo, demoRenamed: true, label: 'My lab' }, 'en'), 'My lab')
assert.equal(profileDisplayLabel({ ...demo, demoRenamed: true, label: 'My lab' }, 'zh-CN'), 'My lab')
assert.equal(labelForSessionExport({ id: DEMO_PROFILE_ID, label: 'stored' }, 'en'), demoProfileLabel('en'))
assert.equal(labelForSessionExport({ id: DEMO_PROFILE_ID, label: 'My lab', demoRenamed: true }, 'zh-CN'), 'My lab')
assert.equal(labelForSessionExport({ id: 'other', label: 'web01' }, 'en'), 'web01')
assert.ok(main.includes('labelForSessionExport'))
assert.ok(app.includes('demoRenamed: true'))
assert.ok(app.includes("tg('tab.none')"), 'empty-tab paths toast tab.none')
assert.ok(!app.includes("tr('tab.none')"), 'no legacy tr(tab.none)')

const mem = () => {
  const bag = new Map<string, string>()
  return {
    getItem: (k: string) => bag.get(k) ?? null,
    setItem: (k: string, v: string) => {
      bag.set(k, v)
    }
  }
}
const store = mem()
saveLastWorkspace({ profileIds: [], tabs: [] }, store)
const emptied = loadLastWorkspace(store)
assert.equal(isExplicitEmptyWorkspace(emptied), true)
assert.deepEqual(workspaceRestoreRows(emptied, (id) => id), [])

const legacyStore = mem()
legacyStore.setItem('aiss.startup.last.v1', JSON.stringify({ profileIds: ['p1'] }))
const legacy = loadLastWorkspace(legacyStore)
assert.equal(isExplicitEmptyWorkspace(legacy), false)
assert.equal(workspaceRestoreRows(legacy, (id) => `name:${id}`)[0]?.profileId, 'p1')
assert.equal(workspaceRestoreRows(legacy, (id) => `name:${id}`)[0]?.kind, 'terminal')

const fresh = loadLastWorkspace(mem())
assert.equal(isExplicitEmptyWorkspace(fresh), false)

assert.equal(RESTORE_BIND_MS, 20_000)
assert.ok(app.includes('workspaceRestoreRows'))
assert.ok(app.includes('isExplicitEmptyWorkspace'))
assert.ok(app.includes('if (!workspaceReady.current)'))
assert.ok(app.includes('saveLastWorkspace({ profileIds: snapshot.length ? ids : [], tabs: snapshot })'))
const wake = app.slice(app.indexOf('reconnectTabRef.current(term.tabId)'), app.indexOf('reconnectTabRef.current(term.tabId)') + 280)
assert.ok(wake.includes('.then((sid)'))
assert.ok(!wake.includes('tabsRef'))
assert.ok(app.includes("tg('restore.reconnecting')") && app.includes("tg('restore.failed')"))
assert.ok(app.includes('data-testid="restore-connecting"') && app.includes('name="refresh-cw"'))
assert.ok(css.includes('.restore-connecting') && css.includes('align-items: center') && css.includes('justify-content: center'))

const rowMenus = readFileSync('src/shared/inline-menus.ts', 'utf8')
assert.ok(alertLine.includes("t('w1.create')") && alertLine.includes('onContextMenu') && alertLine.includes('alertMenuItems'))
assert.ok(rowMenus.includes('w1-row-fix') && rowMenus.includes('w1-row-done') && rowMenus.includes('w1-row-ignore') && rowMenus.includes('w1-row-board') && rowMenus.includes('w1-row-copy'))
assert.ok(alertLine.includes('data-testid="w1-row-locate"') && alertLine.includes('data-testid="w1-row-explain"') && alertLine.includes('name="crosshair"'))
assert.ok(workbench.includes('onNeedAi?.()') && workbench.indexOf('if (!aiConfigured)') < workbench.indexOf('fixesFor('))
assert.ok(workbench.includes('if (fixes) return') && workbench.includes('setHighlightCreate(true)'))
assert.ok(card.includes('data-testid="w1-after-interpret"') && card.includes('is-highlight'))
assert.ok(zh.includes("'w1.needAi': '需要先配置 AI'") && zh.includes("'w1.configure': '配置 AI…'"))
assert.ok(zh.includes("'w1.create': '生成修复剧本'") && zh.includes("'w1.afterInterpret': '解读完成，可生成剧本'"))
assert.ok(css.includes('min-width: 200px') && css.includes('white-space: nowrap'))
assert.ok(css.includes('.alert-line-btn {') && css.includes('width: 28px'))

assert.ok(rowMenus.includes('host.menu.inventory') && rowMenus.includes('host.menu.inventoryTip') && rowMenus.includes('host.menu.boardN'))
assert.ok(app.includes('hostMenuItems'))
assert.ok(zh.includes("'host.menu.inventory': '档案与备注'") && zh.includes("'host.menu.inventory': 'Profile & notes'"))
assert.ok(zh.includes("'host.menu.boardN': '在看板中监控 ({n})'") && zh.includes("'host.menu.boardN': 'Monitor on board ({n})'"))
assert.ok(styles.includes('max-height: calc(100vh - 16px)') && styles.includes('overflow: auto'))
const flipped = placeMenu(10, 740, 220, 400, 1366, 768)
assert.ok(flipped.y + 400 <= 768 - 8)
assert.equal(flipped.x, 10)

console.log('test-v043 ok')
