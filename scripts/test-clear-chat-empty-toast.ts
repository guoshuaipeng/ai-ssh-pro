/** clearConversation toasts when chat already empty. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(ai, /ai\.chatAlreadyEmpty/)
assert.match(ai, /linesRef\.current\.length/)
assert.match(ai, /showToast\(tg\('ai\.chatAlreadyEmpty'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("ai.chatAlreadyEmpty': '对话已是空的'"))
assert.ok(i18n.includes("ai.chatAlreadyEmpty': 'Chat is already empty'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.52')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-clear-chat-empty-toast/)
console.log('test-clear-chat-empty-toast ok')
