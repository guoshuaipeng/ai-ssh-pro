import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
let n = 0
const ok = (c: boolean, m: string) => { assert.ok(c, m); n++ }
const shots = readFileSync('scripts/screenshot-key-screens.mjs', 'utf8')
ok(shots.includes("s.name.startsWith('leak-')") && shots.includes('app.exit(3)'), 'SA1 leak scenarios fail the run')
const css = readFileSync('src/renderer/src/features.css', 'utf8')
ok(css.includes('.inv20-readonly { grid-template-columns: max-content minmax(0, 1fr);') && css.includes('.inv20-readonly > div { display: contents; }'), 'IN3 labels in one column')
ok(css.includes('.inv20-readonly dt { white-space: nowrap; }'), 'IN3 labels never wrap')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('className="term-guard-demo-short"'), 'TB1 short chip')
ok(/@media \(max-width: 1100px\) \{\s*\.term-guard-demo-text \{ display: none; \}/.test(css), 'TB1 narrow hides long text')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
ok(i18n.includes("'g1.bannerShort': '演示'") && i18n.includes("'g1.bannerShort': 'Demo'"), 'TB1 zh/en')
console.log(`test-c52-polish: ${n} passed`)