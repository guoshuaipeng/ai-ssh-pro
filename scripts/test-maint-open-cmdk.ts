/** Tools/CmdK: maintenance window (handler + palette existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'maintOpen')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /维护/)
assert.match(item.label.en.toLowerCase(), /maint/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'maintOpen'/)
assert.match(app, /openMaintenance\(/)

const pal = readFileSync('src/renderer/src/lib/palette.ts', 'utf8')
assert.match(pal, /maintOpen:\s*'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-maint-open-cmdk/)
console.log('test-maint-open-cmdk ok')
