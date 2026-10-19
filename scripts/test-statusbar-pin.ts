/** Status-bar chip when active tab is pinned; click unpins. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-pin/)
assert.match(app, /activeTab\?\.pinned/)
assert.match(app, /pinned:\s*false/)
assert.match(app, /tab\.unpinned/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.pinned'"))
assert.ok(i18n.includes("'sb.pinTip'"))
assert.ok((i18n.match(/'sb\.pinned'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-pin/)
console.log('test-statusbar-pin ok')
