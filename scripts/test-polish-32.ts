/** Polish-32 / M-polish-17: ops home redesign + last-known host metrics. Package 0.6.55. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import {
  METRIC_CACHE_KEY,
  METRIC_CACHE_MAX,
  loadMetricCache,
  metricHostKey,
  pickMetrics,
  readCachedMetrics,
  staleAge,
  staleHintKey,
  writeCachedMetrics
} from '../src/shared/metric-cache'
import { OPS_HOME_ATTENTION_CAP, OPS_HOME_CARD_CAP, opsHomeGridColumns, opsHomeRowLayout } from '../src/shared/ops-home-density'
import { translate } from '../src/renderer/src/lib/i18n'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.55')
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-32.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

// ---- metric cache: read / write / prune / never wiped by a failed read ----
const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
assert.deepEqual(loadMetricCache(store), {})
assert.equal(readCachedMetrics('p1', store), null)
const t0 = 1_700_000_000_000
writeCachedMetrics('p1', { cpu: 23, mem: 41, disk: 87, load: [0.4, 0.3, 0.2], at: t0 }, store)
assert.deepEqual(readCachedMetrics('p1', store), { cpu: 23, mem: 41, disk: 87, load: [0.4, 0.3, 0.2], at: t0 })
assert.ok(mem.get(METRIC_CACHE_KEY)?.includes('"p1"'))
assert.equal(writeCachedMetrics('p1', { cpu: null, mem: null, disk: null, at: t0 + 1 }, store), null, 'all-null sample ignored')
assert.equal(readCachedMetrics('p1', store)?.cpu, 23)
writeCachedMetrics('p1', { cpu: 50, mem: 40, disk: 80, at: t0 - 10 }, store)
assert.equal(readCachedMetrics('p1', store)?.cpu, 23, 'older sample never overwrites a newer one')
writeCachedMetrics('p1', { cpu: 60, mem: 40, disk: 80, at: t0 + 60_000 }, store)
assert.equal(readCachedMetrics('p1', store)?.cpu, 60)
mem.set(METRIC_CACHE_KEY, '{bad json')
assert.deepEqual(loadMetricCache(store), {}, 'corrupt cache reads as empty')
for (let i = 0; i < METRIC_CACHE_MAX + 5; i++) writeCachedMetrics(`h${i}`, { cpu: i, mem: null, disk: null, at: t0 + i }, store)
const pruned = loadMetricCache(store)
assert.equal(Object.keys(pruned).length, METRIC_CACHE_MAX)
assert.ok(!pruned.h0 && pruned[`h${METRIC_CACHE_MAX + 4}`], 'oldest hosts pruned first')
assert.equal(metricHostKey({ profileId: 'p9', host: 'x' }), 'p9')
assert.equal(metricHostKey({ host: '10.0.0.1', port: 2222, username: 'ops' }), 'ops@10.0.0.1:2222')

// ---- live > cache > "—"; no loading state ----
const cached = { cpu: 10, mem: 20, disk: 30, load: null, at: t0 }
assert.deepEqual(pickMetrics({ cpu: 1, mem: 2, disk: 3 }, cached), { cpu: 1, mem: 2, disk: 3, load: null, staleAt: null, known: true })
assert.equal(pickMetrics(null, cached).staleAt, t0)
assert.equal(pickMetrics({ cpu: null, mem: null, disk: null }, cached).cpu, 10)
assert.deepEqual(pickMetrics(null, null), { cpu: null, mem: null, disk: null, load: null, staleAt: null, known: false })

// ---- stale hint "上次 · N 分钟前" ----
const zh = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('zh-CN', k, v)
const hint = (at: number, now: number) => { const a = staleAge(at, now); return zh(staleHintKey(a), { n: a.n }) }
assert.equal(hint(t0, t0 + 20_000), '上次 · 刚刚')
assert.equal(hint(t0, t0 + 3 * 60_000), '上次 · 3 分钟前')
assert.equal(hint(t0, t0 + 2 * 3600_000), '上次 · 2 小时前')
assert.equal(hint(t0, t0 + 3 * 86400_000), '上次 · 3 天前')
assert.equal(translate('en', 'mc.staleMin', { n: 5 }), 'Last · 5 min ago')

// ---- density: same structure, columns + two-line rows only ----
assert.equal(OPS_HOME_CARD_CAP, 8)
assert.equal(OPS_HOME_ATTENTION_CAP, 5)
assert.equal(opsHomeGridColumns(1160), 4) // 1400 window − 240 sidebar
assert.equal(opsHomeGridColumns(720), 2) // 960 window − 240 sidebar
assert.equal(opsHomeRowLayout(720), 'two-line')
assert.equal(opsHomeRowLayout(1160), 'one-line')

// ---- OpsHomeTab structure ----
const norm = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const ops = norm('src/renderer/src/components/OpsHomeTab.tsx')
for (const key of ["t('l7e.attention')", "t('l7e.hosts')", "t('l7e.quick')"]) assert.ok(ops.includes(key), key)
const order = ["title={t('l7e.attention')}", "title={t('l7e.hosts')}", "<Section title={t('l7e.quick')}"].map((k) => ops.indexOf(k))
assert.ok(order[0] > 0 && order[0] < order[1] && order[2] > 0, 'sections in priority order')
assert.equal((ops.match(/variant="primary"/g) ?? []).length, 1, 'one primary: 新建连接')
for (const gone of ['l7-rail', 'l7-col', 'l7-body', 'className="l7-open-dash"', 'opsHomeQuietLayout', 'l7b-skel', 'l7b.probing', 'l7.workAlerts']) assert.equal(ops.includes(gone), false, gone)
// merged list: alerts + unreachable hosts
assert.ok(ops.includes("kind: 'alert'") && ops.includes("kind: 'host'") && ops.includes('SEV_RANK'))
assert.ok(ops.includes('data-testid="l7-inbox-empty"') && ops.includes("t('l7e.allClear')"))
assert.ok(ops.includes('className="oh-chip l7-mute" data-testid="l7-mute"'), 'silence is a chip')
// keyboard: arrows, Enter, Delete (undo), F5; Ctrl+Shift+N hint on the primary
for (const k of ["'ArrowDown'", "'ArrowUp'", "'ArrowLeft'", "'ArrowRight'", "'Enter'", "'Delete'", "'F5'"]) assert.ok(ops.includes(k), k)
assert.ok(ops.includes('toastUndo(') && ops.includes('title="Ctrl+Shift+N"'))
// metrics never load: cache in, no probing / loading copy
assert.ok(ops.includes('pickMetrics(live, metricCache[h.profileId])') && ops.includes('writeCachedMetrics(h.profileId'))
assert.ok(ops.includes('data-testid="mc-stale-hint"'))
// kept testids
for (const id of ['ops-home', 'l7-primary', 'l7-card', 'l7-card-title', 'l7-health-refresh', 'l7-open-dashboard', 'l7-open-sftp', 'l7-sync-folder', 'l7-tasks', 'l7b-open-settings', 'l7b-settings', 'l7b-retry', 'l7c-fail', 'l7c-retry-all', 'l7c-filtered', 'l7c-empty-filter', 'l7d-load-line', 'l7d-inode-line', 'l7d-mount-line', 'l7-empty', 'l7-new-connection', 'l7-try-demo', 'health-card-menu']) {
  assert.ok(ops.includes(`"${id}"`) || ops.includes(`'${id}'`), `testid ${id}`)
}
// no duplicate 排除只读 chip next to its toggle
assert.equal(ops.includes("t('l7c.summaryRo')"), false)

// other metric surfaces: no '采集中…'
const dash = norm('src/renderer/src/components/MultiHostDashboard.tsx')
const mon = norm('src/renderer/src/components/ResourceMonitorModal.tsx')
for (const [name, src] of [['dashboard', dash], ['monitor', mon]] as const) {
  assert.equal(src.includes("t('rm.loading')"), false, name)
  assert.ok(src.includes('readCachedMetrics(') && src.includes('writeCachedMetrics(') && src.includes('staleHintKey('), name)
}

// CSS: tokens only, one column, container query, dead rail CSS gone
const features = norm('src/renderer/src/features.css')
const batch = features.slice(features.indexOf('---- M17 (0.6.55)'))
assert.ok(batch.length > 100)
assert.doesNotMatch(batch, /#[0-9a-f]{3,8}\b/i)
assert.ok(batch.includes('max-width: 1080px') && batch.includes('@container (max-width: 759px)'))
assert.ok(batch.includes('.oh-row:hover .oh-row-actions, .oh-row:focus-within .oh-row-actions'))
assert.equal(features.includes('.l7-rail'), false)
assert.equal(features.includes('l7b-skel'), false)
assert.equal(norm('src/renderer/src/styles.css').includes('data-ops-quiet'), false)

// screenshot harness: --empty no-host seed
const shot = norm('scripts/screenshot-key-screens.mjs')
assert.ok(shot.includes("argv.includes('--empty')") && shot.includes("emptySeed ? 'empty-' : ''"))

const changelog = norm('CHANGELOG.md')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.55'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.55'), changelog.indexOf('## v0.6.54'))
assert.ok(note.includes('M-polish-17'))
const entries = changelogFor('0.6.55')
assert.ok(entries.length >= 1 && entries.every((e) => e.text.zh && e.text.en && e.where?.zh && e.where?.en))

console.log('test-polish-32 ok')
