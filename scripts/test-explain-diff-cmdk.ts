/** AI/CmdK: explain file diff (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'explainDiff')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /差异|解释/)
assert.match(item.label.en.toLowerCase(), /diff|explain/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'explainDiff'/)
assert.match(app, /l8b\.needDiff/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-explain-diff-cmdk/)
console.log('test-explain-diff-cmdk ok')
