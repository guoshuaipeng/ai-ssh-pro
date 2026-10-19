/** clearHostHistory toasts when nothing to remove. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'clearHostHistory'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 550)
assert.match(chunk, /if \(!removed\)/)
assert.match(chunk, /showToast\(tg\('x1\.nothingToClear'\)\)/)
assert.match(chunk, /toastUndo/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("x1.nothingToClear': '没有可清除的本机命令历史'"))
assert.ok(i18n.includes("x1.nothingToClear': 'No command history to clear for this host'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-clear-host-history-empty-toast/)
console.log('test-clear-host-history-empty-toast ok')
