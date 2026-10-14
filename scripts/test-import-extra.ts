import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMobaXtermSessions, parseSecureCrtSession } from '../src/main/session-import-extra'
import { importSessionFilesFromPaths } from '../src/main/session-import'

const moba = [
  '[Bookmarks]',
  'SubRep=',
  'ImgNum=42',
  'demo-web-01=#109#0%10.0.0.11%22%ops%%-1%-1%%%22%%0%0%0%%%-1%0%0%0%%1080%%0%0%1#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%-1%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%1%-1#0# #-1',
  'rdp-box=#91#4%10.0.0.99%3389%admin%0%-1',
  '[Bookmarks_1]',
  'SubRep=Prod\\DB',
  'ImgNum=41',
  'demo-db=#109#0%192.0.2.21%2222%dba%%-1',
  'broken=#109#0%%22%%'
].join('\r\n')
const m = parseMobaXtermSessions(moba)
assert.deepEqual(m, [
  { label: 'demo-web-01', host: '10.0.0.11', port: 22, username: 'ops' },
  { label: 'Prod/DB/demo-db', host: '192.0.2.21', port: 2222, username: 'dba' }
])

const crt = ['S:"Protocol Name"=SSH2', 'S:"Hostname"=192.0.2.50', 'S:"Username"=root', 'D:"[SSH2] Port"=00000816'].join('\n')
assert.deepEqual(parseSecureCrtSession('k8s-master', crt), { label: 'k8s-master', host: '192.0.2.50', port: 2070, username: 'root' })
assert.equal(parseSecureCrtSession('x', 'S:"Protocol Name"=Telnet\nS:"Hostname"=a\nS:"Username"=b'), null)

const dir = mkdtempSync(join(tmpdir(), 'aissh-imp-'))
try {
  writeFileSync(join(dir, 'MobaXterm.mxtsessions'), moba)
  writeFileSync(join(dir, 'k8s-master.ini'), crt)
  const res = await importSessionFilesFromPaths([join(dir, 'MobaXterm.mxtsessions'), join(dir, 'k8s-master.ini')])
  assert.equal(res.items.length, 3, JSON.stringify(res))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log('import-extra ok')
