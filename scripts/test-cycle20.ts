import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rankHistoryPick, loadHostOnly, saveHostOnly } from '../src/shared/quick-pick'
import { canAttachFile, buildFileContext } from '../src/shared/ai-file-context'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D38
const entries = [
  { command: 'ls -la', hostKey: 'a', count: 1, lastUsed: 1 },
  { command: 'df -h', hostKey: 'b', count: 9, lastUsed: 2 }
]
const snippets = [{ id: 's1', title: 'up', body: 'uptime' }]
ok(rankHistoryPick({ query: '', hostKey: 'a', entries, snippets }).length === 3, 'default mixes hosts + snippets')
const only = rankHistoryPick({ query: '', hostKey: 'a', entries, snippets, hostOnly: true })
ok(only.length === 1 && only[0]!.value === 'ls -la', 'hostOnly keeps this host only')
ok(rankHistoryPick({ query: '', hostKey: '', entries, snippets, hostOnly: true }).length === 3, 'hostOnly ignored without host')
const mem = new Map<string, string>(); const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
saveHostOnly(true, st); ok(loadHostOnly(st) === true, 'hostOnly remembered')
// D39
ok(canAttachFile('/etc/nginx/nginx.conf', 900).ok, 'conf ok')
for (const p of ['/root/.ssh/id_rsa', '/app/.env', '/app/.env.prod', '/etc/ssl/a.key', '/etc/shadow']) ok(!canAttachFile(p, 10).ok, `secret blocked ${p}`)
ok((canAttachFile('/x.tar.gz', 10) as { reason: string }).reason === 'binary', 'binary blocked')
ok((canAttachFile('/x.log', 3e6) as { reason: string }).reason === 'large', 'large blocked')
const c = buildFileContext('/app/config.yml', 'db_password: hunter2\nport: 5432\nAPI_KEY=abc123\nauth: Bearer xyz', false)
ok(!c.text.includes('hunter2') && !c.text.includes('abc123') && !c.text.includes('xyz'), 'secrets hidden')
ok(c.text.includes('port: 5432') && c.redacted >= 3, 'rest kept, count')
ok(buildFileContext('/a', 'x', true).text.includes('32 KB'), 'truncation noted')
// wiring
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes("window.addEventListener('online', onOnline)"), 'D37 online listener')
ok(app.includes('navigator.onLine === false'), 'D37 offline does not burn attempts')
ok(app.includes('hostOnly: histHostOnly'), 'D38 wired')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes("id: 'ask-ai-file'") && sp.includes('requestAskWithContext(sessionId, c.text'), 'D39 menu prefills (no auto send)')
const qp = readFileSync('src/renderer/src/components/QuickPick.tsx', 'utf8')
ok(qp.includes('data-testid="qp-host-only"'), 'D38 toggle button')
console.log(JSON.stringify({ test: 'cycle20', total: n, failed: 0 }))
