/** openSftpFromHost toasts when opening SFTP. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const openSftpFromHost')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /setSessionMenu\(null\)/)
assert.match(chunk, /showToast\(tg\('toolbar\.sftpTitle'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-open-sftp-from-host-toast/)
console.log('test-open-sftp-from-host-toast ok')
