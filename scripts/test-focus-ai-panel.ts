/** CmdK/View: Focus AI panel (duplicateSession already existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

assert.ok(SHARED_MENUS.some((m) => m.items.some((it) => it.type === 'item' && it.id === 'duplicateSession')))
const item = SHARED_MENUS.find((m) => m.id === 'view')?.items.find((it) => it.type === 'item' && it.id === 'focusAiPanel')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /AI/)
assert.match(item.label.en.toLowerCase(), /focus/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'focusAiPanel'/)
assert.match(app, /withPaneToggle\(p, 'ai', true\)/)
assert.match(app, /setRightPane\('ai'\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.61')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-focus-ai-panel/)
console.log('test-focus-ai-panel ok')
