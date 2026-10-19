/** retryLastUser toasts when no prior user ask. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
const start = ai.indexOf('const retryLastUser')
assert.ok(start >= 0)
const chunk = ai.slice(start, start + 500)
assert.match(chunk, /showToast\(tg\('ai\.noLastAsk'\), \{ kind: 'error' \}\)/)
assert.match(chunk, /submitToAi\(row\.content\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-retry-last-empty-toast/)
console.log('test-retry-last-empty-toast ok')
