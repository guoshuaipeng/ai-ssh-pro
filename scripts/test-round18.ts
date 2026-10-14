/** v0.4.0-m1: ops home scope, alert workbench filters, protection gates, audit events. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decideWrite, effectiveLevel, hostNameMatches, elevateUntil, ELEVATE_MS } from '../src/shared/protection'
import { appendAudit, filterAudit, auditEnabled, setAuditEnabled } from '../src/shared/audit-log'
import { filterAlerts, markHandled, activeCount, loadBellPrefs, ageBucket } from '../src/shared/alert-workbench'
import { loadStartupMode, saveStartupMode, loadLastWorkspace, saveLastWorkspace } from '../src/shared/startup-pref'
import { hostInScope, pickHealthHosts, loadDashScope, saveDashScope } from '../src/shared/dashboard-scope'
import { locateTargetFor } from '../src/shared/alert-locate'
import { changelogFor } from '../src/shared/changelog'
import { SHARED_MENUS } from '../src/shared/menus'
import { KEYMAP } from '../src/shared/keymap'
import type { FiredAlert } from '../src/shared/alert-rules'

let n = 0
const ok = (cond: boolean, msg: string) => {
  assert.ok(cond, msg)
  n++
}

const mem = new Map<string, string>()
const store = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  }
}

ok(effectiveLevel(undefined) === 'normal', 'unset level is normal')
ok(effectiveLevel({ demo: true }) === 'production', 'demo defaults to production')
ok(effectiveLevel({ demo: true, protection: 'readonly' }) === 'readonly', 'explicit level wins')
ok(hostNameMatches(' Web01 ', ['web01', 'db']), 'host name match is trimmed')
ok(!hostNameMatches('', ['web01']), 'empty host name does not match')

ok(decideWrite('readonly', { dangerous: false, elevated: false, channel: 'alert' }) === 'block', 'readonly blocks alert run')
ok(decideWrite('readonly', { dangerous: false, elevated: false, channel: 'sftp' }) === 'block', 'readonly blocks sftp mkdir and rename')
ok(decideWrite('readonly', { dangerous: true, elevated: true, channel: 'command' }) === 'confirm-danger', 'elevated readonly still confirms danger')
ok(decideWrite('readonly', { dangerous: false, elevated: true, channel: 'sftp' }) === 'allow', 'elevated readonly allows a plain write')
ok(decideWrite('production', { dangerous: false, elevated: false, channel: 'alert' }) === 'confirm-host', 'production alert asks for the host name')
ok(decideWrite('production', { dangerous: true, elevated: false, channel: 'command' }) === 'confirm-host-danger', 'production danger asks for the host name')
ok(decideWrite('production', { dangerous: false, elevated: false, channel: 'command' }) === 'allow', 'production allows a safe command-bar line')
ok(decideWrite('production', { dangerous: false, elevated: false, channel: 'sftp' }) === 'confirm-host', 'production sftp write asks for the host name')
ok(decideWrite('normal', { dangerous: true, elevated: false, channel: 'command' }) === 'confirm-danger', 'normal danger confirms')
ok(decideWrite('normal', { dangerous: false, elevated: false, channel: 'alert' }) === 'allow', 'normal alert is the A1 confirm, not a host-name gate')
ok(elevateUntil('p', 1_000, ELEVATE_MS) === 1_000 + ELEVATE_MS, 'elevate window')

const alerts: FiredAlert[] = [
  { id: 'a1', hostKey: 's1', hostTitle: 'web01', ruleId: 'cpu', value: 96, threshold: 90, at: 500, status: 'active' },
  { id: 'a2', hostKey: 's2', hostTitle: 'db01', ruleId: 'disk', value: 91, threshold: 85, at: 400, status: 'ignored' },
  { id: 'a3', hostKey: 's1', hostTitle: 'web01', ruleId: 'mem', value: 70, threshold: 90, at: 300, status: 'recovered' }
]
ok(filterAlerts(alerts, { status: 'active' }).map((a) => a.id).join() === 'a1', 'active filter')
ok(filterAlerts(alerts, { status: 'all', host: 'web01' }).length === 2, 'host filter')
ok(filterAlerts(alerts, { status: 'all', q: 'disk' })[0]!.id === 'a2', 'search')
const handled = markHandled(alerts, 'a1', 900)
ok(handled[0]!.status === 'recovered' && handled[0]!.handledManually === true, 'mark handled')
ok(activeCount(alerts) === 1, 'one active')
ok(ageBucket(0, 30_000).key === 'just', 'just now')
ok(ageBucket(0, 120_000).key === 'min' && ageBucket(0, 120_000).n === 2, 'minutes')
ok(loadBellPrefs(store).mode === 'workbench' && loadBellPrefs(store).autoLocate && !loadBellPrefs(store).mirrorAi, 'bell defaults')

ok(loadStartupMode(store) === 'home', 'startup default is ops home')
saveStartupMode('last', store)
ok(loadStartupMode(store) === 'last', 'startup persists')
saveLastWorkspace({ profileIds: ['p1'] }, store)
ok(loadLastWorkspace(store).profileIds[0] === 'p1', 'last workspace')

ok(loadDashScope(store).mode === 'all', 'scope default')
saveDashScope({ mode: 'group', folderId: 'f1' }, store)
ok(hostInScope(loadDashScope(store), { profileId: 'p', folderId: 'f1' }), 'group scope hits')
ok(!hostInScope(loadDashScope(store), { profileId: 'p', folderId: 'f2' }), 'group scope misses')
const picked = pickHealthHosts([{ id: 'a' }, { id: 'b' }, { id: 'c' }], (x) => x.id === 'c', 2)
ok(picked.shown[0]!.id === 'c' && picked.more === 1, 'alerts first, cap 8-style')

ok(auditEnabled(store), 'audit on by default')
const ev = appendAudit({ type: 'alert.execute', host: 'web01', source: 'AI', outcome: 'allowed', detail: 'uptime' }, store, 10)
ok(ev?.type === 'alert.execute', 'alert.execute stored')
appendAudit({ type: 'danger', host: 'web01', source: 'user', outcome: 'blocked', detail: 'rm' }, store, 11)
ok(filterAudit(
  JSON.parse(store.getItem('aiss.audit.v1')!),
  { type: 'danger' }
).length === 1, 'danger filter')
setAuditEnabled(false, store)
ok(appendAudit({ type: 'danger', host: 'x', outcome: 'blocked', detail: 'no' }, store, 12) === null, 'audit off skips write')

ok(locateTargetFor('disk').kind === 'toolbox', 'disk still locates to toolbox')
ok(changelogFor('0.4.0-m1').some((e) => e.action === 'opsHome'), 'whats new m1')
ok(changelogFor('v0.4.0-m1').length > 0, 'whats new accepts v prefix')
const ids = SHARED_MENUS.flatMap((m) => m.items.filter((it) => it.type === 'item').map((it) => it.id))
ok(ids.includes('opsHome') && ids.includes('alertWorkbench') && ids.includes('auditLog'), 'menus')
ok(KEYMAP.some((k) => k.id === 'opsHome' && k.keys === 'Ctrl+Alt+H'), 'home shortcut')
ok(KEYMAP.some((k) => k.id === 'alertWorkbench' && k.keys === 'Ctrl+Alt+A'), 'workbench shortcut')

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
ok(pkg.version === '0.4.0-m2', 'package version')
const changelog = readFileSync('CHANGELOG.md', 'utf8')
ok(changelog.includes('## v0.4.0-m1'), 'changelog section')
ok(!changelog.includes('## v0.4.0\n'), 'final tag section is not written yet')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const key of ['l7.title', 'l2.title', 'l4.title', 'l4.readonlyBlocked', 'a4.privacy', 'menu.opsHome', 'menu.alertWorkbench']) {
  ok(i18n.includes(`'${key}'`), `i18n ${key}`)
}
const home = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
const bench = readFileSync('src/renderer/src/components/AlertWorkbenchTab.tsx', 'utf8')
ok(home.includes('data-testid="ops-home"') && home.includes('l7-privacy'), 'home surface')
ok(bench.includes('data-testid="alert-workbench"') && bench.includes('l2-privacy'), 'workbench surface')
ok(readFileSync('src/renderer/src/components/ProtectionSection.tsx', 'utf8').includes('data-testid="l4-guard"'), 'guard section')
ok(!readFileSync('src/renderer/src/lib/protection-gate.ts', 'utf8').includes('window.confirm'), 'no native confirm')
const sftpSrc = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
const mkdirFn = sftpSrc.slice(sftpSrc.indexOf('const mkdir ='), sftpSrc.indexOf('const renameEntry ='))
const renameFn = sftpSrc.slice(sftpSrc.indexOf('const renameEntry ='), sftpSrc.indexOf('const summary ='))
ok(mkdirFn.includes('allowRemoteWrite') && mkdirFn.indexOf('allowRemoteWrite') < mkdirFn.indexOf('sftp.mkdir'), 'remote mkdir waits for the write gate')
ok(renameFn.includes('allowRemoteWrite') && renameFn.indexOf('allowRemoteWrite') < renameFn.indexOf('sftp.rename'), 'remote rename waits for the write gate')
ok(sftpSrc.includes('remoteWritesBlocked') && sftpSrc.includes('l4.readonlyBlocked'), 'readonly disables remote mkdir')

console.log(`test-round18 ok (${n})`)
