/** Polish-1 补刀: PNG-1 overlay stack, PNG-2 ops menu, PNG-6 value moment, N2 primary. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS, visibleActionIds, visibleMenuItems } from '../src/shared/menus'
import { escProductTarget, pickProductOverlay, shouldOfferTourAfterWelcome } from '../src/shared/overlay-stack'
import { decideFirstConnect, importedConnectIds, pickValueMoment } from '../src/shared/value-moment'
import { estimatedMenuHeight, placeMenuDropdown } from '../src/shared/menu-fit'
import { buildPaletteEntries } from '../src/renderer/src/lib/palette'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)

assert.equal(
  pickProductOverlay({
    releaseNotes: true,
    welcome: true,
    tour: true,
    tourExplicit: true,
    quickStart: true,
    quickExplicit: true,
    tasks: true
  }),
  'releaseNotes',
  'V3 what\'s new wins the stack'
)
assert.equal(
  pickProductOverlay({
    releaseNotes: false,
    welcome: true,
    tour: true,
    tourExplicit: false,
    quickStart: false,
    quickExplicit: false,
    tasks: true
  }),
  'welcome',
  'welcome stays in front of a queued tour'
)
assert.equal(
  pickProductOverlay({
    releaseNotes: false,
    welcome: true,
    tour: true,
    tourExplicit: true,
    quickStart: false,
    quickExplicit: false,
    tasks: true
  }),
  'tour',
  'help can open the tour without stacking it on welcome'
)
assert.equal(
  pickProductOverlay({
    releaseNotes: false,
    welcome: false,
    tour: false,
    tourExplicit: false,
    quickStart: false,
    quickExplicit: false,
    tasks: true
  }),
  'tasks'
)
assert.equal(
  pickProductOverlay({
    releaseNotes: false,
    welcome: false,
    tour: false,
    tourExplicit: false,
    quickStart: false,
    quickExplicit: false,
    tasks: false
  }),
  null
)

assert.equal(escProductTarget({ product: 'welcome', higherChrome: true, modalBackdrops: 0 }), null, 'Esc leaves welcome while a menu is open')
assert.equal(escProductTarget({ product: 'welcome', higherChrome: false, modalBackdrops: 1 }), null, 'Esc leaves welcome while a dialog is open')
assert.equal(escProductTarget({ product: 'welcome', higherChrome: false, modalBackdrops: 0 }), 'welcome')
assert.equal(escProductTarget({ product: 'tour', higherChrome: false, modalBackdrops: 0 }), 'tour')
assert.equal(escProductTarget({ product: 'releaseNotes', higherChrome: false, modalBackdrops: 1 }), 'releaseNotes')
assert.equal(escProductTarget({ product: 'releaseNotes', higherChrome: false, modalBackdrops: 2 }), null, 'a dialog above what\'s new is the top layer')
assert.equal(escProductTarget({ product: null, higherChrome: false, modalBackdrops: 0 }), null)

assert.equal(
  shouldOfferTourAfterWelcome({ welcomeWasVisible: true, completedNow: true, tourDone: false, replay: false }),
  true
)
assert.equal(
  shouldOfferTourAfterWelcome({ welcomeWasVisible: true, completedNow: true, tourDone: true, replay: false }),
  false
)
assert.equal(
  shouldOfferTourAfterWelcome({ welcomeWasVisible: false, completedNow: true, tourDone: false, replay: false }),
  false,
  'a cold start that never showed welcome does not raise the tour'
)
assert.equal(
  shouldOfferTourAfterWelcome({ welcomeWasVisible: true, completedNow: true, tourDone: false, replay: true }),
  false
)

assert.equal(pickValueMoment({ importCount: 4, firstConnect: true, blocked: false }), 'import')
assert.equal(pickValueMoment({ importCount: null, firstConnect: true, blocked: false }), 'firstConnect')
assert.equal(pickValueMoment({ importCount: 2, firstConnect: true, blocked: true }), null, 'welcome blocks the bar')
assert.equal(pickValueMoment({ importCount: 0, firstConnect: false, blocked: false }), null)
assert.equal(decideFirstConnect({ fresh: true, off: false, seen: false }), 'show')
assert.equal(decideFirstConnect({ fresh: false, off: false, seen: false }), 'stamp')
assert.equal(decideFirstConnect({ fresh: true, off: true, seen: false }), 'ignore')
assert.equal(decideFirstConnect({ fresh: true, off: false, seen: true }), 'ignore')
assert.deepEqual(
  importedConnectIds({ beforeIds: ['a'], afterIds: ['a', 'b'], policy: 'copy', conflictIds: ['a'] }),
  ['b']
)
assert.deepEqual(
  importedConnectIds({ beforeIds: ['a'], afterIds: ['a'], policy: 'overwrite', conflictIds: ['a'] }),
  ['a']
)

assert.equal(zh('png.imported', { n: 3 }), '已导入 3 台')
assert.equal(zh('png.connectAll'), '全部连接')
assert.equal(zh('png.view'), '查看')
assert.equal(zh('png.never'), '不再提示')
assert.equal(zh('png.openHome'), '打开运维首页')
assert.equal(zh('png.openSftp'), '打开 SFTP')
assert.ok(zh('png.firstBody').includes('运维首页') && zh('png.firstBody').includes('SFTP'))

const ops = SHARED_MENUS.find((m) => m.id === 'ops')!
const visible = visibleActionIds(ops)
assert.ok(visible.length <= 12, `ops menu has ${visible.length} visible items`)
assert.ok(visible.length < 12, 'ops menu is under the IA cap')
const hidden = ops.items.filter((it) => it.type === 'item' && it.menuHidden).map((it) => (it.type === 'item' ? it.id : ''))
for (const id of ['refreshDocker', 'alertHistory', 'dashboard', 'auditLog']) {
  assert.ok(hidden.includes(id), `${id} is Ctrl+K only`)
  assert.ok(!visible.includes(id), `${id} is not flat in the ops menu`)
}
const palette = buildPaletteEntries(SHARED_MENUS, 'zh-CN').map((e) => e.id)
for (const id of ['refreshDocker', 'alertHistory', 'dashboard', 'auditLog']) {
  assert.ok(palette.includes(id), `${id} stays in Ctrl+K`)
}
const shown = visibleMenuItems(ops)
const actions = shown.filter((it) => it.type === 'item').length
const seps = shown.filter((it) => it.type === 'sep').length
const menuHeight = estimatedMenuHeight(actions, seps)
const placed = placeMenuDropdown({
  anchorTop: 8,
  anchorBottom: 44,
  anchorLeft: 280,
  menuWidth: 280,
  menuHeight,
  viewportWidth: 1366,
  viewportHeight: 768
})
assert.equal(placed.clipped, false, 'ops menu stays inside 1366×768')
assert.ok(placed.top + placed.maxHeight <= 768 - 8)
const tall = placeMenuDropdown({
  anchorTop: 8,
  anchorBottom: 44,
  anchorLeft: 1200,
  menuWidth: 320,
  menuHeight: 900,
  viewportWidth: 1366,
  viewportHeight: 768
})
assert.equal(tall.clipped, false, 'a tall menu is clamped instead of clipping')
assert.ok(tall.maxHeight < 900)
assert.ok(tall.left + 320 <= 1366 - 8, 'menu does not run off the right edge')

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
const primary = css.match(/button\.primary\s*\{[^}]*\}/)?.[0] ?? ''
const hover = css.match(/button\.primary:hover:not\(:disabled\)\s*\{[^}]*\}/)?.[0] ?? ''
assert.match(primary, /background:\s*var\(--color-accent\)/)
assert.match(primary, /border-color:\s*var\(--color-accent\)/)
assert.match(primary, /color:\s*var\(--color-text-on-accent\)/)
assert.doesNotMatch(primary, /accent-dim/)
assert.match(hover, /background:\s*var\(--color-accent-hover\)/)
assert.match(hover, /border-color:\s*var\(--color-accent-hover\)/)
assert.match(css, /\.titlebar-menu-dropdown\s*\{[^}]*max-height:\s*calc\(100vh - 48px\)/)
assert.match(css, /\.titlebar-menu-dropdown\s*\{[^}]*overflow-y:\s*auto/)
assert.match(css, /\.value-moment-actions\s*\{[^}]*flex-wrap:\s*nowrap/)

const welcome = readFileSync('src/renderer/src/components/WelcomePanel.tsx', 'utf8')
assert.equal((welcome.match(/className="secondary"/g) ?? []).length, 3, 'welcome CTAs stay secondary')
assert.ok(!welcome.includes('className="primary"'))

const bar = readFileSync('src/renderer/src/components/ValueMomentBar.tsx', 'utf8')
assert.equal((bar.match(/className="primary"/g) ?? []).length, 2, 'each bar kind has one primary, not both at once')
assert.ok(bar.includes("kind === 'import'") && bar.includes('png-open-home') && bar.includes('png-never'))

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsEnd = toolbar.indexOf(']', opsStart)
const opsButtons = toolbar.slice(opsStart, opsEnd)
assert.equal((opsButtons.match(/id: '/g) ?? []).length, 3, 'no new toolbar primary')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('ValueMomentBar'))
assert.ok(app.includes('pickProductOverlay'))
assert.ok(!app.includes('window.confirm'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.49')

console.log('test-polish-1-png ok')
