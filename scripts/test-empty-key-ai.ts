/** Empty-state keyboard tip: Ctrl+Shift+A open AI. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { keysFor } from '../src/shared/keymap'

assert.equal(keysFor('focusAiPanel'), 'Ctrl+Shift+A')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /data-testid="term-empty-key-ai"/)
assert.match(app, /keysFor\('focusAiPanel'\)/)
assert.match(app, /ux08\.keyAi/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'ux08\.keyAi':\s*"打开 AI"/)
assert.match(i18n, /'ux08\.keyAi':\s*"Open AI"/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-empty-key-ai/)
console.log('test-empty-key-ai ok')
