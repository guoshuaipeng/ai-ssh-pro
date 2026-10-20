import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isNewTyped, parseOsc133, parseOsc133E, shellIntegrationScript } from '../src/shared/shell-integration'
import { captureChunk, captureCommand, captureExit, failedContext, type Capture } from '../src/shared/failed-output'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')

ok('D22d hook reports the history line before D and keeps $?', () => {
  const s = shellIntegrationScript()
  assert.ok(s.includes("\\033]133;E;%s\\007\\033]133;D;%s\\007"))
  assert.ok(s.includes('fc -l -1') && s.includes("tr -d '\\000-\\037'") && s.includes('return $e'))
  assert.deepEqual(parseOsc133E('E;  42  make build'), { num: 42, command: 'make build' })
  assert.deepEqual(parseOsc133E('E;7* ls -la'), { num: 7, command: 'ls -la' })
  assert.equal(parseOsc133E('E;'), null)
  assert.equal(parseOsc133('E;1 x'), null, 'E is not an ABCD marker')
  assert.equal(isNewTyped(42, 42), false)
  assert.equal(isNewTyped(undefined, 1), true)
})
ok('D22d rolling capture attributes typed output; sensitive dropped', () => {
  const caps = new Map<string, Capture>(); const s = new Map<string, string>()
  captureChunk(caps, 's', 'ls /nope\n', false); assert.equal(caps.size, 0, 'no rolling without integration')
  captureChunk(caps, 's', 'u@h:~$ ls /nope\r\nls: cannot access\r\n', true)
  captureCommand(caps, 's', 'ls /nope'); captureExit(caps, s, 's', 2)
  assert.equal(failedContext(s, 's', 'ls /nope', 2).text, '$ ls /nope\nls: cannot access')
  captureChunk(caps, 's', 'secret out', true); captureCommand(caps, 's', 'mysql -psecret'); captureExit(caps, s, 's', 1)
  assert.equal(s.size, 1)
  captureChunk(caps, 's', 'no cmd', true); captureExit(caps, s, 's', 1); assert.equal(s.size, 1, 'unattributed output dropped')
})
ok('D22d history: typed commands recorded once, stale lastCmd cleared', () => {
  const h = readFileSync('src/renderer/src/lib/history-exit.ts', 'utf8')
  assert.ok(h.includes('SHELL_CMD_EVENT') && h.includes('fromBar.has(d.sessionId)') && h.includes('lastCmd.delete(d.sessionId)'))
  assert.ok(readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8').includes('parseOsc133E(data)'))
})
ok('D25 new local shell inherits the active local tab folder', () => {
  assert.ok(app.includes("fromSid.startsWith('local:') ? getSessionCwd(fromSid)"))
  assert.ok(app.includes("tg('d25.openedIn'"))
})
ok('D26 duplicate returns to the same folder; local tabs duplicable', () => {
  assert.ok(app.includes('const duplicateTab = useCallback'))
  assert.ok(!app.includes("void openSession(tab.connectOpts, { profileId: tab.profileId, hostInventoryId: tab.hostInventoryId, kind: 'ssh' })\n"), 'both entries use duplicateTab')
  assert.ok(app.includes("tab.kind === 'local' ? localShellAvailable"))
})
console.log(`test-cycle16: ${n} passed`)
