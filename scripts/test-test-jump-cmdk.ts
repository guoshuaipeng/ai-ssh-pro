/** Session/CmdK: test jump path (probeJump handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'testJump')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /跳板|测试/)
assert.match(item.label.en.toLowerCase(), /jump|test/)
assert.equal(item.needsSession, true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'testJump'/)
assert.match(app, /probeJump/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-test-jump-cmdk/)
console.log('test-test-jump-cmdk ok')
