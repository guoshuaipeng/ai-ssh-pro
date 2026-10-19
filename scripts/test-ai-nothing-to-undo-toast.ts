/** undoLastRound toasts when chat empty. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(ai, /ai\.nothingToUndo/)
assert.match(ai, /linesRef\.current\.length/)
assert.match(ai, /showToast\(tg\('ai\.nothingToUndo'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("ai.nothingToUndo': '没有可撤回的对话'"))
assert.ok(i18n.includes("ai.nothingToUndo': 'Nothing to undo'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-nothing-to-undo-toast/)
console.log('test-ai-nothing-to-undo-toast ok')
