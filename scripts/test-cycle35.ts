import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chatToMarkdown } from '../src/shared/ai-chat-markdown'
import { dragIds, encodeHostDrag, decodeHostDrag, dropPlan } from '../src/shared/host-drag'
import { connectFailKey, noteConnectFail, getConnectFail, clearConnectFail } from '../src/renderer/src/lib/connect-fail-store'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D86
const md = chatToMarkdown([
  { role: 'user', content: 'why is nginx down? password=hunter2' },
  { role: 'assistant', content: 'Check the service.', structured: { description: 'Check the service.', action: 'command', command: 'systemctl status nginx', riskLevel: 'low' }, decision: 'agreed' },
  { role: 'assistant', content: 'partial', streaming: true },
  { role: 'assistant', content: 'boom', variant: 'error' }
], { title: 'T', at: new Date(0), you: 'Me', ai: 'AI', cmd: 'Cmd' })
ok(md.startsWith('# T') && md.includes('## Me') && md.includes('```bash\nsystemctl status nginx\n```') && md.includes('(low, agreed)'), 'D86 markdown')
ok(!md.includes('hunter2') && !md.includes('partial') && !md.includes('boom'), 'D86 redacted, skips streaming/error')
const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
ok(ai.includes('data-testid="ai-copy-chat-md"') && ai.includes('chatToMarkdown(lines'), 'D86 menu item')
// D88
const k = connectFailKey(' Ops ', 'H', undefined)
ok(k === 'ops@h:22', 'D88 key')
noteConnectFail(k, 'refused')
ok(getConnectFail(k)?.reason === 'refused', 'D88 note')
clearConnectFail(k)
ok(!getConnectFail(k), 'D88 clear')
const rc = readFileSync('src/renderer/src/components/RecentConnections.tsx', 'utf8')
ok(rc.includes('data-testid="recent-fail-dot"') && rc.includes('onClick={() => onQuickConnect(row)}'), 'D88 dot, click unchanged')
const fs = readFileSync('src/renderer/src/lib/connect-fail-store.ts', 'utf8')
ok(!/localStorage|writeFile/.test(fs), 'D88 memory only')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('noteConnectFail(connectFailKey(opts.username, opts.host, opts.port), shown)') && app.includes('clearConnectFail(connectFailKey('), 'D88 wiring')
// D87
ok(dragIds('a', ['a', 'b']).join() === 'a,b' && dragIds('c', ['a', 'b']).join() === 'c' && dragIds('a', ['a']).join() === 'a', 'D87 dragIds')
ok(decodeHostDrag(encodeHostDrag(['x', 'y'])).join() === 'x,y' && decodeHostDrag('nope').length === 0 && decodeHostDrag('{"v":2,"ids":["x"]}').length === 0, 'D87 codec')
ok(dropPlan(['a', 'b', 'z'], [{ id: 'a', folderId: 'f1' }, { id: 'b' }], 'f1').join() === 'b', 'D87 dropPlan')
ok(app.includes('onDragHost=') && app.includes('moveProfileToFolder(moving, f.id)'), 'D87 wiring')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const key of ['d86.copy', 'd86.copied', 'd88.failed', 'd87.already']) ok((i18n.match(new RegExp(`'${key.replace('.', '\\.')}'`, 'g')) ?? []).length === 2, 'strings ' + key)
console.log(`cycle35 ok: ${n}`)
