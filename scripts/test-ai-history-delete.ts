/** H06: archive remove helper + history delete affordance in AI panel. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pushArchive, removeArchiveById, type AiArchivedConversation } from '../src/shared/ai-conversation.ts'

const sample = (id: string, group = 'h1'): AiArchivedConversation => ({
  id,
  group,
  hostLabel: 'demo',
  key: group,
  title: 't-' + id,
  savedAt: Date.now(),
  messages: [{ role: 'user', content: 'hi ' + id }]
})

const list = pushArchive([], sample('a'))
const list2 = pushArchive(list, sample('b'))
assert.equal(list2.length, 2)
assert.deepEqual(removeArchiveById(list2, 'a').map((e) => e.id), ['b'])
assert.deepEqual(removeArchiveById(list2, 'missing').map((e) => e.id), ['b', 'a'])
assert.deepEqual(removeArchiveById(list2, '').map((e) => e.id), ['b', 'a'])

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /deleteArchived/)
assert.match(panel, /ai-history-del/)
assert.match(panel, /ai-history-row/)
assert.match(panel, /chatArchive!\.remove/)
assert.match(panel, /ai\.deleteHistoryTitle/)

const preload = readFileSync('src/preload/index.ts', 'utf8')
assert.match(preload, /ai:chatArchive:remove/)

const bridge = readFileSync('src/renderer/src/tauri-bridge.ts', 'utf8')
assert.match(bridge, /aiChatArchive/)
assert.match(bridge, /remove: async \(id: string\)/)

const store = readFileSync('src/main/app-store.ts', 'utf8')
assert.match(store, /removeAiChatArchive/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'ai\.deleteHistory': '删除'/)
assert.match(i18n, /'ai\.deleteHistory': 'Delete'/)

console.log('test-ai-history-delete ok')
