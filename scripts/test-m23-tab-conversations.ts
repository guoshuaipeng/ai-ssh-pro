/** M23 (0.6.61): AI conversations bound to the terminal tab; 新对话 archives; history by host. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  archiveTitle,
  ARCHIVE_PER_GROUP,
  assignConversationOrdinals,
  conversationGroup,
  conversationKey,
  conversationLabel,
  GENERAL_CONVERSATION_KEY,
  groupArchives,
  pushArchive,
  type AiArchivedConversation
} from '../src/shared/ai-conversation'
import { changelogFor } from '../src/shared/changelog'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// grouping: saved host by profile id, unsaved by hostname:port
assert.equal(conversationGroup({ profileId: 'p1', host: '10.0.0.1', port: 22 }), 'p1')
assert.equal(conversationGroup({ host: 'web.local', port: 2222 }), 'web.local:2222')
assert.equal(conversationGroup({ host: 'web.local' }), 'web.local:22')
// #1 keeps the bare key (old history carries over); #2+ get a suffix
assert.equal(conversationKey('p1', 1), 'p1')
assert.equal(conversationKey('p1', 2), 'p1#2')
assert.equal(conversationLabel('web', 1), 'web')
assert.equal(conversationLabel('web', 2), 'web #2')

// same host in two tabs → two conversations; numbers are stable and reused
let ord = assignConversationOrdinals({}, [
  { tabId: 'a', group: 'p1' },
  { tabId: 'b', group: 'p1' },
  { tabId: 'c', group: 'p2' }
])
assert.deepEqual(ord, { a: 1, b: 2, c: 1 })
ord = assignConversationOrdinals(ord, [
  { tabId: 'b', group: 'p1' },
  { tabId: 'c', group: 'p2' }
])
assert.deepEqual(ord, { b: 2, c: 1 }, 'closing #1 does not renumber #2')
ord = assignConversationOrdinals(ord, [
  { tabId: 'b', group: 'p1' },
  { tabId: 'c', group: 'p2' },
  { tabId: 'd', group: 'p1' }
])
assert.equal(ord.d, 1, 'a new tab takes the lowest free number')

// archive: capped per host, newest first, grouped by host with the current host first
const entry = (id: string, group: string, savedAt: number): AiArchivedConversation => ({
  id,
  group,
  hostLabel: group,
  key: group,
  title: id,
  savedAt,
  messages: [{ role: 'user', content: id }]
})
let list: AiArchivedConversation[] = []
for (let i = 0; i < ARCHIVE_PER_GROUP + 5; i += 1) list = pushArchive(list, entry(`x${i}`, 'p1', i))
assert.equal(list.length, ARCHIVE_PER_GROUP)
assert.equal(list[0].id, `x${ARCHIVE_PER_GROUP + 4}`)
list = pushArchive(list, entry('y', 'web.local:22', 1000))
const groups = groupArchives(list.map(({ messages, ...r }) => ({ ...r, count: messages.length })), 'p1')
assert.equal(groups[0].group, 'p1', 'current host first')
assert.equal(groups[1].group, 'web.local:22')
assert.equal(archiveTitle([{ role: 'assistant', content: 'hi' }, { role: 'user', content: '  why   is nginx down  ' }]), 'why is nginx down')

// App: key per tab, general conversation when no session tab, target switch, reconnect
const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes('historyKey={activeConv ? activeConv.key : GENERAL_CONVERSATION_KEY}'))
assert.ok(app.includes('assignConversationOrdinals(convOrdinalsRef.current, convTabs)'))
assert.ok(app.includes('onSelectTarget={(tabId) => setActiveTabId(tabId)}'))
assert.ok(app.includes("onReconnect={activeConv && activeConv.status === 'disconnected'"))
assert.ok(app.includes('convFor(t.tabId)?.key === key'), 'switch-back finds the tab by conversation key')
assert.equal(GENERAL_CONVERSATION_KEY, '__general__')

// AIPanel header: ● host · #n ▾  目标…  ＋  🕘  ⋯
const panel = norm('src/renderer/src/components/AIPanel.tsx')
const header = panel.slice(panel.indexOf('<div className="ai-header">'), panel.indexOf('<div className="ai-messages">'))
const order = ['data-testid="ai-conv-dot"', 'data-testid="ai-conv-n"', 'data-testid="ai-working-goal"', 'data-testid="ai-new-chat"', 'data-testid="ai-history"', 'data-testid="ai-more"']
let at = -1
for (const id of order) {
  const i = header.indexOf(id)
  assert.ok(i > at, `${id} in header order`)
  at = i
}
assert.ok(header.includes('data-testid="ai-target-menu"') && header.includes('data-testid="ai-target-option"'))
assert.ok(panel.includes("title: tg('ai.targetConfirmTitle'"), 'target switch asks first')
// 新对话 archives instead of clearing
const newChat = panel.slice(panel.indexOf('const startNewChat'), panel.indexOf('const [historyOpen'))
assert.ok(newChat.includes('archiveCurrent()'))
assert.ok(newChat.indexOf('archiveCurrent()') < newChat.indexOf('setChatHistory'), 'archive before clearing the live key')
assert.ok(header.includes('onClick={startNewChat}'))
assert.ok(panel.includes('groupArchives(archives,'), 'history grouped by host')
assert.ok(panel.includes('data-testid="ai-history-item"') && panel.includes('restoreArchived(it.id)'))
// offline / general
assert.ok(panel.includes('data-testid="ai-reconnect"') && panel.includes("tg('ai.reconnectToContinue')"))
assert.ok(panel.includes('disabled={(!input.trim() && !pasteBlocks.length) || convOffline}')) // D94: paste blocks alone can be sent
assert.ok(panel.includes('data-testid="ai-general-mode"'))
const actions = panel.slice(panel.indexOf('const commandActions'), panel.indexOf('<SafetyCommandBar', panel.indexOf('const commandActions')))
assert.ok(actions.includes('!conversation ?') && actions.includes('data-testid="ai-no-execute"'), 'general Q&A has no execute buttons')
// target is locked while a reply streams
assert.ok(header.includes('disabled={aiTargets.length === 0 || busy}'), 'target switcher locked while streaming')

// main store + IPC
const store = norm('src/main/app-store.ts')
assert.ok(store.includes('export function addAiChatArchive') && store.includes('export function takeAiChatArchive'))
const main = norm('src/main/index.ts')
assert.ok(main.includes("'ai:chatArchive:list'") && main.includes("'ai:chatArchive:add'") && main.includes("'ai:chatArchive:take'"))
const preload = norm('src/preload/index.ts')
assert.ok(preload.includes('chatArchive: {'))

const i18n = norm('src/renderer/src/lib/i18n.tsx')
assert.ok(i18n.includes("'ai.reconnectToContinue': '终端已断开 · 重新连接后继续'"))
assert.ok(changelogFor('0.6.61').length > 0)
console.log('test-m23-tab-conversations: ok')
