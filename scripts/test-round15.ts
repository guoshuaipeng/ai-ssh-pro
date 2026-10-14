/** v0.3.17 unit checks: UX-35 friendly errors, O2 alerts, D4 diff, UX-11 palette aliases, inspect cmds */
import assert from 'node:assert/strict'
import { friendlyError, stripIpcPrefix } from '../src/renderer/src/lib/friendly-error'
import { diffLines, diffStats, detectLang, highlightToHtml } from '../src/renderer/src/lib/simple-highlight'
import {
  DEFAULT_ALERT_RULES,
  evaluateAlerts,
  readingsFromSnapshot
} from '../src/shared/alert-rules'
import type { ResourceSnapshot } from '../src/shared/resource-monitor'
import { INSPECT_CHECKS, DEMO_INSPECT_OUTPUT } from '../src/shared/inspect-cmds'
import { buildPaletteEntries, PINYIN_ALIASES, filterPaletteEntries } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS } from '../src/shared/menus'

let n = 0
const ok = (cond: boolean, msg: string) => {
  assert.ok(cond, msg)
  n++
}

ok(stripIpcPrefix("Error invoking remote method 'sftp:list': Error: Permission denied: /root") === 'Permission denied: /root', 'strip nested')
ok(friendlyError("Error invoking remote method 'x': Error: Error: ECONNREFUSED 192.0.2.10:22").code === 'ECONNREFUSED', 'econn')
ok(friendlyError('Timed out while waiting for handshake', { locale: 'en' }).message.includes('timed out'), 'timeout en')
ok(friendlyError('All configured authentication methods failed', { locale: 'zh-CN' }).message.includes('认证'), 'auth zh')
ok(friendlyError('getaddrinfo ENOTFOUND no.such.host').code === 'ENOTFOUND', 'enotfound')
ok(friendlyError('ENOENT: no such file /tmp/x').code === 'ENOENT', 'enoent')
ok(friendlyError('Not connected').code === 'DISCONNECTED', 'disc')
ok(!friendlyError('plain boom').message.includes('Error invoking'), 'plain')

const d = diffLines('a\nb\nc', 'a\nx\nc')
const st = diffStats(d)
ok(st.add === 1 && st.del === 1, 'diff stats')
ok(detectLang('/etc/nginx/nginx.conf') === 'nginx' || detectLang('foo.sh') === 'shell', 'lang detect')
ok(highlightToHtml('echo hi', 'shell').includes('hl-kw'), 'highlight')

const snap: ResourceSnapshot = {
  load: [1, 1, 1],
  cores: 2,
  cpuPercent: 95,
  mem: { total: 1, used: 1, available: 0, percent: 91 },
  swap: null,
  disks: [{ fs: '/', mount: '/', totalKb: 100, usedKb: 90, percent: 90 }],
  uptimeSec: 10
}
const breach = new Map<string, number>()
const last = new Map<string, number>()
const now = Date.now()
breach.set('h1:cpu', now - 6 * 60 * 1000)
const fired = evaluateAlerts({
  hostKey: 'h1',
  hostTitle: 'web',
  rules: DEFAULT_ALERT_RULES.map((r) => ({ ...r, sustainMin: r.id === 'disk' ? 0 : 5 })),
  readings: readingsFromSnapshot(snap, true),
  breachSince: breach,
  lastFiredAt: last,
  now
})
ok(fired.some((f) => f.ruleId === 'cpu'), 'cpu alert')
ok(fired.some((f) => f.ruleId === 'disk'), 'disk alert')

ok(INSPECT_CHECKS.length >= 4 && DEMO_INSPECT_OUTPUT.disk.includes('Filesystem'), 'inspect cmds')

const entries = buildPaletteEntries(SHARED_MENUS, 'zh-CN')
ok(PINYIN_ALIASES.dashboard?.includes('kanban'), 'pinyin')
ok(filterPaletteEntries(entries, 'xunjian').some((e) => e.id === 'aiInspect'), 'palette pinyin hit')
ok(filterPaletteEntries(entries, 'gaojing').some((e) => e.id === 'alertRules'), 'palette alert')
ok(SHARED_MENUS.some((m) => m.items.some((i) => i.type === 'item' && i.id === 'broadcastTargets')), 'menu x3')

console.log(`round15 ok (${n})`)
