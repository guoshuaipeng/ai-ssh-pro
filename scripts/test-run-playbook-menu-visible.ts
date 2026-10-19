/** runPlaybook visible in menus (not menuHidden); CmdK already had it. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'runPlaybook')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /运行|剧本/)
assert.equal(item.menuHidden, true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'runPlaybook'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.51')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-run-playbook-menu-visible/)
console.log('test-run-playbook-menu-visible ok')
