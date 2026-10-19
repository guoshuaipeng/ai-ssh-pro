/** SFTP name filter clear button when query non-empty. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(panel, /sftp-clear-name-filter/)
assert.match(panel, /nameFilter\.trim\(\)/)
assert.match(panel, /setNameFilter\(''\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sftp.clearNameFilter'"))
assert.ok((i18n.match(/'sftp\.clearNameFilter'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.61')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-clear-name-filter/)
console.log('test-sftp-clear-name-filter ok')
