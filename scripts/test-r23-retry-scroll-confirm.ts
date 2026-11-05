/** R23 polish: after 「带证据重试」, auto-scroll to the new confirm card. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('function focusAiPendingAfterFailure'), 'shared focus helper')
assert.ok(panel.includes('scrollConfirmAfterEvidenceRetryRef'), 'one-shot ref')
assert.ok(panel.includes('scrollConfirmAfterEvidenceRetryRef.current = true'), 'arm before submit')
assert.ok(panel.includes("data-after-evidence-retry"), 'dock mark for auto-scroll')
assert.ok(panel.includes('focusAiPendingAfterFailure(id)'), 'effect calls helper')
assert.ok(panel.includes('focusAiPendingAfterFailure(pendingConfirm?.requestId)'), 'next-confirm reuses helper')
assert.ok(panel.includes('window.setTimeout(run, 180)'), 'delayed pass beats tail scroll')

// Must not arm on exhausted path (composer draft only)
const retryFn = panel.slice(
  panel.indexOf('const retryWithFailureEvidence'),
  panel.indexOf('const retryLastUser')
)
assert.ok(retryFn.includes("tg('fail.exhaustedAsk'"))
const exhaustedIdx = retryFn.indexOf("tg('fail.exhaustedAsk'")
const armIdx = retryFn.indexOf('scrollConfirmAfterEvidenceRetryRef.current = true')
assert.ok(armIdx > exhaustedIdx, 'arm only on non-exhausted path after exhausted branch')
assert.ok(!/confirmStep\([^)]*true/.test(retryFn), 'retry must not confirmStep')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes("data-after-evidence-retry='1'") || css.includes('data-after-evidence-retry'))
const start = css.indexOf('R23 Round23 polish: confirm dock mark')
assert.ok(start >= 0)
const end = css.indexOf('/* R23 Round23: one calm failure story', start)
const block = css.slice(start, end > start ? end : start + 800)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks')

console.log('test-r23-retry-scroll-confirm: ok')
