/** Opening playbook result panel toasts m2.playbooks. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /openM2\('playbook-result', tg\('m2\.playbooks'\)\)/)
const start = app.indexOf("openM2('playbook-result'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 200)
assert.match(chunk, /showToast\(tg\('m2\.playbooks'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-playbook-result-opened-toast/)
console.log('test-playbook-result-opened-toast ok')
