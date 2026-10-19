/** AI … menu + CmdK: explain terminal selection. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'explainSelection')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /选中|解释/)
assert.match(item.label.en.toLowerCase(), /selection|explain/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'explainSelection'/)

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /data-testid="ai-explain-selection"/)
assert.match(panel, /requestSelectionExplain/)
assert.match(panel, /currentTerminalSelection/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-explain-selection-ai-menu/)
console.log('test-explain-selection-ai-menu ok')
