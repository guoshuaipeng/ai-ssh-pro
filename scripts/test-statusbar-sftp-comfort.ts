/** Status-bar chip when SFTP comfort density is on. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-sftp-comfort/)
assert.match(app, /sftpComfort/)
assert.match(app, /saveSftpDensity\('auto'\)/)
assert.match(app, /sb\.sftpComfort/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.sftpComfort'"))
assert.ok((i18n.match(/'sb\.sftpComfort'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-sftp-comfort/)
console.log('test-statusbar-sftp-comfort ok')
