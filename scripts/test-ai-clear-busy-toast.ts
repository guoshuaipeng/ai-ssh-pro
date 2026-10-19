/** Clear AI chat while busy shows toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /ai\.clearBusy/)
assert.match(panel, /clearConversation = useCallback/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("ai.clearBusy': '请先停止生成再清空对话'"))
assert.ok(i18n.includes("ai.clearBusy': 'Stop generation before clearing chat'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-clear-busy-toast/)
console.log('test-ai-clear-busy-toast ok')
