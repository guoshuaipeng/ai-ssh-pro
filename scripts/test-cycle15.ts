import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureChunk, captureExit, captureStart, failedContext, rememberFailed, type Capture } from '../src/shared/failed-output'
import { cwdFromWinPrompt, localStartCwd } from '../src/shared/session-cwd'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }

ok('D22c captures failed output tail without blocks, redacted', () => {
  const caps = new Map<string, Capture>(); const s = new Map<string, string>()
  captureStart(caps, 's1', 'make build')
  captureChunk(caps, 's1', 'make build\r\n\u001b[31merror\u001b[0m: token=abc123 missing\r\n')
  captureExit(caps, s, 's1', 2)
  const c = failedContext(s, 's1', 'make build', 2)
  assert.equal(c.hasOutput, true)
  assert.ok(c.text.startsWith('$ make build\nerror: '), c.text)
  assert.ok(!c.text.includes('abc123'), 'redacted')
  assert.equal(caps.size, 0)
})
ok('D22c success clears, sensitive never captured, tail capped', () => {
  const caps = new Map<string, Capture>(); const s = new Map<string, string>()
  captureStart(caps, 's', 'ls'); captureChunk(caps, 's', 'x'); captureExit(caps, s, 's', 1)
  captureStart(caps, 's', 'ls'); captureExit(caps, s, 's', 0)
  assert.equal(failedContext(s, 's', 'ls', 1).hasOutput, false)
  captureStart(caps, 's', 'mysql -u root -psecret'); assert.equal(caps.size, 0)
  rememberFailed(s, 's', 'curl -H "Authorization: Bearer xyz" x', 1, 'out'); assert.equal(s.size, 0)
  captureStart(caps, 's', 'yes'); captureChunk(caps, 's', 'y\n'.repeat(10000)); captureExit(caps, s, 's', 1)
  assert.ok(failedContext(s, 's', 'yes', 1).text.length <= 4000 + 10)
  const lib = readFileSync('src/renderer/src/lib/failed-output.ts', 'utf8')
  assert.ok(!/localStorage|writeFile|aiss\.\w+\.save/.test(lib), 'memory only')
})
ok('D24b bar keyed by tab id; AI mode kept', () => {
  const bar = readFileSync('src/renderer/src/components/SessionCommandBar.tsx', 'utf8')
  assert.ok(bar.includes('aiModes') && bar.includes('loadDraft(barKey, sessionId)'))
  assert.ok(readFileSync('src/renderer/src/App.tsx', 'utf8').includes('draftKey={activeTab.tabId}'))
})
ok('D20b Windows prompt cwd and validated local start dir', () => {
  assert.equal(cwdFromWinPrompt('PS C:\\Users\\a b> '), 'C:\\Users\\a b')
  assert.equal(cwdFromWinPrompt('D:\\work>'), 'D:\\work')
  assert.equal(cwdFromWinPrompt('echo C:\\x> y'), null)
  assert.equal(localStartCwd('C:\\proj', 'H', () => true), 'C:\\proj')
  assert.equal(localStartCwd('C:\\gone', 'H', () => { throw new Error('ENOENT') }), 'H')
  assert.equal(localStartCwd('rel/dir', 'H', () => true), 'H')
  assert.equal(localStartCwd('~/src', '/home/u', () => true), '/home/u/src')
  assert.ok(readFileSync('src/main/local-shell.ts', 'utf8').includes('localStartCwd('))
})
console.log(`test-cycle15: ${n} passed`)
