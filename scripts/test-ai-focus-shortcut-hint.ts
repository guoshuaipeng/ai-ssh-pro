/** AI panel header shows focus-AI shortcut tip. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { keysFor } from '../src/shared/keymap'

assert.equal(keysFor('focusAiPanel'), 'Ctrl+Shift+A')

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /ai-focus-shortcut-hint/)
assert.match(panel, /keysFor\('focusAiPanel'\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'ai.focusShortcutTip'"))
assert.ok((i18n.match(/'ai\.focusShortcutTip'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.50')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-focus-shortcut-hint/)
console.log('test-ai-focus-shortcut-hint ok')
