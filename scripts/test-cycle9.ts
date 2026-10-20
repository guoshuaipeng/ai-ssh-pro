import assert from 'node:assert/strict'
import { createOriginSet, fillableCommand } from '../src/shared/ai-fill'
import { ExitCaptureRegistry } from '../src/main/exit-capture'
let n = 0
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok - ' + name) }

await ok('D16 fillable: single shell line, $ prompt stripped', () => {
  assert.equal(fillableCommand('systemctl status nginx\n', 'bash'), 'systemctl status nginx')
  assert.equal(fillableCommand('$ df -h', ''), 'df -h')
  assert.equal(fillableCommand('# check\nfree -m', 'sh'), 'free -m')
})
await ok('D16 not fillable: multi-line, other langs, heredoc, continuation', () => {
  assert.equal(fillableCommand('a\nb', 'bash'), null)
  assert.equal(fillableCommand('print(1)', 'python'), null)
  assert.equal(fillableCommand('cat <<EOF', 'bash'), null)
  assert.equal(fillableCommand('ls \\', 'bash'), null)
  assert.equal(fillableCommand('   ', 'bash'), null)
})
await ok('D16 origin set per session, bounded', () => {
  const s = createOriginSet(2)
  s.mark('s1', 'ls ')
  assert.equal(s.has('s1', 'ls'), true)
  assert.equal(s.has('s2', 'ls'), false)
  s.mark('s1', 'a'); s.mark('s1', 'b')
  assert.equal(s.has('s1', 'ls'), false)
})
await ok('D14b not integrated: AI command still wrapped', () => {
  const r = new ExitCaptureRegistry()
  const p = r.prepare('s', 'ls -l')
  assert.ok(p.nonce && p.wire.includes('printf'))
})
await ok('D14b integrated: plain wire, exit from OSC 133;D (split across chunks), marker kept', async () => {
  const r = new ExitCaptureRegistry()
  r.setIntegrated('s', true)
  assert.equal(r.isIntegrated('s'), true)
  const p = r.prepare('s', 'false')
  assert.equal(p.wire, 'false')
  assert.ok(p.nonce)
  const w = r.wait('s', p.nonce!, 2000)
  const a = r.consume('s', 'false\r\n\x1b]133;')
  const b = r.consume('s', 'D;1\x07\x1b]7;file://h/tmp\x07$ ')
  assert.ok((a + b).includes('\x1b]133;D;1'))
  assert.equal(await w, 1)
  assert.deepEqual(r.outcome('s', 'false'), { exitCode: 1 })
})
await ok('D14b prompts without a queued AI command are ignored; order kept', async () => {
  const r = new ExitCaptureRegistry()
  r.setIntegrated('s', true)
  r.consume('s', '\x1b]133;D;0\x07')
  const p1 = r.prepare('s', 'true')
  const p2 = r.prepare('s', 'sh -c "exit 3"')
  const w1 = r.wait('s', p1.nonce!, 2000)
  const w2 = r.wait('s', p2.nonce!, 2000)
  r.consume('s', '\x1b]133;D;0\x07$ \x1b]133;D;3\x07$ ')
  assert.equal(await w1, 0)
  assert.equal(await w2, 3)
})
await ok('D14b turning off falls back to printf', () => {
  const r = new ExitCaptureRegistry()
  r.setIntegrated('s', true)
  r.setIntegrated('s', false)
  assert.ok(r.prepare('s', 'ls').wire.includes('printf'))
})
console.log(`cycle9: ${n} passed`)
