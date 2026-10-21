/** D108: the all-tabs button opens (no flash) and is an icon button with a count badge. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
// root cause: "not overflowing → close" ran right after opening, since the button is always shown
assert.equal(app.includes("if (!tabStripOverflowing && tabOverflowOpen && tabOverflowFromRef.current !== 'palette')"), false)
assert.match(app, /if \(was && !tabStripOverflowing && tabOverflowOpen && tabOverflowFromRef\.current !== 'palette'\) setTabOverflowOpen\(false\)/)
// simulate the effect sequence: open while not overflowing → stays open; overflow ends → closes
const run = (seq: Array<[boolean, boolean]>) => { let prev = false; const out: boolean[] = []; for (const [ov, open] of seq) { const was = prev; prev = ov; out.push(was && !ov && open) } return out }
assert.deepEqual(run([[false, false], [false, true], [false, true]]), [false, false, false])
assert.deepEqual(run([[true, true], [false, true]]), [false, true])
// outside-click ignores the button and the portaled list
assert.match(app, /if \(tabOverflowBtnRef\.current\?\.contains\(node\)\) return\s*if \(tabOverflowMenuRef\.current\?\.contains\(node\)\) return/)
const btn = app.slice(app.indexOf('data-testid="tab-overflow"'), app.indexOf('data-testid="tab-overflow-menu"'))
assert.match(app, /className=\{`tab-split-btn tab-overflow-btn/)
assert.match(btn, /title=\{tr\('tab\.allTabsN', \{ n: tabs\.length \}\)\}/)
assert.match(btn, /<svg/)
assert.equal(btn.includes("tr('tab.allTabs')"), false, 'no text label')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'tab.allTabsN': '全部标签（{n}）'"))
assert.ok(i18n.includes("'tab.allTabsN': 'All tabs ({n})'"))
console.log('test-all-tabs-btn ok')
