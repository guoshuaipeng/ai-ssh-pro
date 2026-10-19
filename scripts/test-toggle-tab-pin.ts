/** CmdK/menu: pin/unpin current tab. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const view = SHARED_MENUS.find((m) => m.id === 'view')
assert.ok(view)
const pin = view!.items.find((it) => it.type === 'item' && it.id === 'toggleTabPin')
assert.ok(pin && pin.type === 'item')
assert.equal(pin.label.zh.includes('固定'), true)
assert.equal(pin.label.en.toLowerCase().includes('pin'), true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'toggleTabPin'/)
assert.match(app, /pinned: !row\.pinned/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-toggle-tab-pin/)

console.log('test-toggle-tab-pin ok')
