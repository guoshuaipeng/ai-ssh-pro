/** R15: multi-step suggestion batch copy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectSuggestionCommands, formatSuggestionCommandsForCopy } from '../src/shared/ai-suggestion-steps'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.deepEqual(collectSuggestionCommands([]), [])
assert.deepEqual(
  collectSuggestionCommands([
    { role: 'user', structured: null },
    { role: 'assistant', structured: { action: 'end' } },
    { role: 'assistant', structured: { action: 'tool_call', command: 'should-skip' } },
    { role: 'assistant', structured: { action: 'command', command: '  df -h  ' } },
    { role: 'assistant', structured: { action: 'command', command: 'free -m' } },
    { role: 'assistant', structured: { action: 'command', command: '   ' } }
  ]),
  ['df -h', 'free -m']
)
assert.equal(formatSuggestionCommandsForCopy(['only-one']), '')
assert.equal(formatSuggestionCommandsForCopy(['df -h', 'free -m']), 'df -h\nfree -m')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("from '@shared/ai-suggestion-steps'"))
assert.ok(panel.includes('collectSuggestionCommands(lines)'))
assert.ok(panel.includes('formatSuggestionCommandsForCopy(suggestionCommands)'))
assert.ok(panel.includes('data-testid="ai-batch-copy-bar"'))
assert.ok(panel.includes('data-testid="ai-batch-copy"'))
assert.ok(panel.includes('data-testid="ai-batch-copy-count"'))
assert.ok(panel.includes("tg('ai.copyAllSteps')"))
assert.ok(panel.includes('onClick={() => copyText(batchCopyText)}'))
assert.ok(panel.indexOf('data-testid="ai-batch-copy-bar"') < panel.indexOf('<div ref={tailRef} />'))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R15 Round15: multi-step batch copy bar'))
assert.ok(css.includes('.ai-panel .ai-batch-copy-bar'))
assert.ok(css.includes('.ai-panel .ai-btn-batch-copy'))
const start = css.indexOf('R15 Round15: multi-step batch copy bar')
const end = css.indexOf('R15 Round15: composer policy menu narrow', start)
assert.ok(start >= 0 && end > start)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(css.slice(start, end)), false, 'no token fallbacks')

assert.equal(translate('zh-CN', 'ai.copyAllSteps'), '复制全部步骤')
assert.equal(translate('zh-CN', 'ai.stepsCount', { n: 3 }), '共 3 步命令')
assert.equal(translate('en', 'ai.copyAllSteps'), 'Copy all steps')
assert.equal(translate('en', 'ai.stepsCount', { n: 3 }), '3 command steps')
assert.ok(norm('src/renderer/src/lib/i18n.tsx').includes("'ai.copyAllStepsTip'"))

console.log('test-r15-batch-copy-steps: ok')
