import assert from 'node:assert/strict'
import { applyExitHits, blockExitEnabled, blockFailed, blockWire, createBlockExitParser, failedBlockContext, BLOCK_EXIT_PREF_KEY } from '../src/shared/block-exit'
import { startBlock, appendBlockOutput } from '../src/shared/terminal-blocks'
import { pasteDecision, canSkipHost, parseSkipHosts, withSkipHost } from '../src/shared/paste-skip'
import { planPaste } from '../src/shared/paste-plan'
import { followTarget, sftpFollowEnabled, SFTP_FOLLOW_KEY } from '../src/shared/sftp-follow'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }

ok('D11 exit capture default on, stored off', () => {
  assert.equal(blockExitEnabled(() => null), true)
  assert.equal(blockExitEnabled((k) => (k === BLOCK_EXIT_PREF_KEY ? '0' : null)), false)
})
ok('D11 wire marks eligible commands only when capturing', () => {
  assert.equal(blockWire('ls -l', false, 'abcd1234'), 'ls -l')
  assert.ok(blockWire('ls -l', true, 'abcd1234').startsWith("ls -l; printf '\\033]777;aiss-exit;%s;%d\\007' abcd1234 $?"))
  assert.equal(blockWire('vim a.txt', true, 'abcd1234'), 'vim a.txt')
  assert.equal(blockWire('sleep 9 &', true, 'abcd1234'), 'sleep 9 &')
})
ok('D11 parser strips marker split across chunks and finishes the running block', () => {
  const p = createBlockExitParser()
  let blocks = startBlock([], 'false', 1)
  const a = p.feed('oops\r\n\x1b]777;aiss-ex')
  blocks = applyExitHits(appendBlockOutput(blocks, a.clean), a.hits)
  assert.equal(blocks[0]!.running, true)
  const b = p.feed('it;abcd1234;2\x07$ ')
  blocks = applyExitHits(appendBlockOutput(blocks, b.clean), b.hits)
  assert.equal(blocks[0]!.exitCode, 2)
  assert.equal(blocks[0]!.running, false)
  assert.ok(!blocks[0]!.output.includes('777'))
  assert.equal(blockFailed(blocks[0]!), true)
})
ok('D11 hit without running block ignored; 0 / null not failed', () => {
  assert.deepEqual(applyExitHits([], [{ nonce: 'x', code: 1 }]), [])
  const b = applyExitHits(startBlock([], 'true', 1), [{ nonce: 'x', code: 0 }])
  assert.equal(blockFailed(b[0]!), false)
  assert.equal(blockFailed({ running: false, exitCode: null }), false)
})
ok('D11 failed context keeps command + output tail', () => {
  const ctx = failedBlockContext({ command: 'make', output: 'x'.repeat(5000) + 'END\n' }, 100)
  assert.ok(ctx.startsWith('$ make\n'))
  assert.ok(ctx.endsWith('END'))
  assert.ok(ctx.length < 120)
})
const ml = planPaste('ls\npwd\n')
const risky = planPaste('ls\nreboot\n')
ok('D7b single line never previews', () => {
  assert.equal(pasteDecision(planPaste('ls'), { strict: true, skipHost: false, bracketed: false }), 'paste')
})
ok('D7b strict hosts always preview, even skipped or bracketed', () => {
  assert.equal(pasteDecision(ml, { strict: true, skipHost: true, bracketed: true }), 'preview')
  assert.equal(canSkipHost(true, 'h'), false)
  assert.equal(canSkipHost(false, 'h'), true)
})
ok('D7b risky lines always preview', () => {
  assert.ok(risky.risky.length > 0)
  assert.equal(pasteDecision(risky, { strict: false, skipHost: true, bracketed: true }), 'preview')
})
ok('D7b skip host / bracketed paste skip preview on normal hosts', () => {
  assert.equal(pasteDecision(ml, { strict: false, skipHost: true, bracketed: false }), 'paste')
  assert.equal(pasteDecision(ml, { strict: false, skipHost: false, bracketed: true }), 'paste')
  assert.equal(pasteDecision(ml, { strict: false, skipHost: false, bracketed: false }), 'preview')
})
ok('D7b skip list parse / toggle', () => {
  assert.deepEqual(parseSkipHosts('nope'), [])
  assert.deepEqual(parseSkipHosts('["a",1,""]'), ['a'])
  assert.deepEqual(withSkipHost(['a'], 'b', true), ['a', 'b'])
  assert.deepEqual(withSkipHost(['a', 'b'], 'a', false), ['b'])
  assert.deepEqual(withSkipHost(['a'], 'a', true), ['a'])
})
ok('D12 follow default on', () => {
  assert.equal(sftpFollowEnabled(() => null), true)
  assert.equal(sftpFollowEnabled((k) => (k === SFTP_FOLLOW_KEY ? '0' : null)), false)
})
ok('D12 follow target', () => {
  assert.equal(followTarget({ follow: true, cwd: '/var/log', current: '/etc', home: '/root' }), '/var/log')
  assert.equal(followTarget({ follow: true, cwd: '~/app', current: '/etc', home: '/root' }), '/root/app')
  assert.equal(followTarget({ follow: true, cwd: '~', current: '/etc', home: '/root' }), '/root')
  assert.equal(followTarget({ follow: true, cwd: '~/x', current: '/etc', home: null }), null)
  assert.equal(followTarget({ follow: true, cwd: '/etc/', current: '/etc', home: null }), null)
  assert.equal(followTarget({ follow: false, cwd: '/var', current: '/etc', home: null }), null)
  assert.equal(followTarget({ follow: true, cwd: null, current: '/etc', home: null }), null)
})
console.log(`cycle7: ${n} passed`)
