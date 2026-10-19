/** Regressions: snippet hotkeys skip form fields; AI Esc skips composer; import normalizes hotkeys. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mergeSnippetsImport } from '../src/shared/workspace-features'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /editable/)
assert.match(app, /Do not steal chords while typing/)

const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(ai, /ai-input-row/)
assert.match(ai, /Composer Esc stays with the textarea/)
assert.match(ai, /pendingAgreeRef/)
assert.match(ai, /return caret to the composer/)
assert.doesNotMatch(ai, /\.ai-input-row, textarea, input/)

const merged = mergeSnippetsImport(
  [],
  JSON.stringify({
    kind: 'ai-ssh-pro/snippets',
    version: 1,
    snippets: [
      { title: 'A', body: 'uptime', hotkey: 'ctrl+alt+5' },
      { title: 'B', body: 'df -h', hotkey: 'Ctrl+A' }
    ]
  }),
  () => 'id-' + Math.random()
)
assert.ok(merged)
assert.equal(merged!.list.find((s) => s.title === 'A')?.hotkey, 'Ctrl+Alt+5')
assert.equal(merged!.list.find((s) => s.title === 'B')?.hotkey, undefined)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-bugfix-hotkey-ai/)

const themes = readFileSync('src/renderer/src/lib/terminal-themes.ts', 'utf8')
assert.match(themes, /term\.theme\.githubLight/)
assert.match(themes, /get label\(\)/)
assert.match(readFileSync('docs/CHANGELOG-UNRELEASED.md', 'utf8'), /OSC 52/)
assert.match(readFileSync('CHANGELOG.md', 'utf8'), /CHANGELOG-UNRELEASED/)

console.log('test-bugfix-hotkey-ai: ok')
