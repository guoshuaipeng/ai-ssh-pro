import assert from 'node:assert/strict'
import { parseResourceSnapshot, formatBytes, formatUptime, RESOURCE_PROBE_CMD } from '../src/shared/resource-monitor'
import { decryptBackup, encryptBackup } from '../src/main/backup-crypto'

export const FIXTURE = [
  '0.52 0.40 0.30 1/200 12345', '@@', '4', '@@',
  'cpu  100 0 100 800 0 0 0 0 0 0', 'cpu  150 0 150 900 0 0 0 0 0 0', '@@',
  '              total        used        free      shared  buff/cache   available',
  'Mem:     8000000000  3000000000  1000000000        1000  4000000000  6000000000',
  'Swap:    2000000000   500000000  1500000000', '@@',
  'Filesystem     1024-blocks      Used Available Capacity Mounted on',
  '/dev/vda1         41152832  20576416  20576416      50% /',
  '/dev/vdb1        103081248  92773123  10308125      90% /data', '@@',
  '93784.12 300000.00'
].join('\n')

const s = parseResourceSnapshot(FIXTURE)
assert.deepEqual(s.load, [0.52, 0.4, 0.3])
assert.equal(s.cores, 4)
assert.equal(s.cpuPercent, 50)
assert.equal(s.mem!.percent, 25)
assert.equal(s.mem!.used, 2000000000)
assert.equal(s.swap!.percent, 25)
assert.deepEqual(s.disks.map((d) => [d.mount, d.percent]), [['/', 50], ['/data', 90]])
assert.equal(s.uptimeSec, 93784)
assert.equal(formatUptime(93784), '1d 2h 3m')
assert.equal(formatBytes(2000000000), '1.9 GB')
assert.equal(formatBytes(512), '512 B')
const empty = parseResourceSnapshot('garbage')
assert.equal(empty.load, null)
assert.equal(empty.mem, null)
assert.deepEqual(empty.disks, [])
assert.ok(RESOURCE_PROBE_CMD.includes('/proc/loadavg') && !RESOURCE_PROBE_CMD.includes('\n'))

const profileId = 'profile-p1-7c4e9a1b'
const secret = 's3cret-pass'
const snippetTitle = '中文 ok'
const payload = { savedSessions: { folders: [], profiles: [{ id: profileId, password: secret }] }, snippets: [{ title: snippetTitle }] }
const env = encryptBackup(payload, 'correct horse battery')
const text = JSON.stringify(env)
// "p1" shows up inside base64 salt/iv/tag/data by chance (~7% of runs) and is not a leak.
for (const needle of [secret, profileId, snippetTitle, 'savedSessions']) {
  assert.ok(!text.includes(needle), `ciphertext leaks plaintext: ${needle}`)
}
const cipherBytes = Buffer.from(env.data, 'base64')
assert.ok(!cipherBytes.includes(JSON.stringify(payload)), 'ciphertext is plaintext')
assert.ok(!cipherBytes.includes(secret), 'ciphertext leaks secret bytes')
assert.deepEqual(decryptBackup(text, 'correct horse battery'), payload)
assert.throws(() => decryptBackup(text, 'wrong password!!'), /wrong-password/)
assert.throws(() => decryptBackup('{"format":"nope"}', 'x'), /not-a-backup/)
assert.throws(() => decryptBackup('not json', 'x'), /not-a-backup/)
assert.throws(() => encryptBackup(payload, 'short'), /password-too-short/)
const tampered = { ...env, data: Buffer.from('x' + Buffer.from(env.data, 'base64').toString('latin1'), 'latin1').toString('base64') }
assert.throws(() => decryptBackup(tampered, 'correct horse battery'), /wrong-password/)
assert.notEqual(encryptBackup(payload, 'correct horse battery').iv, env.iv)
console.log('round10 ok')
