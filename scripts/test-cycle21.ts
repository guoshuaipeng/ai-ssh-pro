import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathFromSelection, parentPath } from '../src/shared/term-path'
let n = 0
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++ }
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D41
eq(pathFromSelection('/var/log/nginx/', '/'), '/var/log/nginx', 'abs dir')
eq(pathFromSelection('./conf/a.yml', '/etc/nginx'), '/etc/nginx/conf/a.yml', 'relative ./')
eq(pathFromSelection('../x', '/etc/nginx'), '/etc/x', 'relative ..')
eq(pathFromSelection('logs/', '~/app'), '~/app/logs', 'relative under ~')
eq(pathFromSelection('~/a/../b', '/'), '~/b', 'tilde normalize')
eq(pathFromSelection('"/etc/hosts",', '/'), '/etc/hosts', 'quotes + punctuation')
eq(pathFromSelection('hello', '/'), null, 'plain word')
eq(pathFromSelection('http://a/b', '/'), null, 'url')
eq(pathFromSelection('a b/c', '/'), null, 'spaces')
eq(pathFromSelection('x/y', ''), null, 'relative without cwd')
eq(parentPath('/etc/hosts'), '/etc', 'parent'); eq(parentPath('/etc'), '/', 'parent root')
// wiring
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes("id: 'sftpPath'") && tp.includes('requestSftpGoto(sessionId, selPath)'), 'D41 terminal menu')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes('const goto = takeSftpGoto(sessionId)') && sp.includes('SFTP_GOTO_EVENT'), 'D41 sftp consumes goto')
const main = readFileSync('src/main/index.ts', 'utf8')
ok(main.includes("powerMonitor.on('resume'") && main.includes("send('power:resume')"), 'D40 main resume')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('onPowerResume?.(onResume)') && app.includes('window.aiss.workspace.ping(t.sessionId!)'), 'D40 renderer check')
ok(app.includes('scheduleAutoReconnectRef.current(t.tabId)'), 'D40 uses policy scheduler')
ok(app.includes('forgetCommand(it.value') && app.includes('restoreSmartEntries(dropped)'), 'D43 forget + undo')
const qp = readFileSync('src/renderer/src/components/QuickPick.tsx', 'utf8')
ok(qp.includes("e.shiftKey && e.key === 'Delete'"), 'D43 Shift+Delete')
const sh = readFileSync('src/renderer/src/lib/smart-history.ts', 'utf8')
ok(sh.includes('export function forgetCommand'), 'D43 forgetCommand')
console.log(JSON.stringify({ test: 'cycle21', total: n, failed: 0 }))
