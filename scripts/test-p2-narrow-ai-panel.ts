/** P2: narrow AI side panel — suggest Copy+Fill and step+risk pills layout. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('P2 Round4: narrow AI panel'))
assert.ok(css.includes('.ai-panel .ai-suggest-only > .ai-decision'))
assert.ok(css.includes('flex: 1 1 100%'))
assert.ok(css.includes('text-overflow: ellipsis'))
assert.ok(css.includes('.ai-panel .ai-suggest-only > .ai-fill-cmd-btn'))
assert.ok(css.includes('.ai-panel .ai-tool-meta'))
assert.ok(css.includes('.ai-panel .ai-tool-meta .ai-step-index'))
assert.ok(css.includes('.ai-panel .ai-tool-meta .ai-risk-badge'))
assert.ok(css.includes('white-space: nowrap'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('className="ai-tool-meta"'))
assert.ok(panel.includes('data-testid="ai-tool-meta"'))
assert.equal((panel.match(/data-testid="ai-tool-meta"/g) || []).length >= 3, true, 'meta on strip + tool + command')
assert.ok(panel.includes('data-testid="ai-step-index"'))
assert.ok(panel.includes('<RiskBadge level={s.riskLevel} />'))

const bar = norm('src/renderer/src/components/SafetyCommandBar.tsx')
assert.ok(bar.includes('ai-suggest-only'))
assert.ok(bar.includes('data-testid="safety-suggest-copy"'))
assert.ok(bar.includes('data-testid="safety-suggest-fill"'))
// status then buttons — decision span before copy/fill
const suggest = bar.slice(bar.indexOf("mode === 'suggest'"), bar.indexOf("mode === 'hold'"))
assert.ok(suggest.indexOf('ai-decision') < suggest.indexOf('safety-suggest-copy'))
assert.ok(suggest.indexOf('safety-suggest-copy') < suggest.indexOf('safety-suggest-fill'))

console.log('test-p2-narrow-ai-panel: ok')
