/** Opening SFTP without SSH session toasts app.needSshSftp. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const n = (app.match(/showToast\(tg\('app\.needSshSftp'\), \{ kind: 'error' \}\)/g) || []).length
assert.ok(n >= 3, `expected >=3 needSshSftp toasts, got ${n}`)
assert.ok(app.includes("setError(tg('app.needSshSftp'))"))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes('app.needSshSftp'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.40')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-need-ssh-sftp-toast/)
console.log('test-need-ssh-sftp-toast ok')
