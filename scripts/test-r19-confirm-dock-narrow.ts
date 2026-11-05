/** R19: confirm dock + plan progress further tighten on narrow panel. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R19 Round19: confirm dock + plan progress narrow'))
assert.ok(css.includes('.ai-pending-confirm {\n  container-type: inline-size;') || /\.ai-pending-confirm\s*\{[^}]*container-type:\s*inline-size/.test(css))
assert.ok(css.includes('@container (max-width: 280px)'))
assert.ok(css.includes('.ai-pending-confirm-main'))
assert.ok(css.includes('flex: 1 1 100%'))
assert.ok(css.includes('.ai-pending-confirm-actions'))
assert.ok(css.includes('margin-left: 0'))
assert.ok(css.includes('-webkit-line-clamp: 2'))
assert.ok(css.includes('.ai-panel .ai-active-plan-badge'))
assert.ok(css.includes('.ai-composer-bar .ai-run-streak'))
const start = css.indexOf('R19 Round19: confirm dock + plan progress narrow')
assert.ok(start >= 0)
const end = css.indexOf('/* Plan progress:', start) > start
  ? css.indexOf('\n.ai-input-row', start)
  : css.indexOf('.ai-input-row {', start)
// slice the R19 confirm block only (until next major section after streak rules)
const sliceEnd = css.indexOf('\n.ai-input-row {', start)
const block = css.slice(start, sliceEnd > start ? sliceEnd : start + 2500)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R19 confirm CSS')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('data-testid="ai-pending-confirm"'))
assert.ok(panel.includes('data-r19-narrow="1"'))
assert.ok(panel.includes('data-testid="ai-pending-agree"'))
assert.ok(panel.includes('data-testid="ai-active-plan-step"'))
assert.ok(panel.includes('data-testid="ai-run-steps"'))

console.log('test-r19-confirm-dock-narrow: ok')
