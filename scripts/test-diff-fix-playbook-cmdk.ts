/** AI/CmdK: diff → fix playbook (handler + action-specific toast existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'diffFixPlaybook')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /剧本|差异/)
assert.match(item.label.en.toLowerCase(), /playbook|diff/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'diffFixPlaybook'/)
assert.match(app, /aiss-diff-create/)
assert.match(app, /l8b\.needDiffPlaybook/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-diff-fix-playbook-cmdk/)
console.log('test-diff-fix-playbook-cmdk ok')
