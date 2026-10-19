/** CmdK/View: Close tabs to the right. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { closeRight } from '../src/shared/tab-actions'
import { SHARED_MENUS } from '../src/shared/menus'

const tabs = [
  { id: 'a', seq: 1, view: 'session' },
  { id: 'b', seq: 2, view: 'session', pinned: true },
  { id: 'c', seq: 3, view: 'session' }
]
assert.deepEqual(closeRight(tabs, 'a').close, ['c'])
assert.equal(closeRight(tabs, 'c').disabled, true)

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'closeTabsToRight')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /右侧/)
assert.match(item.label.en.toLowerCase(), /right/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'closeTabsToRight'/)
assert.match(app, /closeRight\(rows, activeTabId\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-close-tabs-to-right-cmdk/)
console.log('test-close-tabs-to-right-cmdk ok')
