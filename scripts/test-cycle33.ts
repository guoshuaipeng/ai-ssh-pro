import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stageTarget, stageTimeoutSuffix, isConnectTimeout } from '../src/shared/connect-stage'
import { sortSftpEntries, nextSort, sortIsDesc } from '../src/shared/sftp-sort'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D77b
ok(stageTarget(' h ', undefined) === 'h:22' && stageTarget('h', 2200) === 'h:2200', 'D77b target key')
ok(isConnectTimeout('Timed out while waiting for handshake') && !isConnectTimeout('All configured authentication methods failed'), 'D77b timeout detect')
ok(stageTimeoutSuffix('Timed out while waiting for handshake', 'auth', (s) => s.toUpperCase()) === 'AUTH' && stageTimeoutSuffix('denied', 'auth', String) === '', 'D77b suffix only on timeout')
const sm = readFileSync('src/main/ssh-manager.ts', 'utf8')
ok(sm.includes("owner.send('ssh:stage'") && sm.includes("client.once('handshake', () => mark('auth'))") && sm.includes("sendStage({ stage: 'shell' })"), 'D77b main emits stages')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('data-testid="connecting-stage"') && app.includes('window.aiss.ssh.onStage'), 'D77b banner')
// D81
const rows = [
  { name: 'b.log', isDirectory: false, size: 10, modifyTime: 3 },
  { name: 'a.tar', isDirectory: false, size: 900, modifyTime: 1 },
  { name: 'dir', isDirectory: true, size: 4096, modifyTime: 0 },
  { name: 'c.txt', isDirectory: false, size: 50, modifyTime: 2 }
]
ok(sortSftpEntries(rows, 'size').map((r) => r.name).join() === 'dir,a.tar,c.txt,b.log', 'D81 size desc, dirs first')
ok(sortSftpEntries(rows, 'size', true).map((r) => r.name).join() === 'dir,b.log,c.txt,a.tar', 'D81 size flipped')
ok(sortSftpEntries(rows, 'name', true).map((r) => r.name).join() === 'dir,c.txt,b.log,a.tar', 'D81 name flipped')
ok(sortSftpEntries(rows, 'mtime').map((r) => r.name).join() === 'dir,b.log,c.txt,a.tar', 'D81 mtime default unchanged')
ok(JSON.stringify(nextSort({ mode: 'name', flip: false }, 'name')) === '{"mode":"name","flip":true}' && JSON.stringify(nextSort({ mode: 'name', flip: true }, 'size')) === '{"mode":"size","flip":false}', 'D81 nextSort')
ok(sortIsDesc('size', false) && !sortIsDesc('name', false), 'D81 natural dirs')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes('sftp-th-${col}') && sp.includes('aria-sort'), 'D81 header buttons')
// D82
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes('data-testid="term-new-below"') && tp.includes('term.onWriteParsed') && tp.includes('b.viewportY >= b.baseY'), 'D82 chip')
// screenshot fix
const shot = readFileSync('scripts/screenshot-key-screens.mjs', 'utf8')
ok(shot.includes("name: 'settings-reconnect'") && shot.includes('[cov] --only matched no shots'), 'shot script fix')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['d77b.stage.auth', 'd77b.hopStage', 'd81.sortTip', 'd81.sortSize', 'd82.label']) ok((i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}'`, 'g')) ?? []).length === 2, `strings ${k}`)
console.log(`cycle33 ok: ${n}`)
