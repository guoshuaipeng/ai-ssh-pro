import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
let n = 0
const ok = (c: boolean, m: string) => { assert.ok(c, m); n++ }
const css = readFileSync('src/renderer/src/features.css', 'utf8')
// IN1 inventory narrow
ok(/\.workspace-panel-body:has\(> \.inventory-layout\)[^{]*\{ container-type: inline-size; container-name: inv;/.test(css), 'inventory container')
const inv = css.slice(css.indexOf('@container inv'))
ok(/\.inventory-layout \{ grid-template-columns: 1fr;/.test(inv), 'inventory stacks when narrow')
// NS4 zero native selects
const base = JSON.parse(readFileSync('scripts/native-select-baseline.json', 'utf8'))
ok(base.count === 0, 'native select baseline is 0')
for (const f of ['HealthProbeFields', 'MultiHostDashboard', 'PostmortemTab', 'RecordingsTab', 'RemoteTextEditor', 'ResourceMonitorModal']) ok(!readFileSync(`src/renderer/src/components/${f}.tsx`, 'utf8').includes('<select'), f)
// P2: known-hosts orphan rule, merged banners, tab menu hint
ok(css.includes('.kh-lookup { padding-bottom: var(--space-2); }'), 'kh-lookup has no divider')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('className="term-guard-demo"') && app.includes('activeIsDemo && !(activeTab?.sessionId'), 'demo banner merges into guard banner')
const menus = readFileSync('src/shared/inline-menus.ts', 'utf8')
ok(menus.includes("titleKey: 'tab.closeOthersKeep'") && !menus.includes("hintKey: 'tab.closeOthersKeep'"), 'close-others hint is a tooltip')
console.log(`test-c50-polish: ${n} passed`)