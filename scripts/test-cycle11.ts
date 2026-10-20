import assert from 'node:assert/strict'
import { recentQuickTarget, sidebarQuick } from '../src/shared/recent-quick'
import { blockMatcher, effectiveScope, loadFindScope, saveFindScope, stepMatch } from '../src/shared/find-scope'
import { searchBlocks } from '../src/shared/block-history'
import { blockMatcher, effectiveScope, loadFindScope, saveFindScope, stepMatch } from '../src/shared/find-scope'
import { searchBlocks } from '../src/shared/block-history'
import { mergeRecentConnection, normalizeRecentList } from '../src/shared/workspace-features'
import { followFailure, isSymlinkMode } from '../src/shared/sftp-follow'
import { list } from '../src/main/sftp-manager'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }
const okAsync = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log('ok - ' + name) }

ok('D13c sidebar search: words stay search, addresses become connect', () => {
  for (const w of ['nginx', 'web', 'prod-web-01', '']) assert.equal(sidebarQuick(w, []), null, w)
  assert.deepEqual(sidebarQuick('root@10.0.0.5:2222', [])?.target, { host: '10.0.0.5', port: 2222, username: 'root' })
  assert.equal(sidebarQuick('ssh -p 2200 ops@db1', [])?.target.port, 2200)
  const p = { id: 'a', host: '10.0.0.5', port: 2222, username: 'root', label: 'DB' }
  assert.equal(sidebarQuick('root@10.0.0.5:2222', [p])?.saved?.id, 'a')
})
ok('D13c quick rows keep port / key path / jump, never secrets', () => {
  const list = mergeRecentConnection([], { host: 'db1', port: 2200, username: 'ops', quick: true, identity: '~/.ssh/id', jump: [{ host: 'bastion', port: 22, username: 'j' }], password: 'x' } as never)
  const row = normalizeRecentList(JSON.parse(JSON.stringify(list)))[0]
  assert.equal(row.quick, true)
  assert.equal(row.identity, '~/.ssh/id')
  assert.equal(JSON.stringify(row).includes('password'), false)
  assert.deepEqual(recentQuickTarget(row), { host: 'db1', port: 2200, username: 'ops', identity: '~/.ssh/id', jump: [{ host: 'bastion', port: 22, username: 'j' }] })
})
ok('D13c saved-host rows keep the old path; reconnecting via profile clears quick', () => {
  const a = mergeRecentConnection([], { host: 'h', port: 22, username: 'u', quick: true })
  const b = mergeRecentConnection(a, { host: 'h', port: 22, username: 'u' })
  assert.equal(b.length, 1)
  assert.equal(b[0].quick, undefined)
  assert.equal(recentQuickTarget(b[0]), null)
})
ok('D19 scope: remembered, blocks only while blocks are on', () => {
  const m = new Map<string, string>()
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  assert.equal(loadFindScope(st), 'terminal')
  saveFindScope('blocks', st)
  assert.equal(loadFindScope(st), 'blocks')
  assert.equal(effectiveScope('blocks', false), 'terminal')
  assert.equal(effectiveScope('blocks', true), 'blocks')
})
ok('D19 block matcher shares case / regex options with terminal find', () => {
  const blocks = [{ command: 'df -h', output: '/dev/SDA1 50G' }, { command: 'free -m', output: 'Mem' }, { command: 'lsblk', output: 'sda 8:0' }]
  assert.deepEqual(searchBlocks(blocks, 'sda', blockMatcher('sda') as (s: string) => boolean), [0, 2])
  assert.deepEqual(searchBlocks(blocks, 'sda', blockMatcher('sda', { caseSensitive: true }) as (s: string) => boolean), [2])
  assert.deepEqual(searchBlocks(blocks, 'x', blockMatcher('^free', { regex: true }) as (s: string) => boolean), [1])
  assert.equal(blockMatcher('(', { regex: true }), 'error')
  assert.equal(blockMatcher('  '), null)
  assert.deepEqual(searchBlocks(blocks, ''), [0, 1, 2])
})
ok('D19 Enter / Shift+Enter step through matching blocks and wrap', () => {
  assert.equal(stepMatch([0, 2], 0, false), 2)
  assert.equal(stepMatch([0, 2], 2, false), 0)
  assert.equal(stepMatch([0, 2], 0, true), 2)
  assert.equal(stepMatch([], 0, false), -1)
})
//MARK
ok('D12b follow failures are classified so the pane stays put', () => {
  assert.equal(followFailure({ code: 3, message: 'Permission denied' }), 'denied')
  assert.equal(followFailure(new Error("Error invoking remote method 'sftp:list': Error: Permission denied")), 'denied')
  assert.equal(followFailure({ code: 2, message: 'No such file' }), 'missing')
  assert.equal(followFailure(new Error('Connection lost')), null)
  assert.equal(isSymlinkMode(0o120777), true)
  assert.equal(isSymlinkMode(0o040755), false)
  assert.equal(isSymlinkMode(undefined), false)
})
await okAsync('D12b listing resolves symlinks (dir / file / broken)', async () => {
  const dir = { isDirectory: () => true, size: 4096 }
  const file = { isDirectory: () => false, size: 20480 }
  const lnk = (n: string) => ({ filename: n, attrs: { mode: 0o120777, size: 7, isDirectory: () => false } })
  const fake = {
    readdir: (_p: string, cb: (e: unknown, l: unknown[]) => void) => cb(undefined, [lnk('www'), lnk('current.log'), lnk('gone'), { filename: 'a.txt', attrs: { mode: 0o100644, size: 3, isDirectory: () => false } }]),
    stat: (p: string, cb: (e: unknown, s?: unknown) => void) => (p.endsWith('/www') ? cb(undefined, dir) : p.endsWith('/current.log') ? cb(undefined, file) : cb(new Error('No such file'))),
    end: () => undefined
  }
  const client = { sftp: (cb: (e: unknown, s: unknown) => void) => cb(undefined, fake) }
  const res = await list(client as never, '/home/demo')
  const by = Object.fromEntries(res.entries.map((e) => [e.name, e]))
  assert.equal(by.www.isDirectory, true)
  assert.equal(by.www.link, 'dir')
  assert.equal(by['current.log'].link, 'file')
  assert.equal(by['current.log'].size, 20480)
  assert.equal(by.gone.link, 'broken')
  assert.equal(by['a.txt'].link, undefined)
  assert.equal(res.entries[0].name, 'www')
})
console.log(`cycle11: ${n} passed`)



