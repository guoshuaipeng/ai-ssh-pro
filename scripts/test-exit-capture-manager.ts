import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ExitCaptureRegistry } from '../src/main/exit-capture'
import { stripEchoedMarker } from '../src/shared/exit-marker'

// B1 registry: the data path the SSH manager uses
const reg = new ExitCaptureRegistry()
const p = reg.prepare('s1', 'false')
assert.ok(p.nonce && p.wire.startsWith("false; printf '\\033]777;aiss-exit;"))
const wait = reg.wait('s1', p.nonce, 2000)
const shell = `$ ${p.wire}\r\n\x1b]777;aiss-exit;${p.nonce};1\x07$ `
// split mid-marker like a real chunked stream
const out = reg.consume('s1', shell.slice(0, shell.length - 12)) + reg.consume('s1', shell.slice(shell.length - 12))
assert.equal(await wait, 1)
assert.ok(!out.includes(`${p.nonce};1`), 'marker stripped')
assert.deepEqual(reg.outcome('s1', 'false'), { exitCode: 1 })
assert.equal(stripEchoedMarker(out).trim(), '$ false\r\n$')
// already-arrived code resolves at once
assert.equal(await reg.wait('s1', p.nonce, 1), 1)
// ineligible command is not marked
assert.equal(reg.prepare('s1', 'top').nonce, null)
// abort → null
{
  const q = reg.prepare('s1', 'sleep 30')
  const ac = new AbortController()
  const w = reg.wait('s1', q.nonce!, 5000, ac.signal)
  ac.abort()
  assert.equal(await w, null)
}
// session end → waiters released with null
{
  const q = reg.prepare('s3', 'sleep 30')
  const w = reg.wait('s3', q.nonce!, 5000)
  reg.drop('s3')
  assert.equal(await w, null)
  assert.equal(reg.has('s3'), false)
}
// unsupported shell (e.g. fish): two timeouts with no marker ever → stop marking
{
  for (let i = 0; i < 2; i++) {
    const q = reg.prepare('s2', 'true')
    assert.equal(await reg.wait('s2', q.nonce!, 10), null)
  }
  const q3 = reg.prepare('s2', 'true')
  assert.equal(q3.nonce, null)
  assert.equal(q3.unsupported, true)
}
// a session that has produced markers keeps capturing after timeouts (slow commands)
{
  for (let i = 0; i < 3; i++) {
    const q = reg.prepare('s1', 'sleep 30')
    assert.equal(await reg.wait('s1', q.nonce!, 5), null)
  }
  assert.ok(reg.prepare('s1', 'true').nonce)
}
// manager wiring (the manager itself imports Electron, so it is checked by source)
const mgr = readFileSync('src/main/ssh-manager.ts', 'utf8')
assert.ok(mgr.includes('this.trackWriteCommand(s, `${command}\\n`)'), 'tracks the command as typed, not the wire form')
assert.ok(mgr.includes('this.exitCapture.drop(sessionId)'))
assert.ok(mgr.includes('if (this.exitCapture.has(sessionId)) return mapSnapshot('))
console.log('test-exit-capture-manager: ok')
