/** setDryRunReminder / openProdGuard open toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const dry = app.indexOf("action === 'setDryRunReminder'")
const pg = app.indexOf("action === 'openProdGuard'")
assert.ok(dry >= 0 && pg >= 0)
assert.match(app.slice(dry, dry + 280), /showToast\(tg\('w6\.set'\)\)/)
assert.match(app.slice(pg, pg + 900), /showToast\(tg\('s2b\.openProtection'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes('w6.set'))
assert.ok(i18n.includes('s2b.openProtection'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.7.0')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-dryrun-prodguard-toast/)
console.log('test-dryrun-prodguard-toast ok')
