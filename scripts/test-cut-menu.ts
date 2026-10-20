/** Edit/CmdK: cut (handler existed via execCommand). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'cut')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /剪切/)
assert.match(item.label.en.toLowerCase(), /cut/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'cut'/)
assert.match(app, /execCommand/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-cut-menu/)
console.log('test-cut-menu ok')
