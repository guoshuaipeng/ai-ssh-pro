/** SFTP go-to-path: normalize + Go button. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeGotoPath } from '../src/shared/sftp-goto-path'

assert.equal(normalizeGotoPath(' /tmp/x ', 'remote'), '/tmp/x')
assert.equal(normalizeGotoPath('" /var/log "', 'remote'), '/var/log')
assert.equal(normalizeGotoPath('tmp', 'remote'), '/tmp')
assert.equal(normalizeGotoPath("  D:\\data  ", 'local').trim().startsWith('D:'), true)

const panel = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(panel, /sftp-remote-go-path/)
assert.match(panel, /sftp-local-go-path/)
assert.match(panel, /normalizeGotoPath/)
assert.match(panel, /sftp-remote-path-input/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sftp.goPath'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.55')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-go-path/)
console.log('test-sftp-go-path ok')
