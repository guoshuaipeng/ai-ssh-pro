import assert from 'node:assert/strict'
import { parseQuickTarget, parseHop, quickTargetLabel, matchProfile } from '../src/shared/quick-connect'
import { blockNavIndex, blockNavKey } from '../src/shared/block-nav'
import { atIdlePrompt, canInject, integrationVerdict, parseOsc133, shellIntegrationEnabled, shellIntegrationScript, SHELL_INT_KEY } from '../src/shared/shell-integration'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }

ok('D13 user@host:port', () => {
  assert.deepEqual(parseQuickTarget('ops@10.0.0.5:2222'), { host: '10.0.0.5', port: 2222, username: 'ops' })
  assert.deepEqual(parseQuickTarget('root@web-01.example.com'), { host: 'web-01.example.com', port: 22, username: 'root' })
  assert.deepEqual(parseQuickTarget('10.0.0.5'), { host: '10.0.0.5', port: 22 })
  assert.deepEqual(parseQuickTarget('u@[fe80::1]:2200'), { host: 'fe80::1', port: 2200, username: 'u' })
})
ok('D13 plain search words are not targets', () => {
  assert.equal(parseQuickTarget('nginx'), null)
  assert.equal(parseQuickTarget('demo web'), null)
  assert.equal(parseQuickTarget('a@b:99999'), null)
  assert.equal(parseQuickTarget('999.1.1.1'), null)
  assert.equal(parseQuickTarget(''), null)
})
ok('D13 pasted ssh command with -p -i -J -l -o', () => {
  assert.deepEqual(parseQuickTarget('ssh -p 2222 -i ~/.ssh/id_ed25519 deploy@app.internal'), { host: 'app.internal', port: 2222, username: 'deploy', identity: '~/.ssh/id_ed25519' })
  assert.deepEqual(parseQuickTarget('ssh -J ops@bastion:2200,jump2 -l admin db1'), {
    host: 'db1', port: 22, username: 'admin', jump: [{ host: 'bastion', port: 2200, username: 'ops' }, { host: 'jump2', port: 22 }]
  })
  assert.deepEqual(parseQuickTarget('ssh -oPort=2022 -o User=git host.example uptime'), { host: 'host.example', port: 2022, username: 'git' })
  assert.deepEqual(parseQuickTarget('ssh -i "/k/my key" -A h1'), { host: 'h1', port: 22, identity: '/k/my key' })
  assert.equal(parseQuickTarget('ssh -p'), null)
  assert.equal(parseQuickTarget('ssh -p abc h'), null)
  assert.equal(parseQuickTarget('ssh'), null)
})
ok('D13 label + profile match', () => {
  assert.equal(quickTargetLabel({ host: 'h', port: 22 }), 'h')
  assert.equal(quickTargetLabel({ host: 'fe80::1', port: 2200, username: 'u' }), 'u@[fe80::1]:2200')
  const ps = [{ id: 'a', host: 'h', port: 22, username: 'ops' }, { id: 'b', host: 'h', port: 2222, username: 'root' }]
  assert.equal(matchProfile(ps, { host: 'h', port: 2222 })?.id, 'b')
  assert.equal(matchProfile(ps, { host: 'h', port: 22, username: 'x' }), null)
  assert.equal(parseHop('bastion')?.host, 'bastion')
})
ok('D15 nav index', () => {
  const lines = [10, 40, 90]
  assert.equal(blockNavIndex(lines, 80, true, 'prev'), 2)
  assert.equal(blockNavIndex(lines, 40, false, 'prev'), 0)
  assert.equal(blockNavIndex(lines, 10, false, 'prev'), null)
  assert.equal(blockNavIndex(lines, 10, false, 'next'), 1)
  assert.equal(blockNavIndex(lines, 90, false, 'next'), null)
  assert.equal(blockNavIndex(lines, 80, true, 'next'), null)
  assert.equal(blockNavIndex([], 0, true, 'prev'), null)
})
ok('D15 nav key', () => {
  const k = (key: string, o: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({ key, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, ...o })
  assert.equal(blockNavKey(k('ArrowUp'), false), 'prev')
  assert.equal(blockNavKey(k('ArrowDown'), false), 'next')
  assert.equal(blockNavKey(k('ArrowUp'), true), null)
  assert.equal(blockNavKey(k('ArrowUp', { shiftKey: true }), false), null)
  assert.equal(blockNavKey(k('ArrowUp', { ctrlKey: false }), false), null)
})
ok('D14 opt-in default off', () => {
  assert.equal(shellIntegrationEnabled(() => null), false)
  assert.equal(shellIntegrationEnabled((k) => (k === SHELL_INT_KEY ? '1' : null)), true)
})
ok('D14 script: leading space, single line, bash+zsh, idempotent guard, 133;D + 7', () => {
  const s = shellIntegrationScript()
  assert.ok(s.startsWith(' '))
  assert.ok(!/[\r\n]/.test(s))
  assert.ok(s.includes('BASH_VERSION') && s.includes('ZSH_VERSION'))
  assert.ok(s.includes('*";__aiss_si;"*'))
  assert.ok(s.includes('add-zsh-hook precmd __aiss_si'))
  assert.ok(s.includes("\\033]133;D;%s\\007") && s.includes('\\033]7;file://'))
})
ok('D14 parse OSC 133', () => {
  assert.deepEqual(parseOsc133('D;1'), { kind: 'D', code: 1 })
  assert.deepEqual(parseOsc133('D'), { kind: 'D', code: null })
  assert.deepEqual(parseOsc133('A'), { kind: 'A', code: null })
  assert.deepEqual(parseOsc133('D;0;aid=1'), { kind: 'D', code: 0 })
  assert.equal(parseOsc133('Z;1'), null)
})
ok('D14 verdict + fallback', () => {
  assert.equal(integrationVerdict(null, false, 0), 'off')
  assert.equal(integrationVerdict(0, false, 1000), 'pending')
  assert.equal(integrationVerdict(0, false, 6000), 'unsupported')
  assert.equal(integrationVerdict(0, true, 6000), 'active')
})
ok('D14 inject only at an idle writable prompt', () => {
  const base = { enabled: true, inputBlocked: false, mirrorOnly: false, alternate: false, already: false, idle: true }
  assert.equal(canInject(base), true)
  assert.equal(canInject({ ...base, inputBlocked: true }), false)
  assert.equal(canInject({ ...base, alternate: true }), false)
  assert.equal(canInject({ ...base, already: true }), false)
  assert.equal(canInject({ ...base, idle: false }), false)
  assert.equal(atIdlePrompt('ops@web:~$ '), true)
  assert.equal(atIdlePrompt('[root@db /]# '), true)
  assert.equal(atIdlePrompt('ops@web:~$ ls -l'), false)
  assert.equal(atIdlePrompt(''), false)
})
console.log(`cycle8: ${n} passed`)
