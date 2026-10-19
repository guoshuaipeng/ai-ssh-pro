/** Session/CmdK readonly on/off + already-state toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

for (const id of ['readonlyOn', 'readonlyOff'] as const) {
  const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === id)
  assert.ok(item && item.type === 'item', id)
  assert.equal(item.needsSession, true)
}

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /s4\.alreadyOn/)
assert.match(app, /s4\.alreadyOff/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("s4.alreadyOn': '已是只读会话'"))
assert.ok(i18n.includes("s4.alreadyOff': '当前不是只读会话'"))
assert.ok(i18n.includes("s4.alreadyOn': 'Already read-only'"))
assert.ok(i18n.includes("s4.alreadyOff': 'Not in read-only session'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.55')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-readonly-session-cmdk/)
console.log('test-readonly-session-cmdk ok')
