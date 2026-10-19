/** elevateProfile toasts when already temporarily unlocked. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const elevateProfile')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 500)
assert.match(chunk, /isElevated\(p\.id, loadElevate\(\)\)/)
assert.match(chunk, /showToast\(tg\('l4\.alreadyUnlocked'\)\)/)
assert.match(chunk, /s4\.alreadyOff/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l4.alreadyUnlocked': '保护已处于临时解除状态'"))
assert.ok(i18n.includes("l4.alreadyUnlocked': 'Protection is already temporarily unlocked'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-elevate-already-unlocked-toast/)
console.log('test-elevate-already-unlocked-toast ok')
