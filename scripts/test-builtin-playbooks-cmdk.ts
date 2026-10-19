/** Ops/CmdK: built-in playbooks (handler existed, menu missing). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'builtinPlaybooks')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /内置/)
assert.match(item.label.en.toLowerCase(), /built-in|builtin/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'builtinPlaybooks'/)
assert.match(app, /aiss-builtin-playbooks/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-builtin-playbooks-cmdk/)
console.log('test-builtin-playbooks-cmdk ok')
