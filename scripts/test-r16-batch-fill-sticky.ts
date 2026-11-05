/** R16: sticky batch bar near first suggestion + 逐条填入. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const panel = norm('src/renderer/src/components/AIPanel.tsx')

assert.ok(panel.includes('firstSuggestionIdx'))
assert.ok(panel.includes('i === firstSuggestionIdx'))
assert.ok(panel.includes('data-testid="ai-batch-copy-bar"'))
assert.ok(panel.includes('data-testid="ai-batch-fill-next"'))
assert.ok(panel.includes('data-testid="ai-batch-copy"'))
assert.ok(panel.includes('startScript(sid, suggestionCommands)'))
assert.ok(panel.includes("tg('d16b.fill'"))
assert.ok(panel.includes("tg('d16.noSession')"))
assert.ok(panel.includes('Fragment key={i}') || panel.includes('<Fragment key={i}>'))
// bar must not only live at the tail
assert.ok(panel.includes('showBatchBar'))
assert.equal(panel.includes('{batchCopyText ? (\n          <div className="ai-batch-copy-bar"'), false, 'tail-only batch bar removed')

const barAt = panel.indexOf('data-testid="ai-batch-copy-bar"')
const firstCmdCard = panel.indexOf('data-testid="ai-cmd-block"')
const tailAt = panel.indexOf('<div ref={tailRef} />')
assert.ok(barAt >= 0 && tailAt > barAt, 'bar still before tail')
assert.ok(firstCmdCard > barAt, 'bar source appears before cmd-block markup in structured card')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R15/R16: multi-step batch copy + fill'))
assert.ok(css.includes('position: sticky'))
assert.ok(css.includes('.ai-panel .ai-btn-batch-fill'))
const start = css.indexOf('R15/R16: multi-step batch copy + fill')
const end = css.indexOf('R15 Round15: composer policy menu narrow', start)
assert.ok(start >= 0 && end > start)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(css.slice(start, end)), false, 'no token fallbacks')

// R15 test still passes conceptually
const r15 = norm('scripts/test-r15-batch-copy-steps.ts')
assert.ok(r15.includes('ai-batch-copy-bar'))

console.log('test-r16-batch-fill-sticky: ok')
