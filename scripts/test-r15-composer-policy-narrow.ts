/** R15: composer policy menu readable on narrow AI panel. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R15 Round15: composer policy menu narrow'))
assert.ok(css.includes('.ai-composer-bar {\n  flex-wrap: wrap;') || css.includes('.ai-composer-bar {\r\n  flex-wrap: wrap;') || /\.ai-composer-bar\s*\{[^}]*flex-wrap:\s*wrap/.test(css))
assert.ok(css.includes('.ai-composer-bar .ai-safety-chip .ai-safety-chip-label'))
assert.ok(css.includes('text-overflow: ellipsis'))
assert.ok(css.includes('.ai-composer-bar .ai-chip-menu.ai-safety-pop'))
assert.ok(css.includes('width: 100%'))
assert.ok(css.includes('.ai-composer-bar .ai-chip-menu-label'))
assert.ok(css.includes('white-space: normal'))
assert.ok(css.includes('@container (max-width: 230px)'))
assert.ok(css.includes('.ai-composer-bar .ai-model-chip'))
assert.ok(css.includes('max-width: 88px'))
assert.ok(css.includes('.ai-composer-bar .ai-composer-spacer'))
assert.ok(css.includes('display: none'))
// no token fallbacks in R15 block
const start = css.indexOf('R15 Round15: composer policy menu narrow')
const end = css.indexOf('/* H02: suggest-only decision row', start)
assert.ok(start >= 0 && end > start)
const block = css.slice(start, end)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R15 block')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('ai-safety-chip-label'))
assert.ok(panel.includes('data-testid="ai-safety-chip"'))
assert.ok(panel.includes('data-testid="ai-safety-pop"'))
assert.ok(panel.includes('data-testid="ai-safety-option"'))
assert.ok(panel.includes('ai-chip-menu-label'))

console.log('test-r15-composer-policy-narrow: ok')
