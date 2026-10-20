import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lastExitOf, upHistoryList, withExit } from '../src/shared/history-exit'
import { rankHistoryPick } from '../src/shared/quick-pick'
import { recentConnectTarget, shouldAskPassword } from '../src/shared/recent-quick'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }

const E = (command: string, hostKey: string, lastUsed: number, lastExit?: number) => ({ command, hostKey, count: 1, lastUsed, ...(lastExit == null ? {} : { lastExit }) })
ok('D22 exit codes recorded per host + command', () => {
  const all = [E('df -h', 'h1', 1), E('df -h', 'h2', 2)]
  const next = withExit(all, 'h1', 'df -h ', 1)
  assert.equal(next[0].lastExit, 1)
  assert.equal(next[1].lastExit, undefined)
  assert.equal(withExit(next, 'h1', 'df -h', 1), next, 'unchanged')
  assert.equal(withExit(all, 'h3', 'df -h', 1), all, 'unknown host: untouched')
  assert.equal(lastExitOf(next, 'h1', 'df -h'), 1)
  assert.equal(lastExitOf(next, 'h9', 'df -h'), 1, 'falls back to any host')
})
ok('D22 up-arrow walks this host first, then global, no duplicates', () => {
  const rows = [E('a', 'h1', 5), E('b', 'h2', 9), E('c', 'h1', 7)]
  assert.deepEqual(upHistoryList('h1', rows, ['b', 'a', 'z']), ['c', 'a', 'b', 'z'])
  assert.deepEqual(upHistoryList('', rows, ['b', 'z']), ['b', 'z'])
})
ok('D22 Ctrl+R marks last-failed and ranks it lower among equals', () => {
  const items = rankHistoryPick({ query: 'sys', hostKey: 'h', entries: [E('systemctl restart nginx', 'h', 1, 1), E('systemctl status nginx', 'h', 1, 0)] })
  assert.equal(items[0].label, 'systemctl status nginx')
  assert.equal(items[1].failed, 1)
  assert.equal(items[0].failed, undefined)
})
ok('D16d progress chip replaces per-step toasts', () => {
  const src = readFileSync('src/renderer/src/lib/ai-script-run.ts', 'utf8')
  assert.ok(!src.includes("tg(risky ? 'd16b.stepRisky' : 'd16b.step'"), 'no toast per step')
  assert.ok(src.includes('SCRIPT_STATE_EVENT'))
  const bar = readFileSync('src/renderer/src/components/SessionCommandBar.tsx', 'utf8')
  assert.ok(bar.includes('<ScriptProgress sessionId={sessionId} />'))
})
ok('D13d unsaved Recent rows connect directly; password asked only on auth failure without -i', () => {
  assert.deepEqual(recentConnectTarget({ host: 'h', port: 2200, username: 'u' }), { host: 'h', port: 2200, username: 'u' })
  assert.equal(recentConnectTarget({ host: 'h', port: 22, username: '' }), null)
  assert.equal(shouldAskPassword('auth', {}, 0), true)
  assert.equal(shouldAskPassword('auth', { identity: '~/.ssh/k' }, 0), false)
  assert.equal(shouldAskPassword('unreachable', {}, 0), false)
  assert.equal(shouldAskPassword('auth', {}, 3), false)
  const d = readFileSync('src/renderer/src/lib/dialogs.tsx', 'utf8')
  assert.ok(d.includes("current.secret ? 'password' : 'text'"))
})
console.log(`cycle13: ${n} passed`)
