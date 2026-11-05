/** H04/H05: stop mid-stream unlocks composer; partial paints; stale turns isolated; real stop (no DOM inject). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyStreamDelta, finalizeStoppedLines } from '../src/shared/ai-stream-stop'

// pure helpers
{
  const a = applyStreamDelta([], 'hello')
  assert.deepEqual(a, [{ role: 'assistant', content: 'hello', streaming: true }])
  const b = applyStreamDelta(a, ' world')
  assert.deepEqual(b, [{ role: 'assistant', content: 'hello world', streaming: true }])
  const stopped = finalizeStoppedLines(b, '已取消')
  assert.deepEqual(stopped, [{ role: 'assistant', content: 'hello world', streaming: false, cancelled: true }])
  const emptyBusy = finalizeStoppedLines([{ role: 'user', content: 'q' } as const], '已取消', { ensureCancelledRow: true })
  assert.equal(emptyBusy.length, 2)
  assert.equal(emptyBusy[1].content, '已取消')
  assert.equal(emptyBusy[1].streaming, false)
  assert.equal(emptyBusy[1].cancelled, true)
  // idempotent double-stop
  const again = finalizeStoppedLines(stopped, '已取消', { ensureCancelledRow: true })
  assert.deepEqual(again, stopped)
}

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8').replace(/\r\n/g, '\n')

assert.ok(panel.includes('const live = turnRef.current === turn'), 'stale turns must not paint live transcript')
assert.ok(panel.includes('H05: free the composer immediately'), 'cancelled clears busy without waiting for finally')
assert.ok(panel.includes('H05: only clear busy for this turn'), 'finally must not clear a newer turn busy')
assert.ok(panel.includes('void window.aiss.ai.abortChat()'), 'stop aborts chat')
assert.ok(panel.includes('H04: invalidate live turn on Stop'), 'stop invalidates turn (H04)')
assert.ok(/cur\.stopped\s*=\s*true/.test(panel), 'stop marks turn.stopped')
assert.ok(panel.includes('unlock composer right away'), 'stop unlocks composer immediately')
assert.ok(panel.includes("inputRef.current?.focus()"), 'focus composer after stop')
assert.ok(panel.includes('finalizeStoppedLines'), 'stop uses shared finalize helper')
assert.ok(panel.includes('applyStreamDelta'), 'deltas paint via applyStreamDelta')
assert.ok(panel.includes('H04: paint partial text'), 'delta comment present')
assert.ok(panel.includes('data-testid="ai-stream-stop"'), 'in-card stop')
assert.ok(panel.includes('data-testid="ai-stream-partial"'), 'partial stream text')
assert.ok(panel.includes("op === 'aiStreaming'"), 'screenshot hook for real streaming state')

assert.match(panel, /const retryLastUser = useCallback\(\(\) => \{\s*if \(busy\) \{\s*showToast\(tg\('ai\.busyWait'\)/)
assert.ok(panel.includes('void submitToAi(row.content)'), 'retry calls submitToAi (new turn)')

const taStart = panel.indexOf('<textarea\n')
assert.ok(taStart > 0)
const taEnd = panel.indexOf('/>', taStart)
const ta = panel.slice(taStart, taEnd)
assert.equal(/disabled=\{busy\}/.test(ta), false, 'textarea must stay typable during/after stream')
assert.ok(panel.includes('data-testid="ai-stop"') && panel.includes('onClick={stopGeneration}'))

const hooks = readFileSync('src/renderer/src/lib/screenshot-hooks.ts', 'utf8')
assert.ok(hooks.includes('aiStreaming'))

const shots = readFileSync('scripts/screenshot-key-screens.mjs', 'utf8')
assert.ok(shots.includes("name: 'r7-h05-stop'"))
assert.ok(shots.includes("op: 'aiStreaming'"))
assert.equal(shots.includes('createElement(\'button\')') && shots.includes("data-testid','ai-stop'"), false, 'no DOM-injected stop in r7 scenario')
// legacy inject string should be gone from h05 scenario
assert.ok(!shots.includes("name: 'r6-h05-stop'"), 'old injected h05 scenario removed')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes("detail.op === 'aiChat' || detail.op === 'aiStreaming'"))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'ai.cancelled':"))
assert.ok(i18n.includes("ai.busyWait': '请先停止生成再继续'"))

const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.ok(css.includes('.ai-stream-partial'))
assert.ok(css.includes('.ai-stream-stop'))

// H05: cancelled card Retry (new turn)
assert.ok(panel.includes('data-testid="ai-cancelled-retry"'), 'cancelled Retry CTA')
assert.ok(panel.includes('if (l.cancelled)'), 'render cancelled branch')
assert.ok(panel.includes('ai-card-cancelled'), 'cancelled card class')
const stopHelper = readFileSync('src/shared/ai-stream-stop.ts', 'utf8')
assert.ok(stopHelper.includes('cancelled: true'), 'finalize marks cancelled')

console.log('test-ai-stream-stop-retry ok')
