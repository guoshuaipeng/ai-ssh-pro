/** taskCards action toasts when reopening getting-started tasks. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'taskCards'")
assert.ok(idx >= 0)
assert.match(app.slice(idx, idx + 280), /l7\.tasksReopened/)
assert.match(app.slice(idx, idx + 280), /showToast\(tg\('l7\.tasksReopened'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l7.tasksReopened': '已重新打开入门任务'"))
assert.ok(i18n.includes("l7.tasksReopened': 'Getting started tasks reopened'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-tasks-reopened-toast/)
console.log('test-tasks-reopened-toast ok')
