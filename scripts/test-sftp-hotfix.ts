/**
 * D8 / D6 / D7 SFTP hotfix: per-host tabs, local drive switch, open at session cwd.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cwdFromPwd, findSftpTab, formatSftpTabTitle, planSftpOpen, PWD_TIMEOUT_MS } from '../src/shared/sftp-host'
import {
  drivesFromMounts,
  drivesFromWinDisks,
  listedPathMatchesRequest,
  parseProcMounts,
  selectedDriveId
} from '../src/shared/local-drives'
import { mergeHostQueue, type TransferTask } from '../src/shared/sftp-queue'
import { tabLabel } from '../src/shared/tab-label'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const panel = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
const css = readFileSync('src/renderer/src/styles.css', 'utf8')

const host = (profileId: string, tabId: string, view = 'sftp') => ({
  tabId,
  view,
  profileId,
  host: profileId,
  port: 22,
  username: 'root'
})

// HF-1 / D8: two hosts stay open; same host focuses; closing A leaves B.
const both = [host('A', 'sftp-a'), host('B', 'sftp-b'), { tabId: 'term-a', view: 'session', profileId: 'A', host: 'a', port: 22, username: 'root' }]
assert.equal(planSftpOpen(both, { profileId: 'B' }).action, 'focus')
assert.equal((planSftpOpen(both, { profileId: 'B' }) as { tabId: string }).tabId, 'sftp-b')
assert.equal(planSftpOpen(both, { profileId: 'C' }).action, 'create')
assert.equal(findSftpTab(both, { profileId: 'A' })?.tabId, 'sftp-a')
const closedA = both.filter((t) => t.tabId !== 'sftp-a')
assert.ok(closedA.some((t) => t.tabId === 'sftp-b'))
assert.equal(planSftpOpen(closedA, { profileId: 'B' }).action, 'focus')
assert.equal(planSftpOpen(closedA, { profileId: 'A' }).action, 'create')
assert.equal(findSftpTab(both, { profileId: '' }), undefined)
assert.equal(formatSftpTabTitle('web-01'), 'SFTP · web-01')
assert.equal(formatSftpTabTitle('a-very-long-hostname-name').length, 24)

const tr = (key: string, vars?: Record<string, string | number>) => {
  if (key === 'd8.title') return `SFTP · ${vars?.host ?? ''}`
  if (key === 'tab.sftp') return 'SFTP'
  return key
}
assert.equal(tabLabel({ title: 'ignored', view: 'sftp', hostLabel: 'alpha' }, tr), 'SFTP · alpha')
assert.notEqual(
  tabLabel({ title: 'x', view: 'sftp', hostLabel: 'alpha' }, tr),
  tabLabel({ title: 'x', view: 'sftp', hostLabel: 'beta' }, tr)
)

assert.ok(app.includes('planSftpOpen'), 'open path is keyed by host')
assert.ok(app.includes("showToast(tg('d8.focus'))"), 'same-host open focuses')
assert.ok(!app.includes("const existing = tabs.find((t) => t.view === 'sftp')"), 'no global sftp singleton')
assert.ok(app.includes('sftpAlignCwd'), 'cwd align flag lives on the tab')
assert.ok(app.includes('alignCwd: true'), 'session entry points request cwd')
assert.ok(app.includes('openSftpFromHost'), 'host menu opens by profile')

// HF-2 / D6
const disks = drivesFromWinDisks([
  { DeviceID: 'C:', VolumeName: 'System', Size: 100 },
  { DeviceID: 'D:', VolumeName: '', Size: null },
  { DeviceID: 'E:', VolumeName: 'Data', Size: 50 }
])
assert.deepEqual(disks.map((d) => [d.id, d.ready]), [
  ['C:', true],
  ['D:', false],
  ['E:', true]
])
assert.equal(selectedDriveId(disks, 'D:\\work\\app', 'win32'), 'D:')
assert.equal(selectedDriveId(disks, 'C:/Users/demo', 'win32'), 'C:')
assert.equal(listedPathMatchesRequest('D:\\foo', 'D:/foo', true), true)
assert.equal(listedPathMatchesRequest('D:\\', 'C:\\Users\\demo', true), false)

const mounts = drivesFromMounts(parseProcMounts('proc /proc proc rw 0 0\n/dev/sdb1 /mnt/usb ext4 rw 0 0\n/dev/sda1 / ext4 rw 0 0\n'), '/home/demo')
assert.deepEqual(mounts.map((d) => d.id), ['/', '~', '/mnt/usb'])
assert.equal(selectedDriveId(mounts, '/home/demo/proj', 'posix'), '~')
assert.equal(selectedDriveId(mounts, '/var/www', 'posix'), '/')
assert.equal(selectedDriveId(mounts, '/mnt/usb/photos', 'posix'), '/mnt/usb')

assert.ok(panel.includes('data-testid="sftp-drive-switch"'), 'drive control is in the local pane')
assert.ok(panel.includes("tg('d6.fail'"), 'unavailable or failed drive toasts')
assert.ok(panel.includes('disabled: !d.ready'), 'not-ready drives are disabled')
assert.ok(css.includes('.sftp-drive') && css.includes('flex-wrap: nowrap') && css.includes('max-width: 72px'), 'drive control keeps a fixed width')

// HF-3 / D7
assert.equal(PWD_TIMEOUT_MS <= 2000, true)
assert.equal(cwdFromPwd({ code: 0, stdout: '/var/www\n' }), '/var/www')
assert.equal(cwdFromPwd({ code: 0, stdout: '/var/www/my app\n' }), '/var/www/my app')
assert.equal(cwdFromPwd({ code: 1, stdout: '/var/www\n' }), null)
assert.equal(cwdFromPwd({ code: null, stdout: '', stderr: 'timeout' }), null)
assert.equal(cwdFromPwd({ code: 0, stdout: 'not-a-path\n' }), null)
assert.ok(panel.includes("ssh.exec(sessionId, 'pwd', PWD_TIMEOUT_MS)"), 'pwd uses the short timeout')
assert.ok(panel.includes('data-testid="sftp-cwd-fallback"'), 'pwd failure shows a soft hint')
assert.ok(panel.includes('remoteOpenedFor'), 'a focused tab does not list again')

const task = (id: string, hostKey: string): TransferTask => ({
  id,
  name: id,
  direction: 'upload',
  localPath: '/tmp/' + id,
  remotePath: '/tmp/' + id,
  hostKey,
  transferred: 1,
  total: 2,
  status: 'paused',
  updatedAt: 1
})
const merged = mergeHostQueue([task('a', 'profile:A'), task('b', 'profile:B')], [task('a2', 'profile:A')], 'profile:A')
assert.deepEqual(merged.map((t) => t.id).sort(), ['a2', 'b'])

console.log('sftp hotfix D6/D7/D8 ok')
