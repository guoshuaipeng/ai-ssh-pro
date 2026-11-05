/** R13: narrow AI chrome — cancel card, D29 resume chip, suggest row. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R13 Round13: cancel / D29 / suggest narrow chrome'))
assert.ok(css.includes('.ai-panel .ai-stream-head'))
assert.ok(css.includes('.ai-panel .ai-stream-label'))
assert.ok(css.includes('.ai-panel .ai-card-cancelled'))
assert.ok(css.includes('border-left: 2px solid var(--color-text-muted)'))
assert.ok(css.includes('.ai-panel .ai-resume-last'))
assert.ok(css.includes('text-overflow: ellipsis'))
assert.ok(css.includes('@container (max-width: 230px)'))
assert.ok(css.includes('.ai-panel .ai-card-cancelled .ai-stream-label'))
assert.ok(css.includes('.ai-panel .ai-suggest-only > .ai-decision'))
// no token fallbacks in the new block
const start = css.indexOf('R13 Round13: cancel / D29 / suggest narrow chrome')
const end = css.indexOf('/* H02: suggest-only decision row', start)
const block = css.slice(start, end)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R13 block')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('ai-card-cancelled'))
assert.ok(panel.includes('data-testid="ai-cancelled-retry"'))
assert.ok(panel.includes('data-testid="ai-cancelled-label"'))
assert.ok(panel.includes('ai-resume-last'))
assert.ok(panel.includes("title={(resumeHit.title || tg('ai.untitledChat')) + ' — ' + tg('d29.tip')}"))
assert.ok(panel.includes('data-resume-kind='))

const bar = norm('src/renderer/src/components/SafetyCommandBar.tsx')
assert.ok(bar.includes('ai-suggest-only'))
assert.ok(bar.includes('data-testid="safety-suggest-copy"'))
assert.ok(bar.includes('data-testid="safety-suggest-fill"'))

console.log('test-r13-narrow-ai-chrome: ok')
