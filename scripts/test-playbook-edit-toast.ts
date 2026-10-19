/** Playbook list onEdit opens editor and toasts m2.edit. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('onEdit={(id)')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /openM2\('playbook-edit'/)
assert.match(chunk, /showToast\(tg\('m2\.edit'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'m2.edit':"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.44')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-playbook-edit-toast/)
console.log('test-playbook-edit-toast ok')
