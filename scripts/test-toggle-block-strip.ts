/** View/CmdK toggleBlockStrip + toast on toggle. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'toggleBlockStrip')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /分块/)
assert.equal(item.toggle, true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'toggleBlockStrip'/)

const blocks = readFileSync('src/renderer/src/components/TerminalBlocks.tsx', 'utf8')
assert.match(blocks, /blocks\.hide/)
assert.match(blocks, /blocks\.show/)
assert.match(blocks, /aiss-toggle-block-strip/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.50')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-toggle-block-strip/)
console.log('test-toggle-block-strip ok')
