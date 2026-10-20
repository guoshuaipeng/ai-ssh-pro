import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canTrust, hostKeyLabel, hostKeyType, verifyCommand } from '../src/shared/host-key-info'
import { failedContext, rememberFailed, FAILED_OUTPUT_CAP } from '../src/shared/failed-output'
import { getDraft, putDraft } from '../src/shared/cmd-drafts'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }
const blob = (name: string) => { const b = Buffer.alloc(4 + name.length + 8); b.writeUInt32BE(name.length, 0); b.write(name, 4, 'ascii'); return b }

ok('D23 key type parsed from wire blob, labels and verify command', () => {
  assert.equal(hostKeyType(blob('ssh-ed25519')), 'ssh-ed25519')
  assert.equal(hostKeyType(Buffer.from([0, 0, 0, 200, 1, 2, 3, 4])), undefined)
  assert.equal(hostKeyType(Buffer.alloc(2)), undefined)
  assert.equal(hostKeyLabel('ecdsa-sha2-nistp256'), 'ECDSA-256')
  assert.equal(hostKeyLabel('ssh-rsa'), 'RSA')
  assert.equal(verifyCommand('ssh-ed25519'), 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub')
  assert.equal(verifyCommand(undefined), 'ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub')
})
ok('D23 changed key needs explicit verification; expiry closes dialog', () => {
  assert.equal(canTrust('unknown', false), true)
  assert.equal(canTrust('changed', false), false)
  assert.equal(canTrust('changed', true), true)
  const m = readFileSync('src/renderer/src/components/HostKeyConfirmModal.tsx', 'utf8')
  assert.ok(m.includes('hk-verified') && m.includes('hk-copy-fp') && m.includes('hk-copy-cmd'))
  assert.ok(readFileSync('src/main/host-key-prompt.ts', 'utf8').includes("'ssh:hostKeyExpired'"))
  assert.ok(readFileSync('src/renderer/src/App.tsx', 'utf8').includes('onHostKeyExpired'))
})
ok('D22b uses in-session output, falls back to command + exit, success clears', () => {
  const s = new Map<string, string>()
  assert.deepEqual(failedContext(s, 's1', 'make', 2), { text: '$ make\n(exit 2)', hasOutput: false })
  rememberFailed(s, 's1', 'make', 2, '$ make\nerror: x')
  assert.equal(failedContext(s, 's1', 'make ', 2).hasOutput, true)
  assert.equal(failedContext(s, 's2', 'make', 2).hasOutput, false, 'per session')
  rememberFailed(s, 's1', 'make', 0, 'ok')
  assert.equal(failedContext(s, 's1', 'make', 2).hasOutput, false)
  for (let i = 0; i < FAILED_OUTPUT_CAP + 5; i++) rememberFailed(s, 's', 'c' + i, 1, 'x')
  assert.equal(s.size, FAILED_OUTPUT_CAP)
  const lib = readFileSync('src/renderer/src/lib/failed-output.ts', 'utf8')
  assert.ok(!/localStorage|electron-store|aiss\.\w+\.save/.test(lib), 'never persisted')
})
ok('D22b ask buttons wired in command bar and Ctrl+R', () => {
  assert.ok(readFileSync('src/renderer/src/components/CommandInput.tsx', 'utf8').includes('suggest-ask-failed'))
  assert.ok(readFileSync('src/renderer/src/components/QuickPick.tsx', 'utf8').includes('qp-ask-failed'))
})
ok('D24 drafts kept per session, empty deletes, capped', () => {
  const s = new Map<string, string>()
  putDraft(s, 'a', 'ls -la'); putDraft(s, 'b', 'df')
  assert.equal(getDraft(s, 'a'), 'ls -la'); assert.equal(getDraft(s, 'b'), 'df')
  putDraft(s, 'a', ''); assert.equal(s.has('a'), false)
  for (let i = 0; i < 150; i++) putDraft(s, 'x' + i, 'v')
  assert.equal(s.size, 100)
  assert.ok(readFileSync('src/renderer/src/components/SessionCommandBar.tsx', 'utf8').includes('getDraft(drafts, sessionId)'))
})
console.log(`test-cycle14: ${n} passed`)
