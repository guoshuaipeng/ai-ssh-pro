/** Status-bar chip when split view is on; click exits split. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-split/)
assert.match(app, /splitEnabled/)
assert.match(app, /setSplitEnabled\(false\)/)
assert.match(app, /sb\.splitOn/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.splitOn'"))
assert.ok(i18n.includes("'sb.splitTip'"))
assert.ok((i18n.match(/'sb\.splitOn'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-split/)
console.log('test-statusbar-split ok')
