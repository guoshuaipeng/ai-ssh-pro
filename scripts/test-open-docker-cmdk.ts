/** Ops/CmdK: open Docker containers (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'openDocker')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /Docker/)
assert.match(item.label.en.toLowerCase(), /docker/)
assert.ok(item.needsSession)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'openDocker'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-open-docker-cmdk/)
console.log('test-open-docker-cmdk ok')
