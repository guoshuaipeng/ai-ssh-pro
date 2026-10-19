/** Ops/CmdK: gate timeline (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'gateTimeline')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /闸门/)
assert.match(item.label.en.toLowerCase(), /gate/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'gateTimeline'/)
assert.match(app, /gate-timeline/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-gate-timeline-cmdk/)
console.log('test-gate-timeline-cmdk ok')
