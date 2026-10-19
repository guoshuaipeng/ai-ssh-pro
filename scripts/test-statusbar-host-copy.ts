/** Status-bar host chip copies connection string. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { statusHostChipLabel } from '../src/shared/connection-string'

assert.equal(statusHostChipLabel(''), null)
assert.equal(statusHostChipLabel('web.prod.example.com'), 'web.prod.example.com')
assert.equal(statusHostChipLabel('x' + 'y'.repeat(30)).endsWith('…'), true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-host/)
assert.match(app, /statusHostChipLabel/)
assert.match(app, /formatConnectionString/)
assert.match(app, /sb\.hostTip/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.hostTip'"))
assert.ok((i18n.match(/'sb\.hostTip'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-host-copy/)
console.log('test-statusbar-host-copy ok')
