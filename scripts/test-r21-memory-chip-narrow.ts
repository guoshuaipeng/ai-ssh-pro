/** R21: memory chip ultra-narrow — count only + aria-label. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('data-testid="ai-memory-chip"'))
assert.ok(panel.includes("aria-label={`${tg('wm.memory')} · ${memoryView.count}`}"))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('.ai-panel .ai-memory-chip-label'))
assert.ok(css.includes('display: none'))
// ultra-narrow container rule hides label
const idx = css.indexOf('/* R21: memory chip ultra-narrow')
assert.ok(idx >= 0, 'R21 memory narrow comment')
const slice = css.slice(idx, idx + 500)
assert.ok(slice.includes('max-width: 230px'))
assert.ok(slice.includes('.ai-memory-chip-label'))
assert.ok(slice.includes('display: none'))

console.log('test-r21-memory-chip-narrow: ok')
