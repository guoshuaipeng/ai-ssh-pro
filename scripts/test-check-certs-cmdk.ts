/** Session/CmdK: check certificates (opens connection editor cert focus). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'checkCerts')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /证书/)
assert.match(item.label.en.toLowerCase(), /cert/)
assert.equal(item.needsSession, true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'checkCerts'/)
assert.match(app, /focus = action === 'setJumpHosts' \? 'jump' : action === 'checkCerts' \? 'cert'/)

const pal = readFileSync('src/renderer/src/lib/palette.ts', 'utf8')
assert.match(pal, /checkCerts/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.7.0')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-check-certs-cmdk/)
console.log('test-check-certs-cmdk ok')
