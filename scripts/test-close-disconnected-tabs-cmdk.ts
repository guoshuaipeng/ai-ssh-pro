/** View/CmdK: close disconnected session tabs (same as tab-list action). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'
import { disconnectedSessions } from '../src/shared/tab-overflow'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'closeDisconnectedTabs')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /断开/)
assert.match(item.label.en.toLowerCase(), /disconnect/)

assert.equal(
  disconnectedSessions([
    { status: 'disconnected', view: undefined, kind: 'ssh' },
    { status: 'connected', view: undefined, kind: 'ssh' },
    { status: 'disconnected', view: 'settings', kind: 'ssh' }
  ] as never).length,
  1
)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'closeDisconnectedTabs'/)
assert.match(app, /disconnectedSessions\(tabsRef/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'tab.list.noDisconnected'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.45')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-close-disconnected-tabs-cmdk/)
console.log('test-close-disconnected-tabs-cmdk ok')
