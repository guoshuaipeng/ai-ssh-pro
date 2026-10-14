import assert from 'node:assert/strict'
import { filterProfiles, folderMatches } from '../src/renderer/src/lib/session-filter'

const p = (label: string, host: string, username: string, port = 22) => ({ id: label, label, host, username, port })
const list = [p('demo-web-01', '10.0.0.11', 'ops'), p('demo-web-02', '10.0.0.12', 'deploy', 2222), p('demo-db', '10.0.1.21', 'dba')]
assert.equal(filterProfiles(list, '').length, 3)
assert.deepEqual(filterProfiles(list, 'web ops').map((x) => x.label), ['demo-web-01'])
assert.deepEqual(filterProfiles(list, 'deploy@10.0.0.12').map((x) => x.label), ['demo-web-02'])
assert.deepEqual(filterProfiles(list, ':2222').map((x) => x.label), ['demo-web-02'])
assert.equal(filterProfiles(list, 'web dba').length, 0)
assert.equal(folderMatches('Demo · Database', 'data'), true)
assert.equal(folderMatches('Demo · Database', ''), false)
console.log('session-filter ok')
