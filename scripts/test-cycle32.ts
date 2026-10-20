import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clampConnectTimeoutSec, readyTimeoutMs, elapsedSec } from '../src/shared/connect-timeout'
import { normalizeReconnectPolicy, DEFAULT_RECONNECT_POLICY } from '../src/shared/reconnect-policy'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D76
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes('sftp-remote-new') && sp.includes('sftp-remote-hidden'), 'D76 compact toolbar')
// D77
ok(clampConnectTimeoutSec(undefined) === 20 && clampConnectTimeoutSec(1) === 5 && clampConnectTimeoutSec(999) === 120 && clampConnectTimeoutSec('30') === 30, 'D77 clamp')
ok(readyTimeoutMs(45) === 45000, 'D77 ms')
ok(elapsedSec(1000, 13_500) === 12 && elapsedSec(5000, 1000) === 0, 'D77 elapsed')
ok(DEFAULT_RECONNECT_POLICY.connectTimeoutSec === 20 && normalizeReconnectPolicy({ connectTimeoutSec: 60 }).connectTimeoutSec === 60 && normalizeReconnectPolicy({}).connectTimeoutSec === 20, 'D77 policy')
const sm = readFileSync('src/main/ssh-manager.ts', 'utf8')
ok(!sm.includes('readyTimeout: 20000') && (sm.match(/readyTimeoutMs\(opts\.readyTimeoutSec\)/g) ?? []).length === 2, 'D77 main uses timeout for hops + target')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok((app.match(/readyTimeoutSec: policy\.connectTimeoutSec/g) ?? []).length === 2 && app.includes('<ConnectingElapsed'), 'D77 renderer wiring')
// D78
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes('data-testid="term-sel-ask"') && tp.includes('requestAskWithContext(sessionId, selectionWithLastRun(sessionId, sel))') && tp.includes('onMouseDown={(e) => e.preventDefault()}'), 'D78 chip prefills only')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
ok((i18n.match(/'d78\.ask'/g) ?? []).length === 2 && (i18n.match(/'d77\.elapsed'/g) ?? []).length === 2, 'strings zh+en')
console.log(`cycle32 ok: ${n}`)
