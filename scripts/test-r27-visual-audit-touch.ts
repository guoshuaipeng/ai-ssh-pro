/** R27: full-page visual audit quick P2 — memory touch targets ≥32px; no token fallbacks. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const css = norm('src/renderer/src/styles.css')

assert.ok(css.includes('R27 Round27: memory expand touch hit'))
const r25 = css.indexOf('R25 Round25: working-memory expand UX')
assert.ok(r25 >= 0)
const head = css.indexOf('.ai-panel .ai-header-shortcut kbd {', r25)
assert.ok(head > r25)
const memoryChunk = css.slice(r25, head)
assert.equal(memoryChunk.includes('min-height: 28px'), false, 'R25 memory chunk must not keep 28px')
assert.ok(/\.ai-memory-close\s*\{[\s\S]*?min-height:\s*32px/.test(memoryChunk))
assert.ok(/ai-memory-jump-btn\s*\{[\s\S]*?min-height:\s*32px/.test(memoryChunk))

const r27 = css.indexOf('R27 Round27: memory expand touch hit')
assert.ok(r27 > r25, 'R27 marker after R25')
const r27end = css.indexOf('.ai-panel .ai-header-shortcut kbd {', r27)
const r27block = css.slice(r27, r27end > r27 ? r27end : r27 + 400)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(r27block), false, 'no token fallbacks in R27 CSS')
assert.ok(/\.ai-memory-chip\s*\{[\s\S]*?min-height:\s*32px/.test(r27block))

const design = norm('docs/design/r27-full-page-visual-audit.md')
assert.ok(design.includes('full-page visual audit'))
assert.ok(design.includes('seed matching') || design.includes('bump to 32px'))

const backlog = norm('docs/backlog.md')
assert.ok(backlog.includes('Round 27 全页轻量视觉审计') || backlog.includes('2026-11-05 Round 27'))

console.log('test-r27-visual-audit-touch: ok')
