/** SFTP filename filter for local/remote lists. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sftpNameFilterMatch } from '../src/shared/sftp-name-filter'

assert.equal(sftpNameFilterMatch('README.md', ''), true)
assert.equal(sftpNameFilterMatch('README.md', 'read'), true)
assert.equal(sftpNameFilterMatch('README.md', 'xyz'), false)

const panel = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(panel, /sftpNameFilterMatch/)
assert.match(panel, /sftp-local-name-filter|sftp-remote-name-filter/)
assert.match(panel, /nameFilter/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sftp.nameFilter'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-name-filter/)
console.log('test-sftp-name-filter ok')
