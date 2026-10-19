/**
 * Host 「移动到」 flyout: hover/focus opens it, the edge flips, empty stays visible.
 * Run: npx tsx scripts/test-move-submenu.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildHostMenu } from '../src/shared/inline-menus'
import { placeSubmenu } from '../src/shared/menu-place'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.43')

const beside = placeSubmenu({ left: 200, right: 360, top: 100, bottom: 132 }, 180, 220, 1366, 768)
assert.equal(beside.side, 'right')
assert.equal(beside.x, 356)
assert.equal(beside.y, 100)

const flipped = placeSubmenu({ left: 1100, right: 1280, top: 100, bottom: 132 }, 180, 220, 1366, 768)
assert.equal(flipped.side, 'left')
assert.ok(flipped.x >= 8)
assert.ok(flipped.x + 180 <= 1366 - 8)

const low = placeSubmenu({ left: 200, right: 360, top: 700, bottom: 732 }, 180, 200, 1366, 768)
assert.ok(low.y >= 8)
assert.ok(low.y + 200 <= 768 - 8)

const groups = buildHostMenu({
  selection: 'single',
  count: 1,
  currentFolderId: 'test',
  folders: [
    { id: 'test', name: 'snowy · 测试' },
    { id: 'prod', name: 'snowy · 生产' }
  ]
})
const move = groups.find((node) => node.type === 'sub' && node.id === 'move')
assert.ok(move && move.type === 'sub')
if (move && move.type === 'sub') {
  assert.deepEqual(
    move.children.map((child) => (child.type === 'item' ? child.label ?? child.id : child.id)),
    ['move-to:ungrouped', 'snowy · 测试', 'snowy · 生产']
  )
  const current = move.children.find((child) => child.type === 'item' && child.id === 'move-to:test')
  assert.equal(current && current.type === 'item' ? current.disabled : false, true)
}

const none = buildHostMenu({ selection: 'single', count: 1, folders: [] })
const emptyMove = none.find((node) => node.type === 'sub' && node.id === 'move')
assert.ok(emptyMove && emptyMove.type === 'sub')
if (emptyMove && emptyMove.type === 'sub') {
  assert.ok(emptyMove.children.some((child) => child.type === 'empty' && child.labelKey === 'app.noFolders'))
}

const built = readFileSync('src/renderer/src/components/BuiltMenu.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(built, /placeSubmenu\(/)
assert.match(built, /onMouseEnter=\{\(\) => showSub\(node\.id\)\}/)
assert.match(built, /onFocus=\{\(\) => showSub\(node\.id\)\}/)
assert.match(built, /session-context-menu-scrollport/)
assert.match(built, /has-flyout/)
assert.match(built, /session-context-submenu is-open/)
assert.match(built, /data-testid="submenu-empty"/)
assert.match(built, /labelKey: 'app\.noFolders'/)
assert.match(styles, /\.session-context-menu\.has-flyout\s*\{[^}]*overflow:\s*visible/)
assert.match(styles, /\.session-context-submenu\.is-open\s*\{[^}]*position:\s*fixed/)
assert.match(styles, /\.session-context-menu-scrollport\s*\{[^}]*overflow:\s*auto/)

console.log('test-move-submenu ok')
