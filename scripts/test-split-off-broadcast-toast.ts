/** Split status chip: toast notes broadcast when both turn off. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /data-testid="statusbar-split"/)
assert.match(app, /sb\.splitOffAlsoBroadcast/)
assert.match(app, /alsoBroadcast/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sb.splitOffAlsoBroadcast': '已退出分屏并关闭广播'"))
assert.ok(i18n.includes("sb.splitOffAlsoBroadcast': 'Split off; broadcast disabled'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-split-off-broadcast-toast/)
console.log('test-split-off-broadcast-toast ok')
