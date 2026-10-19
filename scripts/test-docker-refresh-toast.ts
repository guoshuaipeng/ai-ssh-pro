/** refreshDockerForActiveHost toasts start / missing session. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /docker\.refreshing/)
assert.match(app, /showToast\(tg\('docker\.refreshing', \{ host \}\)\)/)
assert.match(app, /showToast\(msg, \{ kind: 'error' \}\)/)
assert.match(app, /app\.needSshRefreshDocker/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("docker.refreshing': '正在刷新 Docker · {host}'"))
assert.ok(i18n.includes("docker.refreshing': 'Refreshing Docker · {host}'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-docker-refresh-toast/)
console.log('test-docker-refresh-toast ok')
