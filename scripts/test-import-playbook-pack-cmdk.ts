/** Tools/CmdK: import playbook pack (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'importPlaybookPack')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /导入|分享/)
assert.match(item.label.en.toLowerCase(), /import|pack/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'importPlaybookPack'/)
assert.match(app, /playbook-import/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.45')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-import-playbook-pack-cmdk/)
console.log('test-import-playbook-pack-cmdk ok')
