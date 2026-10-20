import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { typedCommandOnEnter, dropTargetDir, resolveHomePath, retryableTransfers } from '../src/shared/typed-command'
import { snapshotWorkspace } from '../src/shared/session-restore'
import { loadLastWorkspace, saveLastWorkspace } from '../src/shared/startup-pref'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }

ok('D8 snapshot keeps terminal cwd only', () => {
  const rows = snapshotWorkspace(
    [
      { tabId: 'a', profileId: 'p1', title: 'web', cwd: '/etc/nginx' },
      { tabId: 'b', profileId: 'p1', title: 'x', view: 'sftp', cwd: '/tmp' },
      { tabId: 'c', profileId: 'p2', title: 'db' }
    ],
    'a'
  )
  assert.equal(rows[0]!.cwd, '/etc/nginx')
  assert.equal('cwd' in rows[1]!, false)
  assert.equal('cwd' in rows[2]!, false)
})
ok('D8 load keeps a clean cwd, drops a bad one', () => {
  const mem = new Map<string, string>()
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as unknown as Storage
  saveLastWorkspace({ profileIds: ['p1'], tabs: [
    { kind: 'terminal', profileId: 'p1', title: 'a', order: 0, cwd: '/srv/app' },
    { kind: 'terminal', profileId: 'p1', title: 'b', order: 1, cwd: 'relative\u0007' }
  ] }, store)
  const back = loadLastWorkspace(store)
  assert.equal(back.tabs![0]!.cwd, '/srv/app')
  assert.equal('cwd' in back.tabs![1]!, false)
})
ok('D9 drop target + home resolve', () => {
  assert.equal(dropTargetDir('/var/www'), '/var/www')
  assert.equal(dropTargetDir(null), '~')
  assert.equal(dropTargetDir('weird'), '~')
  assert.equal(resolveHomePath('~', '/home/ops'), '/home/ops')
  assert.equal(resolveHomePath('~/app', '/home/ops/'), '/home/ops/app')
  assert.equal(resolveHomePath('/abs', null), '/abs')
  assert.equal(resolveHomePath('~/x', null), null)
})
ok('D9 retryable', () => {
  assert.deepEqual(retryableTransfers([{ status: 'error' }, { status: 'done' }, { status: 'interrupted' }, { status: 'paused' }]).map((t) => t.status), ['error', 'interrupted'])
})
ok('D10 typed command', () => {
  assert.equal(typedCommandOnEnter('\r', 'root@web:/etc# systemctl status nginx', false), 'systemctl status nginx')
  assert.equal(typedCommandOnEnter('\r', 'root@web:/etc# ', false), null)
  assert.equal(typedCommandOnEnter('a', 'root@web:/etc# ls', false), null)
  assert.equal(typedCommandOnEnter('\r', 'root@web:/etc# ls', true), null, 'alt screen')
  assert.equal(typedCommandOnEnter('\r', '[sudo] password for ops:', false), null)
})
ok('wiring', () => {
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  assert.ok(app.includes('restoreCwd') && app.includes("'beforeunload'"), 'D8 app')
  const term = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
  for (const s of ['term-drop-hint', 'setPendingUpload(', 'typedCommandOnEnter(', 'noteSubmitted(']) assert.ok(term.includes(s), s)
  const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
  for (const s of ['sftp-xfer-retry-all', 'takePendingUpload(', 'resolveHomePath(']) assert.ok(sftp.includes(s), s)
  const blocks = readFileSync('src/renderer/src/components/TerminalBlocks.tsx', 'utf8')
  for (const s of ['block-copy-output', 'block-ask-ai', 'requestAskWithContext(']) assert.ok(blocks.includes(s), s)
})
console.log(`\n${n} passed`)
