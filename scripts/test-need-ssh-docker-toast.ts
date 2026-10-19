/** Opening Docker without SSH session toasts app.needSshDocker. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /setError\(tg\('app\.needSshDocker'\)\)/)
assert.match(app, /showToast\(tg\('app\.needSshDocker'\), \{ kind: 'error' \}\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes('app.needSshDocker'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.58')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-need-ssh-docker-toast/)
console.log('test-need-ssh-docker-toast ok')
