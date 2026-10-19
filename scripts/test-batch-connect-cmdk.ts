/** File/CmdK: batch connect selected hosts (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'batchConnect')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /连接|选中/)
assert.match(item.label.en.toLowerCase(), /connect|selected/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'batchConnect'/)
assert.match(app, /l10\.none/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-batch-connect-cmdk/)
console.log('test-batch-connect-cmdk ok')
