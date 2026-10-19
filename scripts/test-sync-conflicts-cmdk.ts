/** Session/CmdK: sync conflicts (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'syncConflicts')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /冲突/)
assert.match(item.label.en.toLowerCase(), /conflict/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'syncConflicts'/)
assert.match(app, /sync-conflicts/)

const pal = readFileSync('src/renderer/src/lib/palette.ts', 'utf8')
assert.match(pal, /syncConflicts/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sync-conflicts-cmdk/)
console.log('test-sync-conflicts-cmdk ok')
