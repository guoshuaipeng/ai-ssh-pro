/** Session/CmdK: reconnect now for dropped session (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'reconnectNow')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /立即重连/)
assert.match(item.label.en.toLowerCase(), /reconnect now/)
assert.ok(item.needsSession)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'reconnectNow'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-reconnect-now-cmdk/)
console.log('test-reconnect-now-cmdk ok')
