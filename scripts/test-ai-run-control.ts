import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveAiMaxSteps, normalizeAiMaxSteps, writeUnlessStopped, DEFAULT_AI_MAX_STEPS, MAX_AI_MAX_STEPS } from '../src/shared/ai-run-control'

// step limit: setting > env > default, clamped
assert.equal(resolveAiMaxSteps(undefined, undefined), DEFAULT_AI_MAX_STEPS)
assert.equal(resolveAiMaxSteps(undefined, '4'), 4)
assert.equal(resolveAiMaxSteps(15, '4'), 15)
assert.equal(resolveAiMaxSteps(999), MAX_AI_MAX_STEPS)
assert.equal(resolveAiMaxSteps(0, 'abc'), DEFAULT_AI_MAX_STEPS)
assert.equal(resolveAiMaxSteps('7.9'), 7)
assert.equal(normalizeAiMaxSteps(-1), null)
assert.equal(normalizeAiMaxSteps(12), 12)

// stop guard: after Stop nothing is written
{
  const writes: string[] = []
  const state = { userAborted: false }
  const ac = new AbortController()
  const write = (cmd: string) => () => (writes.push(cmd), true)
  assert.equal(writeUnlessStopped(state, ac.signal, write('ls')), true)
  state.userAborted = true
  assert.equal(writeUnlessStopped(state, ac.signal, write('rm -rf /tmp/x')), null)
  assert.deepEqual(writes, ['ls'])
  const s2 = { userAborted: false }
  ac.abort()
  assert.equal(writeUnlessStopped(s2, ac.signal, write('reboot')), null)
  assert.deepEqual(writes, ['ls'])
}

// main process: the only terminal write in the AI loop goes through the stop guard
const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
const directWrites = agent.match(/ssh\.write\(/g) || []
assert.equal(directWrites.length, 1, 'one ssh.write call site')
assert.ok(/writeUnlessStopped\(runCtx, ac\.signal, \(\) => ssh\.write\(/.test(agent), 'ssh.write wrapped by writeUnlessStopped')
assert.ok(agent.includes('resolveAiMaxSteps(settings.aiMaxSteps, process.env.AISS_MAX_POLLS)'))
assert.ok(agent.includes("type: 'progress', step, maxSteps"))
assert.ok(agent.includes('已达到步数上限'))
// abortAiChat flags the run before any later write can happen
assert.ok(/cur\.ctx\.userAborted = true\s*\n\s*cur\.ac\.abort\(\)/.test(agent))

// renderer: step counter, stop shortcut, setting
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes('data-testid="ai-run-steps"'))
assert.ok(panel.includes("e.key !== 'Backspace' || !e.shiftKey"))
const settings = readFileSync('src/renderer/src/components/SafetyTierSettings.tsx', 'utf8')
assert.ok(settings.includes('data-testid="ai-max-steps"') && settings.includes('aiMaxSteps: next'))
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['ai.runSteps', 'ai.runStepsTip', 'policy.maxSteps', 'policy.maxStepsHint']) {
  assert.equal((i18n.match(new RegExp(`'${k.replace('.', '\\.')}':`, 'g')) || []).length, 2, `${k} zh+en`)
}
console.log('test-ai-run-control: OK')
