/** Opening playbook run from list toasts m2.run. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const n = (app.match(/showToast\(tg\('m2\.run'\)\)/g) || []).length
assert.ok(n >= 2, `expected >=2 m2.run toasts, got ${n}`)
assert.match(app, /openM2\('playbook-run', tg\('m2\.run'\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-playbook-run-opened-toast/)
console.log('test-playbook-run-opened-toast ok')
