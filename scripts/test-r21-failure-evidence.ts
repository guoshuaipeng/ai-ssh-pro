/** R21: failure evidence pin on reply card (align Core-A S27). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildFailureEvidenceText,
  buildFailureEvidenceView,
  clipFailureEvidence,
  normalizeExecRecord,
  FAILURE_EVIDENCE_MAX_CHARS
} from '../src/shared/ai-exec-replay'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const text = buildFailureEvidenceText({
  command: 'echo S27_FAIL_CMD',
  exitCode: 1,
  stderr: 'S27_STDERR_EVIDENCE',
  timedOut: true,
  timeoutMark: 'S27_TIMEOUT_STUB'
})
assert.ok(text.includes('command=echo S27_FAIL_CMD'))
assert.ok(text.includes('exit=1'))
assert.ok(text.includes('S27_STDERR_EVIDENCE'))
assert.ok(text.includes('S27_TIMEOUT_STUB'))

assert.equal(clipFailureEvidence('abc'), 'abc')
assert.ok(clipFailureEvidence('x'.repeat(FAILURE_EVIDENCE_MAX_CHARS + 10)).endsWith('…'))

assert.equal(buildFailureEvidenceView({ status: 'ok', exitCode: 0 }, 'true'), null)
assert.equal(buildFailureEvidenceView({ status: 'failed' }, ''), null)

const view = buildFailureEvidenceView(
  {
    status: 'failed',
    exitCode: 1,
    failureKind: 'nonzero',
    evidence: text,
    retryBudget: { count: 1, cap: 2, exhausted: false }
  },
  'echo S27_FAIL_CMD'
)
assert.ok(view)
assert.equal(view!.kind, 'nonzero')
assert.equal(view!.exhausted, false)
assert.ok(view!.evidence.includes('S27_STDERR_EVIDENCE'))

const exhausted = buildFailureEvidenceView({
  status: 'failed',
  evidence: 'command=x\nexit=1',
  retryBudget: { count: 2, cap: 2, exhausted: true }
})
assert.equal(exhausted!.exhausted, true)

const normalized = normalizeExecRecord({
  status: 'failed',
  at: 42,
  exitCode: 1,
  failureKind: 'timeout',
  evidence: 'command=x\ntimeout',
  retryBudget: { count: 2, cap: 2, exhausted: true },
  junk: 1
})
assert.deepEqual(normalized, {
  status: 'failed',
  at: 42,
  exitCode: 1,
  failureKind: 'timeout',
  evidence: 'command=x\ntimeout',
  retryBudget: { count: 2, cap: 2, exhausted: true }
})

assert.equal(translate('zh-CN', 'fail.title'), '命令失败')
assert.equal(translate('zh-CN', 'fail.retry'), '带证据重试')
assert.ok(translate('zh-CN', 'fail.noAutoRetry').includes('不会自动重跑'))
assert.ok(translate('zh-CN', 'fail.retryAsk', { command: 'x', evidence: 'e' }).includes('禁止自动重跑'))
assert.equal(translate('en', 'fail.title'), 'Command failed')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('retryWithFailureEvidence'))
assert.ok(panel.includes('onRetryWithEvidence={retryWithFailureEvidence}'))
assert.ok(panel.includes("detail?.op === 'aiFailureEvidence'"))
assert.ok(panel.includes("tg('fail.retryAsk'"))
assert.ok(!/confirmStep\([^)]*true[^)]*\).*fail\.retry|fail\.retry[\s\S]{0,80}confirmStep/.test(panel), 'retry must not confirmStep')

const replay = norm('src/renderer/src/components/ExecReplay.tsx')
assert.ok(replay.includes('data-testid="ai-failure-evidence"'))
assert.ok(replay.includes('data-testid="ai-failure-retry"'))
assert.ok(replay.includes('buildFailureEvidenceView'))
assert.ok(replay.includes('onRetryWithEvidence'))
assert.ok(!/confirmStep\s*\(/.test(replay), 'ExecReplay must not call confirmStep')

const agent = norm('src/main/ai-interactive-agent.ts')
assert.ok(agent.includes('failureKind: failure.kind'))
assert.ok(agent.includes('evidence: failure.evidence'))
assert.ok(agent.includes('retryBudget:'))
assert.ok(agent.indexOf('classifyCommandFailure') < agent.indexOf('failureKind: failure.kind'), 'classify before emit fields')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R21 Round21: pinned failure evidence'))
assert.ok(css.includes('.ai-panel .ai-failure-evidence'))
const start = css.indexOf('R21 Round21: pinned failure evidence')
const end = css.indexOf('/* R20 Round20:', start)
const block = css.slice(start, end > start ? end : start + 2500)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R21 failure CSS')

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiFailureEvidence'))

console.log('test-r21-failure-evidence: ok')
