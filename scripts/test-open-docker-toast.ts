/** openDocker toasts picker / opening with host. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'openDocker'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 700)
assert.match(block, /docker\.pickHost/)
assert.match(block, /docker\.opening/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("docker.pickHost': '请选择主机以打开 Docker'"))
assert.ok(i18n.includes("docker.pickHost': 'Choose a host to open Docker'"))
assert.ok(i18n.includes("docker.opening': '正在打开 Docker · {host}'"))
assert.ok(i18n.includes("docker.opening': 'Opening Docker · {host}'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.58')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-open-docker-toast/)
console.log('test-open-docker-toast ok')
