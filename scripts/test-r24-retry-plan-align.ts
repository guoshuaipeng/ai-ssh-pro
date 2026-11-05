/** R24: post-retry confirm dock/chip/badge share alignPlanStepDisplay. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  alignPlanStepDisplay,
  buildSuggestionStepNos,
  findConfirmableLineIndex,
  planStepDisplayMax
} from '../src/shared/ai-suggestion-steps'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// Simulate failed step then evidence-retry new confirm (history keeps failed card).
const lines = [
  { role: 'user' as const },
  {
    role: 'assistant' as const,
    requestId: 'old-fail',
    structured: { action: 'command' as const, command: 'systemctl restart nginx' }
  },
  { role: 'user' as const }, // 带证据重试 ask
  {
    role: 'assistant' as const,
    requestId: 'retry-ok',
    structured: { action: 'tool_call' as const, toolName: 'get_terminal_snapshot' }
  },
  {
    role: 'assistant' as const,
    requestId: 'retry-confirm',
    structured: { action: 'command' as const, command: 'systemctl status nginx' }
  }
]

const map = buildSuggestionStepNos(lines)
assert.equal(map.get(1), 1) // failed card still step 1
assert.equal(map.get(3), 2)
assert.equal(map.get(4), 3)
assert.equal(findConfirmableLineIndex(lines, 'retry-confirm'), 4)

// Agent runProgress may reset to 1 after retry — UI must prefer suggestion step 3.
const aligned = alignPlanStepDisplay({
  runStep: 1,
  runMax: 3,
  suggestionStep: map.get(4),
  suggestionCount: map.size
})
assert.deepEqual(aligned, { step: 3, max: 3, source: 'suggestion' })
assert.equal(planStepDisplayMax(aligned), 3)
assert.equal(planStepDisplayMax({ step: 4, max: 2 }), 4)

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('planStepDisplayMax'), 'import helper')
assert.ok(panel.includes('data-testid="ai-pending-plan-step"'), 'dock step')
assert.ok(panel.includes("data-pending-align={pendingConfirm ? '1' : undefined}"), 'chip pending mark')
assert.ok(panel.includes('(busy && runProgress) || pendingConfirm'), 'chip visible while pending')
// Confirmable badge must force alignedPlan (no suggestionStepNo.get on badge attrs).
const badgeStart = panel.indexOf('data-testid="ai-active-plan-step"')
assert.ok(badgeStart > 0)
const badgeBlock = panel.slice(badgeStart, badgeStart + 420)
assert.ok(badgeBlock.includes('data-aligned-step={alignedPlan.step}'))
assert.ok(badgeBlock.includes('planStepDisplayMax(alignedPlan)'))
assert.equal(badgeBlock.includes('suggestionStepNo.get(i)'), false, 'badge must not diverge via map lookup')
assert.ok(panel.includes('data-aligned-step={alignedPlan.step}'))
assert.ok(panel.includes("data-testid=\"ai-pending-confirm\""))
assert.ok(panel.includes('data-step-source={alignedPlan.source}'))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R24 Round24: pending dock plan step'))
assert.ok(css.includes('.ai-panel .ai-pending-plan-step'))
const start = css.indexOf('R24 Round24: pending dock plan step')
const end = css.indexOf('/* R23 Round23 polish:', start)
const block = css.slice(start, end > start ? end : start + 900)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks')

const shared = norm('src/shared/ai-suggestion-steps.ts')
assert.ok(shared.includes('export function planStepDisplayMax'))

console.log('test-r24-retry-plan-align: ok')
