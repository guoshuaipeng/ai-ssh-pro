/** PNG-6: import success strip and the first-connect hint. Non-blocking, remembered separately. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRODUCT_OVERLAY_ORDER } from '../src/shared/overlay-stack'
import {
  FIRST_CONNECT_OFF_KEY,
  FIRST_CONNECT_SEEN_KEY,
  IMPORT_HINT_OFF_KEY,
  decideFirstConnect,
  importedConnectIds,
  loadPrefFlag,
  pickValueMoment,
  savePrefFlag,
  shouldShowImportMoment,
  valueMomentBlockedByProduct,
  valueMomentDismissWrites
} from '../src/shared/value-moment'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

function memoryStore() {
  const mem = new Map<string, string>()
  return {
    getItem: (key: string) => (mem.has(key) ? mem.get(key)! : null),
    setItem: (key: string, value: string) => {
      mem.set(key, value)
    }
  }
}

function applyWrites(store: ReturnType<typeof memoryStore>, kind: 'import' | 'firstConnect', how: 'never' | 'later') {
  for (const write of valueMomentDismissWrites(kind, how)) savePrefFlag(write.key, write.on, store)
}

assert.equal(IMPORT_HINT_OFF_KEY === FIRST_CONNECT_OFF_KEY, false)
assert.equal(IMPORT_HINT_OFF_KEY === FIRST_CONNECT_SEEN_KEY, false)
assert.equal(FIRST_CONNECT_OFF_KEY === FIRST_CONNECT_SEEN_KEY, false)

assert.equal(zh('png.imported', { n: 3 }), '已导入 3 台')
assert.equal(en('png.imported', { n: 3 }), 'Imported 3 hosts')
assert.equal(zh('png.connectAll'), '全部连接')
assert.equal(zh('png.view'), '查看')
assert.equal(zh('png.never'), '不再提示')
assert.equal(zh('png.openHome'), '打开运维首页')
assert.equal(zh('png.openSftp'), '打开 SFTP')
assert.ok(zh('png.firstBody').includes('运维首页'))

assert.equal(shouldShowImportMoment({ count: 4, off: false }), true)
assert.equal(shouldShowImportMoment({ count: 0, off: false }), false)
assert.equal(shouldShowImportMoment({ count: 2, off: true }), false)

assert.equal(pickValueMoment({ importCount: 4, firstConnect: true, blocked: false }), 'import')
assert.equal(pickValueMoment({ importCount: null, firstConnect: true, blocked: false }), 'firstConnect')
assert.equal(pickValueMoment({ importCount: 2, firstConnect: true, blocked: true }), null)
assert.equal(pickValueMoment({ importCount: 0, firstConnect: false, blocked: false }), null)

for (const id of PRODUCT_OVERLAY_ORDER) {
  assert.equal(valueMomentBlockedByProduct(id), true, `${id} hides the strip`)
}
assert.equal(valueMomentBlockedByProduct(null), false)

const fresh = memoryStore()
assert.equal(decideFirstConnect({ fresh: true, off: false, seen: false }), 'show')
applyWrites(fresh, 'firstConnect', 'later')
assert.equal(loadPrefFlag(FIRST_CONNECT_SEEN_KEY, fresh), true)
assert.equal(loadPrefFlag(FIRST_CONNECT_OFF_KEY, fresh), false)
assert.equal(loadPrefFlag(IMPORT_HINT_OFF_KEY, fresh), false)
assert.equal(
  decideFirstConnect({
    fresh: true,
    off: loadPrefFlag(FIRST_CONNECT_OFF_KEY, fresh),
    seen: loadPrefFlag(FIRST_CONNECT_SEEN_KEY, fresh)
  }),
  'ignore'
)

const neverConnect = memoryStore()
applyWrites(neverConnect, 'firstConnect', 'never')
assert.equal(loadPrefFlag(FIRST_CONNECT_OFF_KEY, neverConnect), true)
assert.equal(loadPrefFlag(FIRST_CONNECT_SEEN_KEY, neverConnect), true)
assert.equal(
  decideFirstConnect({
    fresh: true,
    off: loadPrefFlag(FIRST_CONNECT_OFF_KEY, neverConnect),
    seen: loadPrefFlag(FIRST_CONNECT_SEEN_KEY, neverConnect)
  }),
  'ignore'
)

const imports = memoryStore()
applyWrites(imports, 'import', 'later')
assert.equal(loadPrefFlag(IMPORT_HINT_OFF_KEY, imports), false)
assert.equal(shouldShowImportMoment({ count: 2, off: loadPrefFlag(IMPORT_HINT_OFF_KEY, imports) }), true)
applyWrites(imports, 'import', 'never')
assert.equal(loadPrefFlag(IMPORT_HINT_OFF_KEY, imports), true)
assert.equal(loadPrefFlag(FIRST_CONNECT_OFF_KEY, imports), false)
assert.equal(shouldShowImportMoment({ count: 2, off: loadPrefFlag(IMPORT_HINT_OFF_KEY, imports) }), false)

assert.equal(decideFirstConnect({ fresh: false, off: false, seen: false }), 'stamp')
assert.deepEqual(
  importedConnectIds({ beforeIds: ['a'], afterIds: ['a', 'b', 'c'], policy: 'copy', conflictIds: ['a'] }),
  ['b', 'c']
)

const bar = readFileSync('src/renderer/src/components/ValueMomentBar.tsx', 'utf8')
const importBranch = bar.slice(bar.indexOf("kind === 'import'"), bar.indexOf(') : ('))
const connectBranch = bar.slice(bar.indexOf(') : ('), bar.indexOf('png-never'))
assert.equal((importBranch.match(/className="primary"/g) ?? []).length, 1)
assert.equal((connectBranch.match(/className="primary"/g) ?? []).length, 1)
assert.ok(importBranch.includes('png-connect-all') && importBranch.includes('png-view'))
assert.ok(importBranch.includes('className="secondary"') && importBranch.includes('png.view'))
assert.ok(connectBranch.includes('png-open-home') && connectBranch.includes('className="primary"'))
assert.ok(connectBranch.includes('png-open-sftp') && connectBranch.includes('className="secondary"'))
assert.ok(bar.includes('role="status"') && bar.includes('png-never'))
assert.equal(bar.includes('Modal'), false)
assert.equal(bar.includes('modal-backdrop'), false)
assert.equal(bar.includes('data-product-layer'), false)

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
const strip = css.slice(css.indexOf('.value-moment {'), css.indexOf('.value-moment-text'))
const actions = css.slice(css.indexOf('.value-moment-actions {'), css.indexOf('.value-moment-actions > button'))
assert.match(strip, /flex-wrap:\s*nowrap/)
assert.match(strip, /min-width:\s*0/)
assert.match(strip, /max-height:\s*40px/)
assert.match(strip, /overflow:\s*hidden/)
assert.match(strip, /background:\s*var\(--color-info-muted\)/)
assert.doesNotMatch(strip, /position:\s*fixed/)
assert.match(css, /\.value-moment-text\s*\{[^}]*white-space:\s*nowrap/)
assert.match(css, /\.value-moment-text\s*\{[^}]*text-overflow:\s*ellipsis/)
assert.match(actions, /flex-wrap:\s*nowrap/)
assert.match(actions, /overflow:\s*hidden/)
assert.doesNotMatch(actions, /overflow-x:\s*auto/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const toolbarAt = app.indexOf('<AppToolbar')
const barAt = app.indexOf('<ValueMomentBar')
const shellAt = app.indexOf('<div className="app-shell">')
assert.ok(toolbarAt >= 0 && toolbarAt < barAt && barAt < shellAt, 'the strip sits under the title bar, in flow')
assert.ok(app.includes('{valueKind ? ('))

const picked = app.slice(app.indexOf('const valueKind = pickValueMoment'), app.indexOf('onFirstConnectRef.current = () =>'))
assert.ok(picked.includes('valueMomentBlockedByProduct(product)'))
assert.equal(picked.includes("=== 'welcome'"), false)
assert.ok(app.includes('if (valueKind) return'))
assert.ok(app.includes("if (!quiet && kind !== 'local') onFirstConnectRef.current()"))

const applyAt = app.indexOf('const applyImport = useCallback')
const applyBody = app.slice(applyAt, app.indexOf('// main-process menu clicks', applyAt))
assert.ok(applyBody.includes('shouldShowImportMoment'))
assert.ok(applyBody.includes('setImportMoment'))
for (const token of ['connectProfile', 'connectMany', 'openSession', 'ssh.connect', 'openHome']) {
  assert.equal(applyBody.includes(token), false, `import success does not ${token}`)
}
const connectAll = app.slice(app.indexOf('onConnectAll={() => {'), app.indexOf('onView={() => {'))
assert.ok(connectAll.includes('connectProfile'), 'Connect all is the click, not the import')
assert.ok(app.includes("valueMomentDismissWrites(valueKind, 'never')"))
assert.ok(app.includes("valueMomentDismissWrites('firstConnect', 'later')"))
assert.equal(app.includes('window.confirm'), false)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsButtons = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.equal((opsButtons.match(/id: '/g) ?? []).length, 3, 'no new toolbar primary')

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-png6-import-value\.ts/)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
/** Title line only (`- **…（PNG-6）.**`). A body mention must not count. */
function unreleasedBulletAt(section: string, id: string): number {
  const match = new RegExp(`^- \\*\\*[^\\n*]*（${id}）`, 'm').exec(section)
  return match ? match.index : -1
}
const png6 = unreleasedBulletAt(unreleased, 'PNG-6')
const png2 = unreleasedBulletAt(unreleased, 'PNG-2')
assert.ok(png6 >= 0 && png2 > png6, 'the import-value bullet is its own Unreleased title')
const bullet = unreleased.slice(png6, png2)
const title = bullet.slice(0, bullet.indexOf('.**') + 3)
const body = bullet.slice(title.length)
assert.match(title, /^-\s\*\*[^*\n]*（PNG-6）\.\*\*/)
assert.equal(body.includes('PNG-6'), false)
for (const id of [
  'PNG-1',
  'PNG-2',
  'Polish-1',
  'Polish-2',
  'Polish-3',
  'UI-N1',
  'UI-N2',
  'UI-N5',
  'UI-N6',
  'UI-N7',
  'IX-3',
  'IX-5',
  'IX-6',
  'IX-7',
  'L9',
  'L10',
  'A6',
  'W9',
  'A-TFL',
  'A-OM',
  'A-HITL',
  'S4',
  'S15',
  'TB-1',
  'TB-2',
  'TB-3',
  'Core-A',
  'N2'
]) {
  assert.equal(body.includes(id), false, `${id} stays out of the bullet body`)
}
assert.match(bullet, /已导入 N 台/)
assert.match(bullet, /全部连接/)
assert.match(bullet, /不再提示/)
assert.match(bullet, /打开运维首页/)
assert.match(bullet, /Public HOLD/)
assert.match(bullet, /0\.4\.4/)

console.log('test-png6-import-value ok')
