/** Per-snippet hotkeys + light terminal theme pairing. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  eventToHotkeyString,
  matchSnippetHotkey,
  normalizeSnippetHotkey,
  snippetHotkeyConflictsKeymap,
  snippetHotkeyConflictsPeer,
  suggestSnippetHotkey
} from '../src/shared/snippet-hotkey'
import { suggestedTerminalTheme } from '../src/renderer/src/lib/ui-themes'
import { getXtermTheme, TERMINAL_THEME_OPTIONS } from '../src/renderer/src/lib/terminal-themes'
import { translate } from '../src/renderer/src/lib/i18n'

assert.equal(normalizeSnippetHotkey('ctrl+alt+2'), 'Ctrl+Alt+2')
assert.equal(normalizeSnippetHotkey('Ctrl+Shift+q'), 'Ctrl+Shift+Q')
assert.equal(normalizeSnippetHotkey('Ctrl+A'), null) // need Alt or Shift
assert.equal(normalizeSnippetHotkey('Alt+2'), null) // need Ctrl

assert.equal(snippetHotkeyConflictsKeymap('Ctrl+Alt+1'), 'toggleSidebar')
assert.equal(snippetHotkeyConflictsKeymap('Ctrl+Alt+D'), 'toggleUiTheme')
assert.equal(snippetHotkeyConflictsKeymap('Ctrl+Alt+2'), null)

const peer = snippetHotkeyConflictsPeer(
  'Ctrl+Alt+3',
  [
    { id: 'a', title: 'Alpha', hotkey: 'Ctrl+Alt+3' },
    { id: 'b', title: 'Beta' }
  ],
  'b'
)
assert.equal(peer?.title, 'Alpha')

const suggested = suggestSnippetHotkey([{ id: 'x', hotkey: 'Ctrl+Alt+2' }])
assert.ok(suggested)
assert.notEqual(suggested, 'Ctrl+Alt+1') // reserved
assert.notEqual(suggested, 'Ctrl+Alt+2') // taken

const fired = matchSnippetHotkey(
  { key: '3', code: 'Digit3', ctrlKey: true, shiftKey: false, altKey: true, metaKey: false },
  [{ id: 'a', title: 'Alpha', body: 'uptime', hotkey: 'Ctrl+Alt+3' }]
)
assert.equal(fired?.body, 'uptime')

assert.equal(
  eventToHotkeyString({ key: '2', code: 'Digit2', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }),
  'Ctrl+Alt+2'
)

assert.equal(suggestedTerminalTheme('light'), 'github-light')
assert.equal(suggestedTerminalTheme('sand'), 'solarized-light')
assert.ok(TERMINAL_THEME_OPTIONS.some((t) => t.id === 'github-light'))
assert.ok(TERMINAL_THEME_OPTIONS.some((t) => t.id === 'solarized-light'))
assert.equal(getXtermTheme('github-light').background, '#ffffff')
assert.equal(getXtermTheme('solarized-light').background, '#fdf6e3')

const panel = readFileSync('src/renderer/src/components/SnippetsPanel.tsx', 'utf8')
assert.match(panel, /snip-hotkey/)
assert.match(panel, /notifySnippetsChanged/)
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /matchSnippetHotkey/)
assert.match(app, /SNIPPET_HOTKEY_EVENT/)

assert.ok(translate('zh-CN', 'snip.fieldHotkey').length > 0)
assert.ok(translate('en', 'snip.hotkeyTakenApp').includes('{action}') || translate('en', 'snip.hotkeyTakenApp').length > 0)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-snippet-hotkey/)

console.log('test-snippet-hotkey: ok')
