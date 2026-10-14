import assert from 'node:assert/strict'
import { assessCommandRisk } from '../src/shared/command-risk'
import { normalizeTags } from '../src/shared/workspace-features'
import { filterProfiles } from '../src/renderer/src/lib/session-filter'

const high = [
  'rm -rf /', 'sudo rm -rf / --no-preserve-root', 'rm -rf /*', 'rm -fr /etc', 'rm -rf ~', 'mkfs.ext4 /dev/sdb1',
  'dd if=/dev/zero of=/dev/sda bs=1M', ':(){ :|:& };:', 'sudo reboot', 'shutdown -h now', 'chmod -R 777 /',
  'mysql -e "DROP DATABASE prod"', 'iptables -F', 'kill -9 -1'
]
for (const c of high) assert.ok(assessCommandRisk(c), 'should flag: ' + c)
const safe = ['ls -la', 'rm -rf ./build', 'rm file.txt', 'dd if=/dev/zero of=/dev/null', 'echo reboot later', 'git log --oneline', 'chmod 644 a.txt', 'df -h', '']
for (const c of safe) assert.equal(assessCommandRisk(c), null, 'should not flag: ' + c)
assert.equal(assessCommandRisk('rm -rf /')!.reasonKey, 'risk.rmRoot')
assert.equal(assessCommandRisk('sudo reboot')!.reasonKey, 'risk.power')

assert.deepEqual(normalizeTags('Prod, web  #prod；db'), ['prod', 'web', 'db'])
assert.deepEqual(normalizeTags(['A', ' a ', '']), ['a'])
assert.deepEqual(normalizeTags(''), [])
assert.equal(normalizeTags(Array.from({ length: 30 }, (_, i) => 't' + i)).length, 12)

const list = [
  { id: '1', label: 'web-1', host: '10.0.0.1', port: 22, username: 'ops', tags: ['prod', 'web'] },
  { id: '2', label: 'db-1', host: '10.0.0.2', port: 22, username: 'dba', tags: ['staging'] },
  { id: '3', label: 'misc', host: '10.0.0.3', port: 22, username: 'ops' }
]
assert.deepEqual(filterProfiles(list, '#prod').map((x) => x.id), ['1'])
assert.deepEqual(filterProfiles(list, '#st').map((x) => x.id), ['2'])
assert.deepEqual(filterProfiles(list, '#').map((x) => x.id), ['1', '2'])
assert.deepEqual(filterProfiles(list, 'staging').map((x) => x.id), ['2'])
assert.deepEqual(filterProfiles(list, '#prod ops').map((x) => x.id), ['1'])
console.log('round8 ok')
