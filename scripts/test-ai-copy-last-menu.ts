/** AI panel ⋯ menu: copy last reply button. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lastAssistantText } from '../src/shared/ai-last-reply'

assert.equal(lastAssistantText([{ role: 'assistant', content: ' hi ' }]), 'hi')

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /data-testid="ai-copy-last-reply"/)
assert.match(panel, /lastAssistantText\(lines\)/)
assert.match(panel, /ai\.copyLastReply/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'ai.copyLastReply'"))
assert.ok((i18n.match(/'ai\.copyLastReply'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-copy-last-menu/)
console.log('test-ai-copy-last-menu ok')
