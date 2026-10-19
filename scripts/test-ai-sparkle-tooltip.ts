/** AI sparkle layout toggle tooltip shows Ctrl+Shift+A (focusAiPanel). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { keysFor } from '../src/shared/keymap'

assert.equal(keysFor('focusAiPanel'), 'Ctrl+Shift+A')

const tb = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.match(tb, /keysFor\('focusAiPanel'\)/)
assert.match(tb, /item\.kind === 'ai'/)
assert.match(tb, /layout-toggle-\$\{item\.kind\}/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-sparkle-tooltip/)
console.log('test-ai-sparkle-tooltip ok')
