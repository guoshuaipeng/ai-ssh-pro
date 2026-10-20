/** C3: agent forwarding — policy helpers and connect config. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ConnectConfig } from 'ssh2'
import { agentForwardAuditDetail, agentForwardEnabled, agentForwardNeedsConfirm } from '../src/shared/agent-forward'
import { applyAgentForward } from '../src/main/ssh-auth'

let n = 0
const ok = (s: string) => {
  n++
  console.log('ok -', s)
}
assert.equal(agentForwardNeedsConfirm(true, 'readonly'), true)
assert.equal(agentForwardNeedsConfirm(true, 'production'), true)
assert.equal(agentForwardNeedsConfirm(true, 'normal'), false)
assert.equal(agentForwardNeedsConfirm(false, 'production'), false, 'turning off never asks')
ok('confirm only when enabling on protected hosts')
assert.equal(agentForwardEnabled(undefined), false)
assert.equal(agentForwardEnabled('true'), false)
assert.equal(agentForwardEnabled(true), true)
ok('default off; only explicit true')

{
  const c: ConnectConfig = {}
  applyAgentForward(c, false, '/tmp/a.sock')
  assert.deepEqual(c, {}, 'off leaves config alone')
  applyAgentForward(c, true, '/tmp/a.sock')
  assert.equal(c.agent, '/tmp/a.sock')
  assert.equal(c.agentForward, true)
  const k: ConnectConfig = { agent: '/run/existing' }
  applyAgentForward(k, true, '/tmp/other')
  assert.equal(k.agent, '/run/existing', 'reuses the agent already used for auth')
  const saved = process.env.SSH_AUTH_SOCK
  delete process.env.SSH_AUTH_SOCK
  if (process.platform !== 'win32') assert.throws(() => applyAgentForward({}, true, ''), /SSH Agent|SSH agent/)
  if (saved !== undefined) process.env.SSH_AUTH_SOCK = saved
  ok('applyAgentForward')
}
assert.match(agentForwardAuditDetail('on', 'web-01'), /enabled for web-01/)
assert.match(agentForwardAuditDetail('session', 'web-01'), /session on web-01/)
ok('audit detail')

// wiring: only the target config gets it, after auth; jump hops never do
const mgr = readFileSync('src/main/ssh-manager.ts', 'utf8')
const i = mgr.indexOf('applyAgentForward(targetConfig')
assert.ok(i > 0 && i > mgr.indexOf('await applyAuth(targetConfig'), 'target only, after auth')
assert.equal(mgr.split('applyAgentForward(').length - 1, 1, 'no hop gets agent forwarding')
const modal = readFileSync('src/renderer/src/components/ConnectionConfigModal.tsx', 'utf8')
assert.ok(modal.includes("type: 'agentForward.change'"), 'toggle audited')
assert.ok(modal.includes('agentForwardNeedsConfirm(next, protection)'), 'confirm on protected hosts')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.equal(app.split("type: 'session.agentForward'").length - 1, 2, 'connect and reconnect audited')
ok('wiring')
console.log(`\n${n} passed`)
