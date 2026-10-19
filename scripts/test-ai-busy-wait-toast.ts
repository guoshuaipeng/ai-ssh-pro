/** AI undo/retry while busy show toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.equal((panel.match(/ai\.busyWait/g) || []).length, 2)
assert.match(panel, /undoLastRound/)
assert.match(panel, /retryLastUser/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("ai.busyWait': '请先停止生成再继续'"))
assert.ok(i18n.includes("ai.busyWait': 'Stop generation before continuing'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-busy-wait-toast/)
console.log('test-ai-busy-wait-toast ok')
