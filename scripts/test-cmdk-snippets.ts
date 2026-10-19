/** Ctrl+K insert-snippet discoverability. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'
import { suggestedTerminalTheme } from '../src/renderer/src/lib/ui-themes'

const pal = readFileSync('src/renderer/src/components/CommandPalette.tsx', 'utf8')
assert.match(pal, /snippetBody/)
assert.match(pal, /dispatchInjectTerminal/)
assert.match(pal, /cmdp\.insertSnip/)
assert.match(pal, /BUILTIN_SNIPPETS/)
assert.match(pal, /activeSessionId/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /activeSessionId=\{activeSessionId\}/)

const snip = readFileSync('src/renderer/src/components/SnippetsPanel.tsx', 'utf8')
assert.match(snip, /snip\.cmdkHint/)

assert.ok(translate('zh-CN', 'cmdp.insertSnip').includes('{title}') || translate('zh-CN', 'cmdp.insertSnip').length > 0)
assert.ok(translate('zh-CN', 'snip.cmdkHint').length > 0)
assert.ok(translate('en', 'cmdp.snipHint').length > 0)

assert.equal(suggestedTerminalTheme('ocean'), 'solarized-dark')
assert.equal(suggestedTerminalTheme('forest'), 'monokai')
assert.equal(suggestedTerminalTheme('github-dark'), 'github-dark')
assert.equal(suggestedTerminalTheme('light'), 'github-light')
assert.equal(suggestedTerminalTheme('sand'), 'solarized-light')

const themeModal = readFileSync('src/renderer/src/components/UiThemeModal.tsx', 'utf8')
assert.match(themeModal, /suggestedTerminalTheme/)
assert.match(themeModal, /theme\.pairTerm/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-cmdk-snippets/)

console.log('test-cmdk-snippets: ok')
