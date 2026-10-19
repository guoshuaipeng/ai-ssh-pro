/** Light/dark theme toggle discoverability. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KEYMAP, keysFor } from '../src/shared/keymap'
import { SHARED_MENUS } from '../src/shared/menus'
import { isLightUiTheme, toggleLightDarkTheme, applyUiTheme, UI_THEME_DEFAULT } from '../src/renderer/src/lib/ui-themes'
import { translate } from '../src/renderer/src/lib/i18n'

assert.equal(keysFor('toggleUiTheme'), 'Ctrl+Alt+D')
assert.ok(KEYMAP.some((e) => e.id === 'toggleUiTheme' && e.keys === 'Ctrl+Alt+D'))
assert.ok(JSON.stringify(SHARED_MENUS).includes('toggleUiTheme'))

const modal = readFileSync('src/renderer/src/components/UiThemeModal.tsx', 'utf8')
assert.match(modal, /ui-theme-toggle-ld/)
assert.match(modal, /toggleLightDarkTheme/)
assert.match(modal, /theme\.shortcutHint/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'toggleUiTheme'/)

assert.equal(translate('zh-CN', 'theme.toLight').length > 0, true)
assert.equal(translate('en', 'theme.toDark').length > 0, true)

// toggle logic (no DOM localStorage — apply still sets document if present)
applyUiTheme('github-dark')
assert.equal(isLightUiTheme('github-dark'), false)
assert.equal(isLightUiTheme('light'), true)
assert.equal(isLightUiTheme('sand'), true)
const next = toggleLightDarkTheme('github-dark')
assert.equal(next, 'light')
const back = toggleLightDarkTheme('light')
assert.equal(back, 'github-dark')
assert.equal(UI_THEME_DEFAULT, 'github-dark')

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-theme-toggle/)

assert.match(readFileSync('src/renderer/src/lib/terminal-themes.ts', 'utf8'), /term\.theme\.githubDark/)
assert.ok(translate('zh-CN', 'term.theme.githubLight').length > 0)
assert.ok(translate('en', 'term.theme.solarizedLight').length > 0)

console.log('test-theme-toggle: ok')
