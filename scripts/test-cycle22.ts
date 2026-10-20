import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recentDirs, noteRecentDir } from '../src/shared/sftp-recent-dirs'
import { withLastRun } from '../src/shared/failed-output'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
const mem = new Map<string, string>(); const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
// D45
noteRecentDir('h1', '/a', st); noteRecentDir('h1', '/b', st); noteRecentDir('h1', '/a', st)
ok(JSON.stringify(recentDirs('h1', st)) === '["/a","/b"]', 'mru + dedupe')
for (let i = 0; i < 15; i++) noteRecentDir('h1', `/d${i}`, st)
ok(recentDirs('h1', st).length === 10 && recentDirs('h1', st)[0] === '/d14', 'cap 10')
ok(recentDirs('h2', st).length === 0 && recentDirs('', st).length === 0, 'per host')
mem.set('aiss.sftp.recentDirs.v1', 'garbage'); ok(recentDirs('h1', st).length === 0, 'bad json safe')
// D46
const now = 1_000_000
const last = { command: 'systemctl restart nginx', code: 1, at: now - 1000 }
const no = () => false
ok(withLastRun('err', last, now, no).startsWith('$ systemctl restart nginx   # exit 1\nerr'), 'prefix last run')
ok(withLastRun('err', { ...last, at: now - 11 * 60 * 1000 }, now, no) === 'err', 'stale skipped')
ok(withLastRun('err', last, now, () => true) === 'err', 'sensitive skipped')
ok(!withLastRun('x', { command: 'curl -H "Authorization: Bearer abc.def"', code: 0, at: now }, now, no).includes('abc.def'), 'redacted')
ok(withLastRun('x', null, now, no) === 'x', 'none')
// wiring
const ci = readFileSync('src/renderer/src/components/CommandInput.tsx', 'utf8')
ok(ci.includes("e.key === 'Delete' && e.shiftKey") && ci.includes("source !== 'snippet'") && ci.includes('restoreSmartEntries(dropped)'), 'D44 cmdbar forget + undo')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes("'sftp-recent-dirs'") && sp.includes('noteRecentDir(hostKey, res.path)'), 'D45 wired')
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes('selectionWithLastRun(sessionId, sel)'), 'D46 wired')
console.log(JSON.stringify({ test: 'cycle22', total: n, failed: 0 }))
