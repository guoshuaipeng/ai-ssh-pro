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
const css = readFileSync('src/renderer/src/features.css', 'utf8')
const inv = css.slice(css.indexOf('@container inv'))
ok(!/max-height: 30%/.test(inv) && /\.inventory-list-pane \{[^}]*overflow: visible/.test(inv), 'IN2 narrow: list pane does not scroll on its own')
ok(css.includes('.inventory-browse-meta { max-height: none; overflow: visible; }'), 'IN2: meta + notes share one scroll')
ok(/\.inv20-svc-filter, \.inv20-svc-filter ~ button[^{]*\{ height: 32px/.test(css), 'IN2: unified control height')
ok(shots.includes('reset') && readFileSync('src/renderer/src/lib/screenshot-hooks.ts', 'utf8').includes('op: "reset"'), 'SI1 reset op')
console.log(`test-popover-tab-switch: ${n} passed`)