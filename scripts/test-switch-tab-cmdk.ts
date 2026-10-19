/** View/CmdK: switch tab (opens tab overflow list; handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'switchTab')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /标签|切换/)
assert.match(item.label.en.toLowerCase(), /tab|switch/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'switchTab'/)
assert.match(app, /setTabOverflowPos|tabOverflow/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-switch-tab-cmdk/)
console.log('test-switch-tab-cmdk ok')
