/** Ask again toasts when no prior user message. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(ai, /aiss-ai-ask-again/)
assert.match(ai, /ai\.noLastAsk/)
assert.match(ai, /showToast\(tg\('ai\.noLastAsk'\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("ai.noLastAsk': '没有可重新提问的内容'"))
assert.ok(i18n.includes("ai.noLastAsk': 'No previous question to ask again'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.58')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ask-again-empty-toast/)
console.log('test-ask-again-empty-toast ok')
