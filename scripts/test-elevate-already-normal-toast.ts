/** elevateProfile toasts when protection is already normal. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const elevateProfile')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 1400)
assert.match(chunk, /if \(level === 'normal'\) \{\s*showToast\(tg\('s4\.alreadyOff'\)\)/)
assert.match(chunk, /showToast\(tg\('l4\.unlocked'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-elevate-already-normal-toast/)
console.log('test-elevate-already-normal-toast ok')
