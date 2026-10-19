/** Status-bar host chip: double-click focuses terminal. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-host/)
assert.match(app, /onDoubleClick/)
assert.match(app, /aiss-focus-terminal/)
assert.match(app, /sb\.hostFocusTip/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.hostFocusTip'"))
assert.ok((i18n.match(/'sb\.hostFocusTip'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-host-focus/)
console.log('test-statusbar-host-focus ok')
