/** CmdK/View copy last AI reply. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lastAssistantText } from '../src/shared/ai-last-reply'
import { SHARED_MENUS } from '../src/shared/menus'

assert.equal(lastAssistantText([]), null)
assert.equal(lastAssistantText([{ role: 'user', content: 'hi' }]), null)
assert.equal(
  lastAssistantText([
    { role: 'user', content: 'q' },
    { role: 'assistant', content: ' first ' },
    { role: 'user', content: 'q2' },
    { role: 'assistant', content: ' second ' }
  ]),
  'second'
)

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'copyLastAiReply')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /复制/)
assert.match(item.label.en.toLowerCase(), /copy.*ai|last.*reply/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'copyLastAiReply'/)
assert.match(app, /aiss-ai-copy-last-reply/)

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /aiss-ai-copy-last-reply/)
assert.match(panel, /lastAssistantText/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.48')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-copy-last-ai-reply/)
console.log('test-copy-last-ai-reply ok')
