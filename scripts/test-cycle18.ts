import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lastCwdOf, runInCwdLine, withCwd } from '../src/shared/history-exit'
import { rankHistoryPick } from '../src/shared/quick-pick'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const E = (command: string, lastCwd?: string) => ({ command, hostKey: 'h', count: 1, lastUsed: 1, ...(lastCwd ? { lastCwd } : {}) })

ok('D30 SFTP path bar wraps; no double slash after root', () => {
  const css = readFileSync('src/renderer/src/styles-m2.css', 'utf8')
  assert.ok(css.includes('.sftp-pathbar { flex-wrap: wrap;'))
  assert.ok(readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8').includes("arr[i - 1]!.label !== '/'"))
})
ok('D31 cwd recorded per host + command, not for cd itself', () => {
  const all = [E('make'), E('cd /srv')]
  const next = withCwd(all, 'h', 'make', '/srv/app')
  assert.equal(lastCwdOf(next, 'h', 'make'), '/srv/app')
  assert.equal(withCwd(next, 'h', 'make', '/srv/app'), next, 'unchanged')
  assert.equal(withCwd(all, 'h', 'cd /srv', '/'), all)
  assert.equal(withCwd(all, 'h', 'make', 'C:\\x'), all, 'posix only')
})
ok('D31 run-in-cwd line: no leading space, quoted, skipped when same dir', () => {
  assert.equal(runInCwdLine("/srv/it's", 'make', '/'), "cd -- '/srv/it'\\''s' && make")
  assert.equal(runInCwdLine('/srv', 'make', '/srv'), null)
  assert.equal(runInCwdLine('~', 'ls', '/'), 'cd && ls')
  const items = rankHistoryPick({ query: 'make', hostKey: 'h', entries: [E('make', '/srv')] })
  assert.equal(items[0]?.cwd, '/srv')
  assert.ok(readFileSync('src/renderer/src/components/QuickPick.tsx', 'utf8').includes('qp-run-in-cwd'))
})
ok('D33 Ctrl+Enter runs only plain commands on normal hosts', () => {
  const qp = readFileSync('src/renderer/src/components/QuickPick.tsx', 'utf8')
  assert.ok(qp.includes("e.ctrlKey || e.metaKey ? { run: true } : undefined"))
  assert.ok(app.includes("if (level === 'normal' && !risky)") && app.includes("tg(risky ? 'd33.risky' : 'd33.protected')"))
})
console.log(`test-cycle18: ${n} passed`)
