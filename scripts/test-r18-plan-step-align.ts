/** R18: plan chip + active badge + suggestion step labels share one index. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  alignPlanStepDisplay,
  buildSuggestionStepNos,
  findConfirmableLineIndex
} from '../src/shared/ai-suggestion-steps'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const lines = [
  { role: 'user' as const },
  { role: 'assistant' as const, structured: { action: 'end' as const } },
  {
    role: 'assistant' as const,
    requestId: 'r1',
    structured: { action: 'tool_call' as const, toolName: 'get_terminal_snapshot' }
  },
  {
    role: 'assistant' as const,
    requestId: 'r2',
    structured: { action: 'command' as const, command: 'df -h' }
  },
  {
    role: 'assistant' as const,
    requestId: 'r3',
    structured: { action: 'command' as const, command: 'free -m' }
  }
]

const map = buildSuggestionStepNos(lines)
assert.equal(map.get(2), 1)
assert.equal(map.get(3), 2)
assert.equal(map.get(4), 3)
assert.equal(map.size, 3)
assert.equal(findConfirmableLineIndex(lines, 'r3'), 4)
assert.equal(findConfirmableLineIndex(lines, 'missing'), -1)

// Agent loop drifted to 7 while confirmable card is suggestion step 3 → UI must show 3.
assert.deepEqual(
  alignPlanStepDisplay({ runStep: 7, runMax: 10, suggestionStep: 3, suggestionCount: 3 }),
  { step: 3, max: 10, source: 'suggestion' }
)
// No pending card yet → fall back to run progress.
assert.deepEqual(
  alignPlanStepDisplay({ runStep: 2, runMax: 10, suggestionStep: null, suggestionCount: 0 }),
  { step: 2, max: 10, source: 'run' }
)
assert.deepEqual(
  alignPlanStepDisplay({ runStep: null, runMax: null, suggestionStep: null, suggestionCount: 0 }),
  { step: 1, max: 1, source: 'fallback' }
)
// suggestionCount can raise max above runMax when plan grew in the UI.
assert.deepEqual(
  alignPlanStepDisplay({ runStep: 1, runMax: 2, suggestionStep: 4, suggestionCount: 4 }),
  { step: 4, max: 4, source: 'suggestion' }
)

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('buildSuggestionStepNos(lines)'))
assert.ok(panel.includes('alignPlanStepDisplay('))
assert.ok(panel.includes('findConfirmableLineIndex(lines, pendingConfirm?.requestId)'))
assert.ok(panel.includes('data-aligned-step={alignedPlan.step}'))
assert.ok(panel.includes('data-step-source={alignedPlan.source}'))
assert.ok(panel.includes('{tg(\'ai.runSteps\', { n: alignedPlan.step, max: alignedPlan.max })}'))
assert.equal(panel.includes('runProgress?.step ?? suggestionStepNo.get(i)'), false, 'badge must not prefer raw runProgress over suggestion step')
assert.ok(panel.includes('suggestionStepNo.get(i) ?? alignedPlan.step'))

const shared = norm('src/shared/ai-suggestion-steps.ts')
assert.ok(shared.includes("action === 'command' || action === 'tool_call'"))
assert.ok(shared.includes('export function alignPlanStepDisplay'))

console.log('test-r18-plan-step-align: ok')
