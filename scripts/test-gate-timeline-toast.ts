/** gateTimeline opens panel with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'gateTimeline'")
assert.ok(idx >= 0)
assert.match(app.slice(idx, idx + 220), /s2b\.timelineOpen/)
assert.match(app.slice(idx, idx + 220), /showToast\(tg\('s2b\.timelineOpen'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("s2b.timelineOpen': '打开闸门时间线'"))
assert.ok(i18n.includes("s2b.timelineOpen': 'Opening gate timeline'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-gate-timeline-toast/)
console.log('test-gate-timeline-toast ok')
