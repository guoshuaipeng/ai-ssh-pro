/** SFTP list sort by name / mtime. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sortSftpEntries } from '../src/shared/sftp-sort'

const rows = [
  { name: 'b.txt', isDirectory: false, modifyTime: 1 },
  { name: 'a', isDirectory: true, modifyTime: 9 },
  { name: 'c.txt', isDirectory: false, modifyTime: 5 }
]
const byName = sortSftpEntries(rows, 'name')
assert.equal(byName[0]!.name, 'a')
assert.equal(byName[1]!.name, 'b.txt')
const byTime = sortSftpEntries(rows, 'mtime')
assert.equal(byTime[0]!.name, 'a')
assert.equal(byTime[1]!.name, 'c.txt')

const panel = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(panel, /sftp-sort-mode/)
assert.match(panel, /sortSftpEntries/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.48')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-sort/)
console.log('test-sftp-sort ok')
