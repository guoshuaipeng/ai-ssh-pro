import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  resolveAiMaxSteps,
  normalizeAiMaxSteps,
  resolveAiAutoStreak,
  normalizeAiAutoStreak,
  shouldForceConfirmAfterAutoStreak,
  bumpAutoWriteStreak,
  writeUnlessStopped,
  DEFAULT_AI_MAX_STEPS,
  DEFAULT_AI_AUTO_STREAK,
  MAX_AI_MAX_STEPS,
  MAX_AI_AUTO_STREAK
} from '../src/shared/ai-run-control'

// step limit: setting > env > default, clamped
assert.equal(resolveAiMaxSteps(undefined, undefined), DEFAULT_AI_MAX_STEPS)
assert.equal(resolveAiMaxSteps(undefined, '4'), 4)
assert.equal(resolveAiMaxSteps(15, '4'), 15)
assert.equal(resolveAiMaxSteps(999), MAX_AI_MAX_STEPS)
assert.equal(resolveAiMaxSteps(0, 'abc'), DEFAULT_AI_MAX_STEPS)
assert.equal(resolveAiMaxSteps('7.9'), 7)
assert.equal(normalizeAiMaxSteps(-1), null)
assert.equal(normalizeAiMaxSteps(12), 12)

// consecutive auto streak
assert.equal(resolveAiAutoStreak(undefined), DEFAULT_AI_AUTO_STREAK)
assert.equal(resolveAiAutoStreak(3), 3)
assert.equal(resolveAiAutoStreak(999), MAX_AI_AUTO_STREAK)
assert.equal(normalizeAiAutoStreak(0), null)
assert.equal(normalizeAiAutoStreak(8), 8)
assert.equal(shouldForceConfirmAfterAutoStreak(0, 5), false)
assert.equal(shouldForceConfirmAfterAutoStreak(4, 5), false)
assert.equal(shouldForceConfirmAfterAutoStreak(5, 5), true)
assert.equal(shouldForceConfirmAfterAutoStreak(6, 5), true)
assert.equal(bumpAutoWriteStreak(2, 'read'), 2)
assert.equal(bumpAutoWriteStreak(2, 'write'), 3)
assert.equal(bumpAutoWriteStreak(2, 'high'), 3)
assert.equal(bumpAutoWriteStreak(2, null), 2)

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
assert.ok(/writeUnlessStopped\(runCtx, ac\.signal, \(\) => \{[\s\S]{0,400}?ssh\.writeAiCommand\([\s\S]{0,200}?ssh\.write\(/.test(agent), 'ssh.write wrapped by writeUnlessStopped')
assert.ok(agent.includes('resolveAiMaxSteps(settings.aiMaxSteps, process.env.AISS_MAX_POLLS)'))
assert.ok(agent.includes('resolveAiAutoStreak(settings.aiAutoStreak)'))
assert.ok(agent.includes('shouldForceConfirmAfterAutoStreak'))
assert.ok(agent.includes('bumpAutoWriteStreak'))
assert.ok(agent.includes("type: 'progress'"))
assert.ok(agent.includes('已达到步数上限'))
assert.ok(agent.includes('已连续自动执行'))
assert.ok(agent.includes('resolveAiPolicy({') && agent.includes('bootProtection'), 'early policy seed for step-1 progress')
assert.ok(/cur\.ctx\.userAborted = true\s*\n\s*cur\.ac\.abort\(\)/.test(agent))

// renderer: step counter, streak chip, stop shortcut, setting
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes('data-testid="ai-run-steps"'))
assert.ok(panel.includes('data-testid="ai-run-streak"'))
assert.ok(panel.includes("e.key !== 'Backspace' || !e.shiftKey"))
const settings = readFileSync('src/renderer/src/components/SafetyTierSettings.tsx', 'utf8')
assert.ok(settings.includes('data-testid="ai-max-steps"') && settings.includes('aiMaxSteps: next'))
assert.ok(settings.includes('data-testid="ai-auto-streak"') && settings.includes('aiAutoStreak: next'))
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of [
  'ai.runSteps',
  'ai.runStepsTip',
  'ai.runStreak',
  'ai.runStreakTip',
  'ai.runStreakForced',
  'ai.planStepsTip',
  'ai.activePlanStep',
  'policy.maxSteps',
  'policy.maxStepsHint',
  'policy.autoStreak',
  'policy.autoStreakHint'
]) {
  assert.equal((i18n.match(new RegExp(`'${k.replace('.', '\\.')}':`, 'g')) || []).length, 2, `${k} zh+en`)
}
console.log('test-ai-run-control: OK')
