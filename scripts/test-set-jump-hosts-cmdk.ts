/** Session/CmdK: jump hosts (opens connection editor jump focus). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'setJumpHosts')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /跳板/)
assert.match(item.label.en.toLowerCase(), /jump/)
assert.equal(item.needsSession, true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'setJumpHosts'/)
assert.match(app, /'jump'/)

const pal = readFileSync('src/renderer/src/lib/palette.ts', 'utf8')
assert.match(pal, /setJumpHosts/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-set-jump-hosts-cmdk/)
console.log('test-set-jump-hosts-cmdk ok')
