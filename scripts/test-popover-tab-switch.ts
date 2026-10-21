import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
let n = 0
const ok = (c: boolean, m: string) => { assert.ok(c, m); n++ }
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(/useEffect\(\(\) => \{\s*closeContextMenu\(\)\s*\}, \[activeTabId\]\)/.test(app), 'tab switch closes popovers')
const sel = readFileSync('src/renderer/src/components/ui/Select.tsx', 'utf8')
ok(sel.includes("window.addEventListener('aiss:close-menus', onCloseAll)") && sel.includes("window.removeEventListener('aiss:close-menus', onCloseAll)"), 'Select listens to close-menus')
const df = readFileSync('src/renderer/src/components/ui/DateField.tsx', 'utf8')
ok(df.includes("window.addEventListener('aiss:close-menus', onClose)"), 'DateField listens to close-menus')
const shots = readFileSync('scripts/screenshot-key-screens.mjs', 'utf8')
ok(shots.includes("name: 'leak-date'") && shots.includes("name: 'leak-select'"), 'repro scenarios exist')
ok(shots.includes("dfPop: !!document.querySelector('.df-pop')"), 'probe reports leaks')
console.log(`test-popover-tab-switch: ${n} passed`)