/** Session/CmdK: sync preview (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'syncPreview')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /预览|同步/)
assert.match(item.label.en.toLowerCase(), /preview|sync/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'syncPreview'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.44')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sync-preview-cmdk/)
console.log('test-sync-preview-cmdk ok')
