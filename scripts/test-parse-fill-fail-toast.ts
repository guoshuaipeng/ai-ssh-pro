/** parseAndFillForm toasts on parse failure. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const parseAndFillForm')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 950)
assert.match(chunk, /const msg = e instanceof Error \? e\.message : String\(e\)/)
assert.match(chunk, /setError\(msg\)/)
assert.match(chunk, /showToast\(msg, \{ kind: 'error' \}\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.40')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-parse-fill-fail-toast/)
console.log('test-parse-fill-fail-toast ok')
