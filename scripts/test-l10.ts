/** L10: group / multi-select batch connect. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BATCH_CONNECT_LIMIT,
  BATCH_CONNECT_LIMIT_MAX,
  advanceHostKey,
  clampBatchLimit,
  enqueueHostKey,
  hostsByIds,
  hostsInFolder,
  pickBatchTarget,
  planPaletteGroup,
  reconnectTabId,
  runBatchConnect,
  summarizeBatch,
  type BatchHost,
  type BatchTabSnap
} from '../src/shared/batch-connect'
import { translate } from '../src/renderer/src/lib/i18n'
import { paletteMatch } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS } from '../src/shared/menus'
import { HOST_MENU_MULTI, HOST_MENU_SINGLE } from '../src/shared/host-menu'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-l10\.ts/)
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-polish-3\.ts/)

assert.equal(BATCH_CONNECT_LIMIT, 4)
assert.equal(BATCH_CONNECT_LIMIT_MAX, 5)
assert.equal(clampBatchLimit(undefined), 4)
assert.equal(clampBatchLimit(0), 1)
assert.equal(clampBatchLimit(99), 5)
assert.equal(clampBatchLimit(3), 3)

const profiles: BatchHost[] = [
  { id: 'a', label: 'alpha', folderId: 'ops' },
  { id: 'b', label: 'beta', folderId: 'ops' },
  { id: 'c', label: 'gamma' },
  { id: 'd', label: 'delta', folderId: 'ops' },
  { id: 'a', label: 'alpha-dup', folderId: 'ops' }
]
assert.deepEqual(hostsByIds(profiles, ['c', 'a', 'a', 'missing']).map((h) => h.id), ['c', 'a'])
assert.deepEqual(hostsInFolder(profiles, 'ops').map((h) => h.id), ['a', 'b', 'd'])
assert.deepEqual(hostsInFolder(profiles, 'empty'), [])
assert.equal(planPaletteGroup(profiles, 'c').ok, false)
assert.equal(planPaletteGroup(profiles, null).ok, false)
const grouped = planPaletteGroup(profiles, 'b')
assert.equal(grouped.ok, true)
if (grouped.ok) assert.deepEqual(grouped.hosts.map((h) => h.id), ['a', 'b', 'd'])

const tabs: BatchTabSnap[] = [
  { tabId: 't-live', profileId: 'a', status: 'connected', sessionId: 's1' },
  { tabId: 't-busy', profileId: 'b', status: 'connecting' },
  { tabId: 't-dead', profileId: 'c', status: 'disconnected' },
  { tabId: 't-tool', profileId: 'd', status: 'disconnected', view: 'sftp' }
]
assert.equal(pickBatchTarget(tabs, 'a'), 'reuse')
assert.equal(pickBatchTarget(tabs, 'b'), 'reuse')
assert.equal(pickBatchTarget(tabs, 'c'), 'reconnect')
assert.equal(pickBatchTarget(tabs, 'd'), 'open')
assert.equal(reconnectTabId(tabs, 'c'), 't-dead')
assert.equal(reconnectTabId(tabs, 'd'), null)

const queued = enqueueHostKey(null, [], { id: 'k1' })
assert.equal(queued.current?.id, 'k1')
assert.deepEqual(queued.queue, [])
const waiting = enqueueHostKey(queued.current, queued.queue, { id: 'k2' })
assert.equal(waiting.current?.id, 'k1')
assert.deepEqual(waiting.queue.map((row) => row.id), ['k2'])
const nextKey = advanceHostKey(waiting.queue)
assert.equal(nextKey.current?.id, 'k2')
assert.deepEqual(advanceHostKey([]), { current: null, queue: [] })

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

const hosts = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, label: id }))
let live = 0
let peak = 0
const started: string[] = []
const release: Array<(value: { ok: true } | Error) => void> = []
const settled = new Set<number>()
const pending = runBatchConnect(hosts, 3, (host) => {
  live += 1
  peak = Math.max(peak, live)
  started.push(host.id)
  return new Promise((resolve, reject) => {
    release.push((value) => {
      live -= 1
      if (value instanceof Error) reject(value)
      else resolve(value)
    })
  })
})
const finish = (index: number, value: { ok: true } | Error) => {
  if (settled.has(index)) return
  settled.add(index)
  release[index]!(value)
}
await flush()
assert.deepEqual(started, ['a', 'b', 'c'])
assert.equal(peak, 3)
assert.equal(live, 3)
finish(1, new Error('auth failed'))
await flush()
assert.deepEqual(started, ['a', 'b', 'c', 'd'])
assert.ok(peak <= 3)
finish(0, { ok: true })
finish(2, { ok: true })
finish(3, { ok: true })
await flush()
assert.deepEqual(started, ['a', 'b', 'c', 'd', 'e', 'f'])
assert.ok(peak <= 3)
finish(4, { ok: true })
finish(5, { ok: true })
const results = await pending
assert.deepEqual(results.map((row) => row.id), hosts.map((host) => host.id))
assert.equal(results.find((row) => row.id === 'b')?.ok, false)
assert.equal(results.find((row) => row.id === 'b')?.error, 'auth failed')
assert.ok(results.filter((row) => row.id !== 'b').every((row) => row.ok))
assert.equal(summarizeBatch(results).fail, 1)
assert.equal(summarizeBatch(results).ok, 5)

let capped = 0
const capRelease: Array<() => void> = []
const cappedRun = runBatchConnect(hosts, 99, () => {
  capped += 1
  return new Promise((resolve) => {
    capRelease.push(() => resolve({ ok: true }))
  })
})
await flush()
assert.equal(capped, BATCH_CONNECT_LIMIT_MAX)
while (capRelease.length) {
  const wave = capRelease.splice(0, capRelease.length)
  for (const done of wave) done()
  await flush()
}
await cappedRun
assert.equal(capped, hosts.length)

const syncThrow = await runBatchConnect([{ id: 'x', label: 'x' }, { id: 'y', label: 'y' }], 4, (host) => {
  if (host.id === 'x') throw new Error('boom')
  return Promise.resolve({ ok: true })
})
assert.equal(syncThrow[0]?.ok, false)
assert.equal(syncThrow[1]?.ok, true)
assert.deepEqual(await runBatchConnect([], 4, async () => ({ ok: true })), [])

// L10-4: cancel drops hosts that have not started. In-flight connects still finish.
const queuedHosts = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, label: id }))
const startedAfterCancel: string[] = []
const cancelRelease: Array<() => void> = []
let cancelFlag = false
const progress: Array<{ queued: number; started: number; cancelled: number }> = []
const cancelRun = runBatchConnect(
  queuedHosts,
  2,
  (host) => {
    startedAfterCancel.push(host.id)
    return new Promise((resolve) => {
      cancelRelease.push(() => resolve({ ok: true }))
    })
  },
  {
    isCancelled: () => cancelFlag,
    onProgress: (row) => progress.push({ queued: row.queued, started: row.started, cancelled: row.cancelled })
  }
)
await flush()
assert.deepEqual(startedAfterCancel, ['a', 'b'])
assert.equal(progress.at(-1)?.queued, 4)
assert.equal(progress.at(-1)?.started, 2)
cancelFlag = true
const releaseA = cancelRelease[0]
assert.ok(releaseA)
releaseA()
await flush()
assert.deepEqual(startedAfterCancel, ['a', 'b'])
assert.equal(progress.at(-1)?.queued, 0)
assert.equal(progress.at(-1)?.cancelled, 4)
const releaseB = cancelRelease[1]
assert.ok(releaseB)
releaseB()
const cancelledResults = await cancelRun
assert.deepEqual(startedAfterCancel, ['a', 'b'])
for (const id of ['c', 'd', 'e', 'f']) {
  const row = cancelledResults.find((item) => item.id === id)
  assert.equal(row?.cancelled, true)
  assert.equal(row?.skipped, true)
  assert.equal(row?.ok, true)
}
for (const id of ['a', 'b']) {
  const row = cancelledResults.find((item) => item.id === id)
  assert.equal(row?.ok, true)
  assert.equal(row?.cancelled, undefined)
}
assert.equal(summarizeBatch(cancelledResults).cancelled, 4)
assert.equal(summarizeBatch(cancelledResults).fail, 0)
assert.equal(summarizeBatch(cancelledResults).ok, 2)

assert.equal(zh('ctx.connectAll', { n: 2 }), '连接全部（2）')
assert.equal(en('ctx.connectAll', { n: 2 }), 'Connect all (2)')
assert.equal(zh('l10.connectGroup', { n: 3 }), '连接此分组（3）')
assert.equal(en('l10.connectGroup', { n: 3 }), 'Connect this group (3)')
assert.ok(zh('l10.fail', { host: 'db', reason: '超时' }).includes('db'))
assert.ok(en('l10.fail', { host: 'db', reason: 'timed out' }).toLowerCase().includes('db'))
assert.notEqual(zh('l10.none'), en('l10.none'))
assert.ok(zh('l10.cardTitle', { n: 2 }).includes('2'))
assert.ok(en('l10.summary', { ok: 3, fail: 1 }).toLowerCase().includes('fail'))
assert.equal(zh('l10.cancelQueue'), '取消排队')
assert.equal(en('l10.cancelQueue'), 'Cancel queue')
assert.ok(zh('l10.queue', { started: 2, total: 6, n: 4, ok: 1, fail: 0 }).includes('4'))
assert.ok(zh('l10.okChip', { n: 2 }).includes('2'))
assert.ok(en('l10.failChip', { n: 1 }).toLowerCase().includes('fail'))
assert.ok(zh('l10.queueCurrent', { host: 'alpha' }).includes('alpha'))
assert.ok(en('l10.queueCancelled', { n: 4 }).toLowerCase().includes('cancel'))
assert.notEqual(zh('l10.cancelQueue'), en('l10.cancelQueue'))

assert.ok(paletteMatch('连接所选主机', 'zh-CN').includes('batchConnect'))
assert.ok(paletteMatch('connect selected hosts', 'en').includes('batchConnect'))
assert.ok(paletteMatch('连接当前分组', 'zh-CN').includes('batchConnectGroup'))
assert.ok(paletteMatch('current group', 'en').includes('batchConnectGroup'))
const menuIds = SHARED_MENUS.flatMap((menu) => menu.items.flatMap((item) => (item.type === 'item' ? [item.id] : [])))
assert.equal(menuIds.includes('batchConnect'), true)
assert.equal(menuIds.includes('batchConnectGroup'), true)
assert.deepEqual([...HOST_MENU_MULTI], ['connectAll', 'batch', 'monitorBoard', 'setLevel', 'move', 'delete'])
assert.equal(HOST_MENU_SINGLE[0], 'connect')
assert.equal(HOST_MENU_MULTI.at(-1), 'delete')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const batch = readFileSync('src/shared/batch-connect.ts', 'utf8')
const many = app.slice(app.indexOf('// L10-CONNECT-MANY-START'), app.indexOf('// L10-CONNECT-MANY-END'))
assert.ok(many.includes('runBatchConnect') && many.includes('quiet: true'))
assert.doesNotMatch(many, /ssh\.exec|sendInput|window\.confirm|window\.alert|window\.prompt/)
assert.doesNotMatch(batch, /window\.confirm|child_process|ssh\.exec/)
assert.ok(app.includes('data-ctx="connectAll"') || app.includes("item('connectAll'") || readFileSync('src/shared/inline-menus.ts', 'utf8').includes("id: 'connectAll'"))
assert.ok(app.includes('data-ctx="connectGroup"'))
assert.ok(app.includes('data-testid="l10-errors"'))
assert.ok(app.includes('data-testid="l10-cancel-queue"'))
assert.ok(app.includes('data-testid="l10-queue"'))
assert.ok(app.includes('isCancelled: () => batchCancelRef.current'))
assert.ok(app.includes('enqueueHostKey'))
const cancelUi = app.slice(app.indexOf('// L10-CANCEL-QUEUE-START'), app.indexOf('// L10-CANCEL-QUEUE-END'))
assert.ok(cancelUi.includes('l10.queueCancelled'))
assert.ok(cancelUi.includes('l10-chip-ok') || readFileSync('src/renderer/src/App.tsx', 'utf8').includes('l10-chip-ok'))
assert.ok(readFileSync('src/renderer/src/App.tsx', 'utf8').includes('l10-error-host'))
assert.doesNotMatch(cancelUi, /closeTab|ssh\.disconnect|window\.confirm|window\.alert|window\.prompt/)
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const ops = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.equal(ops.includes('batchConnect'), false)
assert.equal(toolbar.includes('l10.'), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
const order = ['Polish-3', 'A-TFL', '重连策略（L9）', 'A-OM / A-HITL', '分组/多选批量连接（L10）']
let at = 0
for (const mark of order) {
  const i = unreleased.indexOf(mark, at)
  assert.ok(i > at, `changelog order missing ${mark}`)
  at = i
}
assert.ok(unreleased.includes('取消排队'))
assert.ok(unreleased.includes('Cancel queue'))
assert.ok(unreleased.includes('TB-1') && unreleased.includes('TB-2') && unreleased.includes('TB-3'))
assert.ok(unreleased.includes('Polish-2'))

console.log('l10 ok')
