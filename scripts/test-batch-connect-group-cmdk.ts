/** File/CmdK: batch connect current group (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'batchConnectGroup')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /分组|连接/)
assert.match(item.label.en.toLowerCase(), /group|connect/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'batchConnectGroup'/)
assert.match(app, /planPaletteGroup/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.45')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-batch-connect-group-cmdk/)
console.log('test-batch-connect-group-cmdk ok')
