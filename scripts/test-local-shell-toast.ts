/** openLocalShell success toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /localShell\.opened/)
assert.match(app, /openLocalShell/)
assert.match(app, /showToast\(tg\('localShell\.opened'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("localShell.opened': '已打开本机 Shell'"))
assert.ok(i18n.includes("localShell.opened': 'Local shell opened'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.41')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-local-shell-toast/)
console.log('test-local-shell-toast ok')
