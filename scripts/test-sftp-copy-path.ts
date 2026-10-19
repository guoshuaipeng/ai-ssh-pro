/** SFTP crumb bar: copy local/remote cwd path. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(panel, /sftp-copy-remote-path/)
assert.match(panel, /sftp-copy-local-path/)
assert.match(panel, /navigator\.clipboard\.writeText\(cwd\)/)
assert.match(panel, /sftp\.copiedPath/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sftp.copyPath'"))
assert.ok(i18n.includes("'sftp.copiedPath'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.61')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-copy-path/)
console.log('test-sftp-copy-path ok')
