/** addDemoHost toasts when adding/opening demo. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /l7\.demoAddedConnect/)
assert.match(app, /l7\.demoConnect/)
assert.match(app, /l7\.demoAdded/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l7.demoAddedConnect': '已添加并打开演示主机'"))
assert.ok(i18n.includes("l7.demoAddedConnect': 'Demo host added and opening'"))
assert.ok(i18n.includes("l7.demoConnect': '正在打开演示主机…'"))
assert.ok(i18n.includes("l7.demoConnect': 'Opening demo host…'"))
assert.ok(i18n.includes("l7.demoAdded': '已添加演示主机'"))
assert.ok(i18n.includes("l7.demoAdded': 'Demo host added'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-demo-host-toast/)
console.log('test-demo-host-toast ok')
