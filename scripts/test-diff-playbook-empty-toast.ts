/** createDiffPlaybook toasts when fixes list is empty. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const createDiffPlaybook')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 350)
assert.match(chunk, /if \(!info\.fixes\.length\) \{\s*showToast\(tg\('l8b\.noFixes'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.61')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-diff-playbook-empty-toast/)
console.log('test-diff-playbook-empty-toast ok')
