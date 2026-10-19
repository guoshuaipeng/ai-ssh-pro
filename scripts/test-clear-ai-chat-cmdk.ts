/** CmdK clear AI chat dispatches to AIPanel confirm flow. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'clearAiChat')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /清空/)
assert.match(item.label.en.toLowerCase(), /clear/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'clearAiChat'/)
assert.match(app, /aiss-ai-clear-chat/)

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /aiss-ai-clear-chat/)
assert.match(panel, /clearConversation/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-clear-ai-chat-cmdk/)
console.log('test-clear-ai-chat-cmdk ok')
