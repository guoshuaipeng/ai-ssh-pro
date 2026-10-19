/** Session/CmdK: reconnect policy opens settings (was handler-only). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'reconnectPolicy')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /重连策略/)
assert.match(item.label.en.toLowerCase(), /reconnect policy/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'reconnectPolicy'/)
assert.match(app, /openUnifiedSettings\('connections', 'l9-reconnect'\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-reconnect-policy-cmdk/)
console.log('test-reconnect-policy-cmdk ok')
