/** addDemoHost toasts when demo already exists and not connecting. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const addDemoHost = useCallback')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 900)
assert.match(chunk, /showToast\(tg\('l7\.demoExists'\)\)/)
assert.match(chunk, /else if \(created\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l7.demoExists': '演示主机已在列表中'"))
assert.ok(i18n.includes("l7.demoExists': 'Demo host is already in the list'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-demo-host-exists-toast/)
console.log('test-demo-host-exists-toast ok')
