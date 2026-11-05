/** R30: full-page visual audit quick P2 — host banner touch ≥32px + narrow hide hint. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const css = norm('src/renderer/src/styles.css')

assert.ok(css.includes('R30 Round30: host banner touch + narrow'))
const start = css.indexOf('R30 Round30: host banner touch + narrow')
const block = css.slice(start, start + 700)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R30 CSS')
assert.ok(/\.ai-prod-auto-banner,\s*\.ai-readonly-banner\s*\{[\s\S]*?min-height:\s*32px/.test(block))
assert.ok(block.includes('@container (max-width: 230px)'))
assert.ok(/\.ai-prod-auto-hint,\s*\.ai-readonly-hint\s*\{[\s\S]*?display:\s*none/.test(block))
assert.ok(/text-overflow:\s*ellipsis/.test(block))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('panelReadonly && !panelProdAuto'), 'readonly/prod mutually exclusive')
assert.ok(panel.includes('data-testid="ai-prod-auto-banner"'))
assert.ok(panel.includes('data-testid="ai-readonly-banner"'))

const design = norm('docs/design/r30-full-page-visual-audit.md')
assert.ok(design.includes('full-page visual audit'))
assert.ok(design.includes('min-height: 32px') || design.includes('banner `min-height: 32px`'))
assert.ok(design.includes('contrast'))

const backlog = norm('docs/backlog.md')
assert.ok(
  backlog.includes('Round 30 全页') ||
    backlog.includes('Round 30 整页') ||
    backlog.includes('2026-11-05 Round 30')
)

console.log('test-r30-visual-audit-banner: ok')
