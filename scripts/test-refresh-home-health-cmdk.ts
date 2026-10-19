/** View/CmdK: refresh home health (handler + need-home toast existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'refreshHomeHealth')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /健康|刷新/)
assert.match(item.label.en.toLowerCase(), /health|refresh/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'refreshHomeHealth'/)
assert.match(app, /l7b\.needHome/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.43')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-refresh-home-health-cmdk/)
console.log('test-refresh-home-health-cmdk ok')
