/** Tools/CmdK: dry-run reminder filter (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'setDryRunReminder')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /演练|提醒/)
assert.match(item.label.en.toLowerCase(), /dry|reminder/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'setDryRunReminder'/)
assert.match(app, /REMINDER_FILTER_EVENT/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-dry-run-reminder-cmdk/)
console.log('test-dry-run-reminder-cmdk ok')
