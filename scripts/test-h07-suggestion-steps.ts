/** H07: tool/command suggestion steps show readable step index + risk without clutter. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8').replace(/\r\n/g, '\n')
assert.ok(panel.includes('const suggestionStepNo = useMemo'), 'step map useMemo')
assert.ok(panel.includes("action === 'command' || action === 'tool_call'"))
assert.ok(panel.includes('data-testid="ai-step-index"'))
assert.ok(panel.includes("tg('ai.stepIndex', { n:"))
assert.ok(panel.includes('ai-tool-strip--plan'))
assert.ok(panel.includes('ai-tool-step--wrap'))
// risk stays next to step on command / tool heads
assert.ok(panel.includes('<RiskBadge level={s.riskLevel} />'))
assert.equal((panel.match(/data-testid="ai-step-index"/g) || []).length >= 3, true, 'step index on strip + tool + command')

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(css.includes('.ai-step-index'))
assert.ok(css.includes('.ai-tool-strip--plan'))
assert.ok(css.includes('.ai-tool-step--wrap'))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'ai.stepIndex': '步骤 {n}'"))
assert.ok(i18n.includes("'ai.stepIndex': 'Step {n}'"))
assert.equal(i18n.split("'ai.stepIndex':").length - 1, 2)

console.log('test-h07-suggestion-steps: ok')
