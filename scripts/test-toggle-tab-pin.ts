/** Toggle tab pin menu + App wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS, findMenuItem } from '../src/shared/menus'

const pin = findMenuItem(SHARED_MENUS, 'toggleTabPin')
assert.ok(pin && pin.type === 'item')
assert.ok(pin.toggle)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'toggleTabPin'/)
console.log('test-toggle-tab-pin ok')
