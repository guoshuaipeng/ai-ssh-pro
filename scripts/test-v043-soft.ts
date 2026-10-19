/** v0.4.3 soft-start: L7b sampling, UX-55b tab list, UX-57 first-week chip. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_PROBE_PREFS,
  PROBE_HARD_MAX,
  allowProbeToast,
  classifyProbeFailure,
  clampProbeMax,
  demoHealthMetrics,
  loadProbePrefs,
  nextBackoffMs,
  planProbeWave,
  sanitizeProbeReason,
  saveProbePrefs,
  selectProbeTargets,
  type ProbeCandidate
} from '../src/shared/health-probe'
import { chipPlacement, loadFirstWeekDismissed, saveFirstWeekDismissed } from '../src/shared/first-week'
import { disconnectedSessions, filterTabList, pinyinInitials, showTabSearch, tabListHay } from '../src/shared/tab-overflow'
import { buildPaletteEntries } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS } from '../src/shared/menus'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.37')

const mem = () => {
  const bag = new Map<string, string>()
  return {
    getItem: (k: string) => bag.get(k) ?? null,
    setItem: (k: string, v: string) => {
      bag.set(k, v)
    },
    removeItem: (k: string) => {
      bag.delete(k)
    }
  }
}

assert.equal(DEFAULT_PROBE_PREFS.enabled, true)
assert.equal(DEFAULT_PROBE_PREFS.scope, 'group')
assert.equal(DEFAULT_PROBE_PREFS.maxConcurrent, 8)
assert.equal(clampProbeMax(99), PROBE_HARD_MAX)
assert.equal(clampProbeMax(0), 1)
assert.deepEqual(loadProbePrefs(mem()), DEFAULT_PROBE_PREFS)
const store = mem()
saveProbePrefs({ enabled: false, scope: 'all', maxConcurrent: 40 }, store)
assert.deepEqual(loadProbePrefs(store), {
  enabled: false,
  scope: 'all',
  maxConcurrent: 30,
  filterTags: false,
  tags: [],
  prodOnly: false,
  excludeReadonly: true,
  backoffCapMin: 5,
  extraLoad: false,
  extraInode: false,
  extraMounts: false,
  mounts: ['/']
})

const hosts: ProbeCandidate[] = Array.from({ length: 50 }, (_, i) => ({
  profileId: `h${i}`,
  order: i,
  alerting: i === 10,
  folderId: i < 20 ? 'a' : 'b'
}))
const cold = selectProbeTargets(hosts, DEFAULT_PROBE_PREFS, { grouped: false })
assert.equal(cold.length, 8)
assert.equal(cold[0]?.profileId, 'h10')
assert.ok(!cold.some((h) => h.profileId === 'h40'))

const recent = hosts.map((h, i) => ({ ...h, recent: i < 3, pinned: i === 4 }))
const picked = selectProbeTargets(recent, DEFAULT_PROBE_PREFS, { grouped: false })
assert.deepEqual(picked.map((h) => h.profileId).sort(), ['h0', 'h1', 'h2', 'h4'])

const grouped = selectProbeTargets(hosts.filter((h) => h.folderId === 'a'), { ...DEFAULT_PROBE_PREFS, maxConcurrent: 8 }, { grouped: true })
assert.equal(grouped.length, 20)
assert.ok(grouped.length <= 30)

const three = selectProbeTargets(hosts.slice(0, 3), DEFAULT_PROBE_PREFS, { grouped: false })
assert.equal(three.length, 3)

const backed = selectProbeTargets(hosts.slice(0, 4), DEFAULT_PROBE_PREFS, {
  grouped: true,
  now: 1_000,
  backoffUntil: { h1: 5_000 }
})
assert.ok(backed.findIndex((h) => h.profileId === 'h1') > backed.findIndex((h) => h.profileId === 'h0'))

assert.equal(nextBackoffMs(1), 30_000)
assert.equal(nextBackoffMs(2), 60_000)
assert.equal(nextBackoffMs(3), 120_000)
assert.equal(nextBackoffMs(5), 300_000)
assert.deepEqual(planProbeWave(['a', 'b', 'c', 'd'], 1, 3), { start: ['a', 'b'], queued: ['c', 'd'] })
assert.equal(planProbeWave(['a'], 8, 8).start.length, 0)

const leaked = sanitizeProbeReason('auth failed password=hunter2 -----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----')
assert.equal(leaked.includes('hunter2'), false)
assert.equal(leaked.includes('BEGIN'), false)
assert.equal(classifyProbeFailure('主机密钥未信任'), 'key')
assert.equal(classifyProbeFailure('timeout'), 'timeout')
assert.equal(classifyProbeFailure('authentication failed'), 'auth')
const demo = demoHealthMetrics('demo-host')
assert.deepEqual(demo, demoHealthMetrics('demo-host'))
assert.ok(demo.cpu > 0 && demo.cpu <= 100 && demo.mem > 0 && demo.disk > 0)
assert.equal(allowProbeToast(1_000, 1_500), false)
assert.equal(allowProbeToast(1_000, 61_000), true)

const rows = [
  { tabId: '1', title: '运维首页', view: 'home', status: 'connected' },
  { tabId: '2', title: 'web-01', host: 'web-01', username: 'root', status: 'disconnected' },
  { tabId: '3', title: 'db-prod', host: 'db.internal', username: 'alice', status: 'connected' },
  { tabId: '4', title: '告警工作台', view: 'alert-workbench', status: 'disconnected' }
]
assert.equal(showTabSearch(9), false)
assert.equal(showTabSearch(10), true)
assert.deepEqual(filterTabList(rows, 'web-01').map((r) => r.tabId), ['2'])
assert.deepEqual(filterTabList(rows, 'alice@db').map((r) => r.tabId), ['3'])
assert.equal(pinyinInitials('运维'), 'yw')
assert.ok(tabListHay(rows[0]!).includes('yw'))
assert.deepEqual(filterTabList(rows, 'yw').map((r) => r.tabId), ['1'])
assert.deepEqual(disconnectedSessions(rows).map((r) => r.tabId), ['2'])
assert.equal(filterTabList(rows, 'nope').length, 0)

const tips = mem()
assert.equal(loadFirstWeekDismissed(tips), false)
saveFirstWeekDismissed(true, tips)
assert.equal(loadFirstWeekDismissed(tips), true)
saveFirstWeekDismissed(false, tips)
assert.equal(loadFirstWeekDismissed(tips), false)
assert.equal(chipPlacement(1366), 'corner')
assert.equal(chipPlacement(1024), 'bar')
assert.equal(chipPlacement(768), 'bar')

const palette = buildPaletteEntries(SHARED_MENUS, 'zh-CN')
assert.equal(palette.find((e) => e.id === 'switchTab')?.label, '切换标签…')
assert.equal(palette.find((e) => e.id === 'refreshHomeHealth')?.label, '刷新首页健康')
const enPalette = buildPaletteEntries(SHARED_MENUS, 'en')
assert.equal(enPalette.find((e) => e.id === 'switchTab')?.label, 'Switch tab…')
assert.ok(SHARED_MENUS.some((m) => m.items.some((it) => it.type === 'item' && it.id === 'switchTab')))
assert.ok(SHARED_MENUS.some((m) => m.items.some((it) => it.type === 'item' && it.id === 'refreshHomeHealth')))

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const home = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
const css = readFileSync('src/renderer/src/features.css', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const probeMain = readFileSync('src/main/health-probe.ts', 'utf8')
assert.ok(styles.includes('height: 36px'))
assert.ok(styles.includes('scrollbar-width: none'))
assert.ok(app.includes('data-testid="tab-list-search"'))
assert.ok(app.includes('data-testid="tab-close-disconnected"'))
assert.ok(app.includes('labelFor(t)'))
const menuBlock = app.slice(app.indexOf('createPortal('), app.indexOf('broadcast-bar'))
assert.equal(menuBlock.includes('{t.title}'), false)
assert.ok(menuBlock.includes('data-testid="tab-list-search"'))
assert.ok(home.includes('data-testid="l7-card-title"'))
assert.ok(home.includes('data-testid="l7b-settings"'))
assert.ok(css.includes('right: 16px') && css.includes('max-height: 240px') && css.includes('height: 48px'))
assert.ok(probeMain.includes("kind: 'health-probe'") || probeMain.includes('HEALTH_PROBE_KIND'))
assert.ok(probeMain.includes('verify(false)'))
assert.ok(probeMain.includes('checkHostKey'))
assert.equal(probeMain.includes('console.log'), false)
assert.equal(probeMain.includes('promptHostKey'), false)
assert.ok(readFileSync('src/renderer/src/components/FirstWeekChip.tsx', 'utf8').includes('data-testid="g3-never"'))
assert.ok(readFileSync('src/shared/first-week.ts', 'utf8').includes('aiss.prefs.firstWeekTipsDismissed'))

console.log('v0.4.3 soft-start ok')
