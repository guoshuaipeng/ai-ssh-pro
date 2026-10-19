/** Middle-click closes tab (toggleSidebar already existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

assert.ok(SHARED_MENUS.some((m) => m.items.some((it) => it.type === 'item' && it.id === 'toggleSidebar')))

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /onAuxClick/)
assert.match(app, /e\.button !== 1/)
assert.match(app, /closeTab\(t\.tabId, t\.sessionId, t\.status, t\.view\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-tab-middle-close/)
console.log('test-tab-middle-close ok')
