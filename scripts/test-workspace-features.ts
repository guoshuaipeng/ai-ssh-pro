import assert from 'node:assert/strict'
import {
  COMMAND_HISTORY_CAP,
  RECENT_CONNECTIONS_CAP,
  filterCommandHistory,
  mergeRecentConnection,
  normalizeBatchRequest,
  normalizeCommandLine,
  normalizeHistory,
  normalizeLocale,
  normalizeRecentList,
  pushCommandHistory,
  removeRecent,
  setRecentPinned
} from '../src/shared/workspace-features'

const multiline = normalizeCommandLine('echo hi\nwhoami')
assert.equal(multiline, null)
assert.equal(normalizeCommandLine('  uname -a  '), 'uname -a')
assert.equal(normalizeCommandLine(''), null)

let history: string[] = []
history = pushCommandHistory(history, 'ls')
history = pushCommandHistory(history, 'pwd')
history = pushCommandHistory(history, 'ls')
assert.deepEqual(history, ['ls', 'pwd'])

for (let i = 0; i < COMMAND_HISTORY_CAP + 40; i++) {
  history = pushCommandHistory(history, `echo ${i}`)
}
assert.equal(history.length, COMMAND_HISTORY_CAP)
assert.equal(history[0], `echo ${COMMAND_HISTORY_CAP + 39}`)
assert.equal(normalizeHistory(['pwd', 'pwd', 'ls\nwhoami']).length, 1)

assert.deepEqual(filterCommandHistory(['uname -a', 'uptime', 'df -h'], 'u'), ['uname -a', 'uptime'])

const poisoned = {
  host: 'example.com',
  port: 22,
  username: 'root',
  label: 'edge',
  password: 's3cret',
  privateKeyPath: '/home/me/.ssh/id_rsa',
  passphrase: 'hidden'
}
const recent = mergeRecentConnection([], poisoned)
assert.equal(recent.length, 1)
assert.equal(recent[0]?.host, 'example.com')
assert.equal(recent[0]?.pinned, undefined)
assert.equal(JSON.stringify(recent).includes('s3cret'), false)
assert.equal(JSON.stringify(recent).includes('id_rsa'), false)
assert.equal(JSON.stringify(recent).includes('hidden'), false)

const pinned = setRecentPinned(recent, recent[0]!.id, true)
assert.equal(pinned[0]?.pinned, true)
const again = mergeRecentConnection(pinned, {
  host: 'example.com',
  port: 22,
  username: 'root',
  lastConnectedAt: Date.now()
})
assert.equal(again[0]?.pinned, true)
assert.equal(removeRecent(again, again[0]!.id).length, 0)

const many = []
for (let i = 0; i < RECENT_CONNECTIONS_CAP + 5; i++) {
  many.push({
    host: `h${i}.example`,
    port: 22,
    username: 'user',
    lastConnectedAt: i
  })
}
assert.equal(normalizeRecentList(many).length, RECENT_CONNECTIONS_CAP)

assert.equal(normalizeLocale('en'), 'en')
assert.equal(normalizeLocale('zh-CN'), 'zh-CN')
assert.equal(normalizeLocale('fr'), 'zh-CN')
assert.equal(normalizeLocale(undefined), 'zh-CN')

assert.deepEqual(normalizeBatchRequest({ command: '', sessionIds: ['a'] }), { error: 'empty-command' })
assert.deepEqual(normalizeBatchRequest({ command: 'uptime', sessionIds: [] }), { error: 'no-sessions' })
const ok = normalizeBatchRequest({ command: ' uptime ', sessionIds: ['a', 'a', 'b'] })
assert.equal('error' in ok, false)
if (!('error' in ok)) {
  assert.equal(ok.command, 'uptime')
  assert.deepEqual(ok.sessionIds, ['a', 'b'])
}

console.log('workspace-features ok')
