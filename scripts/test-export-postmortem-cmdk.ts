/** Tools/CmdK: export postmortem (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'exportPostmortem')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /复盘|导出/)
assert.match(item.label.en.toLowerCase(), /postmortem|export/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'exportPostmortem'/)
assert.match(app, /aiss-export-postmortem/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.62')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-export-postmortem-cmdk/)
console.log('test-export-postmortem-cmdk ok')
