import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { advanceScript, afterExit, skipStep } from '../src/shared/ai-script'
import { interruptRunning, type TermBlock } from '../src/shared/terminal-blocks'
import { filterRecent, recentSaveTarget } from '../src/shared/recent-quick'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }

ok('D20 (D2 check) every SSH reconnect path goes through reconnectTab, which restores cwd', () => {
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  const calls = app.match(/window\.aiss\.ssh\.connect\(/g) ?? []
  assert.equal(calls.length, 2, 'openSession + reconnectTab only')
  const body = app.slice(app.indexOf('const reconnectTab = useCallback'), app.indexOf('reconnectTabRef.current = reconnectTab'))
  assert.ok(body.includes('cdCommandFor(prevCwd)'))
})
ok('D20 reconnect keeps blocks, marks the running one interrupted', () => {
  const b = (id: string, running: boolean): TermBlock => ({ id, command: id, output: '', exitCode: running ? null : 0, running, collapsed: false, large: false })
  const list = [b('a', false), b('tail', true)]
  const out = interruptRunning(list)
  assert.equal(out.length, 2)
  assert.equal(out[1].running, false)
  assert.equal(out[1].interrupted, true)
  assert.equal(out[0].interrupted, undefined)
  const idle = [b('a', false)]
  assert.equal(interruptRunning(idle), idle, 'unchanged list is returned as is')
})
ok('D16c waits for the exit code when observable; failure pauses, success moves on', () => {
  const run = { sessionId: 's', steps: ['a', 'b', 'c'], index: 0 }
  const w = advanceScript(run, 'a', true)
  assert.ok(w && w !== 'same' && w.awaiting)
  assert.equal(advanceScript(w as never, 'a', true), 'same')
  const ok0 = afterExit(w as never, 0)
  assert.equal(ok0.event, 'next')
  assert.equal(ok0.run?.index, 1)
  const fail = afterExit(w as never, 2)
  assert.equal(fail.event, 'paused')
  assert.deepEqual(fail.run?.paused, { code: 2 })
  assert.equal(advanceScript(fail.run!, 'b', true), 'same', 'paused: nothing advances')
  assert.equal(skipStep(fail.run!).run?.index, 1)
  assert.equal(skipStep({ ...run, index: 2 }).event, 'done')
  assert.equal(afterExit(run, 1).event, 'ignored')
  assert.deepEqual(advanceScript(run, 'a', false), { ...run, index: 1 }, 'no exit code source: old behaviour')
})
ok('D21 filter Recent and pre-fill save', () => {
  const rows = [
    { host: '10.0.0.11', port: 22, username: 'ops', label: 'demo-web-01' },
    { host: '203.0.113.7', port: 2222, username: 'deploy', jump: [{ host: 'bastion.example.com', port: 22 }] },
    { host: 'db1', port: 22, username: 'root' }
  ]
  assert.equal(filterRecent(rows, '').length, 3)
  assert.deepEqual(filterRecent(rows, 'web').map((r) => r.host), ['10.0.0.11'])
  assert.deepEqual(filterRecent(rows, 'bastion').map((r) => r.host), ['203.0.113.7'])
  assert.deepEqual(filterRecent(rows, ':2222 deploy').map((r) => r.host), ['203.0.113.7'])
  assert.deepEqual(filterRecent(rows, 'ROOT').map((r) => r.host), ['db1'])
  const s = recentSaveTarget({ host: 'h', port: 2200, username: 'u', label: 'Prod API', identity: '~/.ssh/k', jump: [{ host: 'j', port: 22 }] })
  assert.equal(s.label, 'Prod API')
  assert.deepEqual(s.target, { host: 'h', port: 2200, username: 'u', identity: '~/.ssh/k', jump: [{ host: 'j', port: 22 }] })
  assert.deepEqual(recentSaveTarget({ host: 'h', port: 22, username: 'u' }).target, { host: 'h', port: 22, username: 'u' })
})
console.log(`cycle12: ${n} passed`)
