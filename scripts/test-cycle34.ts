import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildConnectDiag } from '../src/shared/connect-diag'
import { formatSshCommand } from '../src/shared/connection-string'
import { parseQuickTarget } from '../src/shared/quick-connect'
import { pathTarget, completeFrom, resolveDir } from '../src/shared/path-complete'
import { buildTabMenu } from '../src/shared/inline-menus'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D83
const diag = buildConnectDiag({ target: 'h:22', user: 'ops', jumpHops: 1, kind: 'timeout', stage: 'auth', elapsedMs: 20500, timeoutSec: 20, keepAliveSec: null, raw: 'Timed out password=hunter2', at: new Date(0) })
ok(diag.includes('last stage: auth') && diag.includes('elapsed: 20.5s') && diag.includes('keep-alive: off') && !diag.includes('hunter2'), 'D83 diag redacted')
const ct = readFileSync('src/renderer/src/components/ConnectTrouble.tsx', 'utf8')
ok(ct.includes('data-testid="connect-copy-diag"'), 'D83 button')
// D84
ok(formatSshCommand({ host: 'h', username: 'u' }) === 'ssh u@h', 'D84 plain')
const full = formatSshCommand({ host: 'app.internal', port: 2222, username: 'deploy', privateKeyPath: '~/.ssh/id_ed25519', authMode: 'key', password: 'x', jumpChain: [{ host: 'bastion', port: 22, username: 'ops' }, { host: 'b2', port: 2200, username: 'j' }] } as never)
ok(full === 'ssh -p 2222 -i ~/.ssh/id_ed25519 -J ops@bastion,j@b2:2200 deploy@app.internal', 'D84 full ' + full)
ok(!formatSshCommand({ host: 'h', username: 'u', privateKeyPath: '/k', authMode: 'password' }).includes('-i'), 'D84 no -i for password auth')
ok(formatSshCommand({ host: 'h', username: 'u', privateKeyPath: 'C:/my keys/k' }).includes("-i 'C:/my keys/k'"), 'D84 quotes spaces')
const q = parseQuickTarget('ssh -p 2222 -J ops@bastion deploy@app.internal')
ok(q && (q as { host?: string }).host === 'app.internal', 'D84 round-trips into quick connect')
const tabIds = buildTabMenu({ pinned: false, readOnlyOn: false, canDuplicate: true, canSessionTools: true, canForward: true, closeOthersDisabled: false, closeRightDisabled: false, canCopySsh: false } as never)
  .filter((x) => x.type === 'item') as { id: string; disabled?: boolean }[]
ok(tabIds.find((x) => x.id === 'copySsh')?.disabled === true, 'D84 tab item disabled for local')
// D85
const t1 = pathTarget('cat src/ap', '/srv/app')!
ok(t1.dir === '/srv/app/src' && t1.prefix === 'ap', 'D85 relative')
ok(pathTarget('git che', '/x') === null && pathTarget('ls', '/x') === null && pathTarget('ls ', '/x') === null, 'D85 leaves bare words to history')
ok(resolveDir(pathTarget('vim ~/.bas', null)!, '/home/u') === '/home/u', 'D85 tilde')
const ents = [{ name: 'app.ts', isDirectory: false }, { name: 'api', isDirectory: true }, { name: '.apx', isDirectory: false }, { name: 'my dir', isDirectory: true }]
ok(completeFrom({ ...t1, prefix: 'app' }, ents).kind === 'done' && (completeFrom({ ...t1, prefix: 'app' }, ents) as { line: string }).line === 'cat src/app.ts ', 'D85 unique file')
ok((completeFrom({ ...t1, prefix: 'my' }, ents) as { line: string }).line === 'cat src/my\\ dir/', 'D85 escapes + dir slash')
ok(completeFrom(t1, ents).kind === 'ambiguous' && completeFrom({ ...t1, prefix: 'z' }, ents).kind === 'none', 'D85 ambiguous / none')
ok(completeFrom({ ...t1, prefix: '.a' }, ents).kind === 'done', 'D85 hidden only with dot prefix')
const bar = readFileSync('src/renderer/src/components/SessionCommandBar.tsx', 'utf8')
ok(bar.includes('window.aiss.sftp.list(sessionId, dir)') && bar.includes('if (draftNowRef.current !== before) return') && !/completeRemotePath[\s\S]{0,1500}sendInput/.test(bar), 'D85 list-only, fill-only')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['d83.copy', 'd84.copied', 'd85.many']) ok((i18n.match(new RegExp(`'${k.replace('.', '\\.')}'`, 'g')) ?? []).length === 2, 'strings ' + k)
console.log(`cycle34 ok: ${n}`)
