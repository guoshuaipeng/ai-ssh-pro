/** parseAndFillForm toasts when paste box is empty. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const parseAndFillForm')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 350)
assert.match(chunk, /if \(!blob\) \{\s*showToast\(tg\('conn\.pasteEmpty'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("conn.pasteEmpty': '请先粘贴 SSH 连接信息'"))
assert.ok(i18n.includes("conn.pasteEmpty': 'Paste SSH connection details first'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-parse-fill-empty-toast/)
console.log('test-parse-fill-empty-toast ok')
