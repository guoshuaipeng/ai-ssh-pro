/** focusAiPanel toasts when revealing hidden AI pane. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'focusAiPanel'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 350)
assert.match(block, /ai\.focusShortcutTip/)
assert.match(block, /wasHidden/)
assert.match(block, /showToast\(tg\('ai\.focusShortcutTip'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("ai.focusShortcutTip': '聚焦 AI 面板'"))
assert.ok(i18n.includes("ai.focusShortcutTip': 'Focus AI panel'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.58')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-focus-ai-toast/)
console.log('test-focus-ai-toast ok')
