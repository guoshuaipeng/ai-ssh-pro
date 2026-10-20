import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cdCommandFor, cwdFromOsc7, cwdFromPrompt } from '../src/shared/session-cwd'
import { fuzzyMatch, highlightRuns, mruOrder, mruTouch, rankHistoryPick, rankSwitchPick } from '../src/shared/quick-pick'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }

ok('D2 prompt cwd', () => {
  assert.equal(cwdFromPrompt('root@web-01:/etc/nginx# '), '/etc/nginx')
  assert.equal(cwdFromPrompt('demo@demo-host:~/app$ '), '~/app')
  assert.equal(cwdFromPrompt('demo@demo-host:~$'), '~')
  assert.equal(cwdFromPrompt('[root@web-01 nginx]# '), null)
  assert.equal(cwdFromPrompt('echo hi'), null)
})
ok('D2 osc7', () => {
  assert.equal(cwdFromOsc7('file://web-01/var/log%20x'), '/var/log x')
  assert.equal(cwdFromOsc7('http://x/y'), null)
  assert.equal(cwdFromOsc7('file://h/a%0Ab'), null, 'control chars rejected')
})
ok('D2 cd command quoting', () => {
  assert.equal(cdCommandFor('/var/log'), " cd -- '/var/log'")
  assert.equal(cdCommandFor("/tmp/it's"), " cd -- '/tmp/it'\\''s'")
  assert.equal(cdCommandFor('~/app'), " cd -- ~/'app'")
  assert.equal(cdCommandFor('~'), null)
  assert.equal(cdCommandFor('relative'), null)
  assert.equal(cdCommandFor(null), null)
})
ok('fuzzy', () => {
  assert.ok(fuzzyMatch('systemctl status nginx', 'scs'))
  assert.equal(fuzzyMatch('df -h', 'xyz'), null)
  assert.ok(fuzzyMatch('tail -f /var/log/nginx', 'nginx')!.score > fuzzyMatch('tail -f /var/log/nginx', 'tfn')!.score)
  assert.deepEqual(highlightRuns('abc', [1]), [{ text: 'a', hit: false }, { text: 'b', hit: true }, { text: 'c', hit: false }])
})
ok('D3 history ranking', () => {
  const entries = [
    { command: 'df -h', hostKey: 'b', count: 9, lastUsed: 3 },
    { command: 'docker ps', hostKey: 'a', count: 1, lastUsed: 1 },
    { command: 'df -h', hostKey: 'a', count: 1, lastUsed: 2 }
  ]
  const r = rankHistoryPick({ query: 'd', hostKey: 'a', entries, snippets: [{ id: 's1', title: 'Disk', body: 'du -sh *' }, { id: 's2', title: 'multi', body: 'a\nb' }] })
  assert.deepEqual(r.map((x) => [x.label, x.badge]), [['df -h', 'host'], ['docker ps', 'host'], ['du -sh *', 'snippet']])
  const empty = rankHistoryPick({ query: '', hostKey: 'a', entries })
  assert.equal(empty[0]!.label, 'df -h', 'empty query: this host, most recent first')
})
ok('D4 MRU', () => {
  let m: string[] = []
  m = mruTouch(m, 'a'); m = mruTouch(m, 'b'); m = mruTouch(m, 'c'); m = mruTouch(m, 'a')
  assert.deepEqual(m, ['a', 'c', 'b'])
  assert.deepEqual(mruOrder(m, ['b', 'c', 'd']), ['c', 'b', 'd'])
})
ok('D4 switch ranking', () => {
  const r = rankSwitchPick({
    query: '',
    tabs: [{ tabId: 't1', title: 'web-01', connected: true }, { tabId: 't2', title: 'db-01', connected: false }],
    mru: ['t1', 't2'],
    currentTabId: 't1',
    hosts: [{ id: 'p1', label: 'cache-01' }]
  })
  assert.deepEqual(r.map((x) => [x.kind, x.value, x.badge ?? '']), [['tab', 't2', 'disconnected'], ['tab', 't1', 'current'], ['host', 'p1', '']])
  const f = rankSwitchPick({ query: 'cache', tabs: [{ tabId: 't1', title: 'web-01', connected: true }], mru: [], currentTabId: null, hosts: [{ id: 'p1', label: 'cache-01' }] })
  assert.deepEqual(f.map((x) => x.value), ['p1'])
})
ok('wiring', () => {
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  for (const s of ['getSessionCwd(', 'cdCommandFor(', 'cwd.restored', 'data-testid-qp', 'qp-history', 'qp-switch', 'mruOrder(', "'\\x12'", "'\\x10'"])
    assert.ok(app.includes(s.replace('data-testid-qp', 'QuickPick')), s)
  const term = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
  assert.ok(term.includes('registerOscHandler(7') && term.includes('cwdFromPrompt('), 'terminal tracks cwd')
  assert.ok(term.includes('osc7Disp.dispose') && term.includes('cwdMove.dispose'), 'disposed')
})
console.log(`\n${n} passed`)
