/** AI … menu: explain last terminal error. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /data-testid="ai-explain-last-error"/)
assert.match(panel, /lastErrorFor/)
assert.match(panel, /requestAiExplain/)
assert.match(panel, /a1\.title/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'aiExplainError'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-explain-last-error-menu/)
console.log('test-ai-explain-last-error-menu ok')
