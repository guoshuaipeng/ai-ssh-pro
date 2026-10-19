/** CmdK/View: Close other tabs (context menu already had it). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { closeOthers } from '../src/shared/tab-actions'
import { SHARED_MENUS } from '../src/shared/menus'

const tabs = [
  { id: 'a', seq: 1, view: 'session' },
  { id: 'b', seq: 2, view: 'session', pinned: true },
  { id: 'c', seq: 3, view: 'session' },
  { id: 'h', seq: 0, view: 'home' }
]
assert.deepEqual(closeOthers(tabs, 'a').sort(), ['c'])

const item = SHARED_MENUS.find((m) => m.id === 'view')?.items.find((it) => it.type === 'item' && it.id === 'closeOtherTabs')
  ?? SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'closeOtherTabs')
assert.ok(item && item.type === 'item')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'closeOtherTabs'/)
assert.match(app, /closeOthers\(rows, activeTabId\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-close-other-tabs-cmdk/)
console.log('test-close-other-tabs-cmdk ok')
