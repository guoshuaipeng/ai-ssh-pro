/** auditLog visible in menus (not menuHidden). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'auditLog')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /审计/)
assert.equal(item.menuHidden, true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /auditLog/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-audit-log-menu-visible/)
console.log('test-audit-log-menu-visible ok')
