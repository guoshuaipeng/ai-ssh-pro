/** Session/CmdK: production guard (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'openProdGuard')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /生产|防护/)
assert.match(item.label.en.toLowerCase(), /prod|guard/)
assert.equal(item.needsSession, true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'openProdGuard'/)
assert.match(app, /openInventoryEditor/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-open-prod-guard-cmdk/)
console.log('test-open-prod-guard-cmdk ok')
