import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sessionInfoText } from '../src/shared/session-info'
import { buildTabMenu } from '../src/shared/inline-menus'
import { LOCAL_RECENT_KEY, noteRecentDir, recentDirs } from '../src/shared/sftp-recent-dirs'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D49
const t = sessionInfoText({ title: 'web-1', kind: 'ssh', user: 'root', host: '10.0.0.5', port: 2222, status: 'connected', cwd: '/var/www', last: { command: 'curl -H "Authorization: Bearer s3cr3t" x', code: 7, at: 0 }, now: new Date(0) })
ok(t.includes('target: root@10.0.0.5:2222') && t.includes('cwd: /var/www') && t.includes('(exit 7)'), 'fields')
ok(!t.includes('s3cr3t'), 'command redacted')
ok(!sessionInfoText({ title: 'x', kind: 'ssh', host: 'h', status: 'connected', last: { command: 'mysql -pX', code: 0, at: 0 }, sensitive: () => true }).includes('last:'), 'sensitive skipped')
ok(sessionInfoText({ title: 'l', kind: 'local', status: 'connected' }).includes('local shell'), 'local')
ok(sessionInfoText({ title: 'x', kind: 'ssh', host: 'h', port: 22, status: 'disconnected', reason: 'timeout' }).includes('target: h\nstatus: disconnected (timeout)'), 'port 22 hidden + reason')
const menu = buildTabMenu({ readOnlyOn: false, pinned: false, canDuplicate: true, canSessionTools: true, canForward: true, closeOthersDisabled: false, closeRightDisabled: false } as never)
ok(menu.some((x) => x.type === 'item' && x.id === 'copyInfo'), 'menu item')
// D47
const mem = new Map<string, string>(); const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
noteRecentDir(LOCAL_RECENT_KEY, 'C:\\Users\\a', st); ok(recentDirs(LOCAL_RECENT_KEY, st)[0] === 'C:\\Users\\a', 'local key')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes('noteRecentDir(LOCAL_RECENT_KEY, res.path)') && sp.includes("'sftp-recent-dirs-local'"), 'D47 wired')
// D48
const sb = readFileSync('src/renderer/src/components/SafetyCommandBar.tsx', 'utf8')
ok(sb.includes('const localRisk = assessCommandRisk(command)') && sb.includes('data-testid="ai-risk-local"') && sb.includes('needsRiskConfirm && localRisk'), 'D48 wired')
// D44b
const ci = readFileSync('src/renderer/src/components/CommandInput.tsx', 'utf8')
ok(ci.includes('data-testid="cmd-suggest-keys"'), 'D44b hint')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes("id === 'copyInfo'") && app.includes('sessionInfoText({'), 'D49 wired')
console.log(JSON.stringify({ test: 'cycle23', total: n, failed: 0 }))
