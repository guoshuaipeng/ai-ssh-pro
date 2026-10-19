/** SFTP transfer queue UX: progress helpers, grouping, clear finished, panel wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clearFinishedTransfers,
  countFinishedTransfers,
  formatTransferProgress,
  groupTransferTasks,
  transferGroupKey,
  type TransferTask
} from '../src/shared/sftp-queue'

const base = (partial: Partial<TransferTask> & Pick<TransferTask, 'id' | 'status'>): TransferTask => ({
  name: partial.name || partial.id,
  direction: partial.direction || 'upload',
  localPath: partial.localPath || '/tmp/a',
  remotePath: partial.remotePath || '/remote/a',
  hostKey: partial.hostKey || 'h1',
  transferred: partial.transferred ?? 0,
  total: partial.total ?? 0,
  updatedAt: partial.updatedAt || 1,
  ...partial
})

assert.equal(transferGroupKey('running'), 'active')
assert.equal(transferGroupKey('queued'), 'active')
assert.equal(transferGroupKey('paused'), 'paused')
assert.equal(transferGroupKey('interrupted'), 'paused')
assert.equal(transferGroupKey('error'), 'failed')
assert.equal(transferGroupKey('done'), 'finished')
assert.equal(transferGroupKey('cancelled'), 'finished')

const tasks = [
  base({ id: '1', status: 'done', transferred: 10, total: 10 }),
  base({ id: '2', status: 'running', transferred: 50, total: 100, speedBps: 1024 }),
  base({ id: '3', status: 'paused', transferred: 20, total: 100 }),
  base({ id: '4', status: 'error', transferred: 1, total: 100, error: 'boom' }),
  base({ id: '5', status: 'cancelled' })
]
const groups = groupTransferTasks(tasks)
assert.deepEqual(
  groups.map((g) => [g.key, g.tasks.map((t) => t.id)]),
  [
    ['active', ['2']],
    ['paused', ['3']],
    ['failed', ['4']],
    ['finished', ['1', '5']]
  ]
)
assert.equal(countFinishedTransfers(tasks), 2)
assert.deepEqual(
  clearFinishedTransfers(tasks).map((t) => t.id),
  ['2', '3', '4']
)

const prog = formatTransferProgress({ transferred: 512 * 1024, total: 1024 * 1024, speedBps: 1024, status: 'running' })
assert.match(prog, /KB|MB/)
assert.match(prog, /%/)
assert.match(prog, /\/s/)

const panel = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(panel, /sftp-xfer-clear-done/)
assert.match(panel, /sftp-queue-empty/)
assert.match(panel, /groupTransferTasks/)
assert.match(panel, /formatTransferProgress/)
assert.match(panel, /clearFinishedTransfers/)
assert.match(panel, /sftp-xfer-pause/)
assert.match(panel, /sftp-xfer-cancel/)
assert.match(panel, /role="progressbar"/)

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(css, /\.sftp-queue-empty/)
assert.match(css, /\.sftp-transfer-group/)
assert.match(css, /\.sftp-progress-bar\.is-paused/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['d1.clearDone', 'd1.queueEmpty', 'd1.groupActive', 'd1.groupPaused', 'd1.groupFailed', 'd1.groupFinished', 'd1.queued', 'd1.cancelled']) {
  assert.match(i18n, new RegExp(`'${k.replace('.', '\\.')}'`))
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-queue-ux/)

console.log('test-sftp-queue-ux ok')
