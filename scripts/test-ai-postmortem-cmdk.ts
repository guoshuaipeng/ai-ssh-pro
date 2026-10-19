/** AI/CmdK: alert postmortem (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'aiPostmortem')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /复盘|告警/)
assert.match(item.label.en.toLowerCase(), /postmortem|alert/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'aiPostmortem'/)
assert.match(app, /openPostmortemAi/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-postmortem-cmdk/)
console.log('test-ai-postmortem-cmdk ok')
