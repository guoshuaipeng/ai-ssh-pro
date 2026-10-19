/** Import sessions/ssh-config empty result also toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const a = app.indexOf('importSessionsPick')
const b = app.indexOf('importSshConfigPick')
assert.ok(a >= 0 && b >= 0)
assert.match(app.slice(a, a + 550), /showToast\(msg\)/)
assert.match(app.slice(b, b + 550), /showToast\(msg\)/)
assert.match(app, /n2\.empty/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("n2.empty': '没有可导入的会话'"))
assert.ok(i18n.includes("n2.empty': 'Nothing to import'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-import-empty-toast/)
console.log('test-import-empty-toast ok')
