/** View/CmdK: retry failed probes (handler + toasts existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'retryFailedProbes')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /重试|采样/)
assert.match(item.label.en.toLowerCase(), /retry|probe/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'retryFailedProbes'/)
assert.match(app, /l7c\.noFails/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.52')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-retry-failed-probes-cmdk/)
console.log('test-retry-failed-probes-cmdk ok')
