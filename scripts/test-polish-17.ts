/** Polish-17 / M-polish-4: dialog/tab icons + muted hierarchy. Shipped in 0.6.40; package tracks current. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import {
  CHROME_ICON_SIZE,
  CHROME_ICON_STROKE,
  TAB_ICON_SIZE
} from '../src/renderer/src/components/emptyIcons'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.49')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-17.ts'), true)

assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(TAB_ICON_SIZE, CHROME_ICON_SIZE)
assert.equal(TAB_ICON_SIZE, 16)
assert.equal(CHROME_ICON_STROKE, 1.5)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('TAB_ICON_SIZE'))
assert.match(app, /tabKindIcon\(t\.view\)\}\s+size=\{TAB_ICON_SIZE\}/)
assert.match(app, /name="pin"\s+size=\{TAB_ICON_SIZE\}/)

const settings = readFileSync('src/renderer/src/components/SettingsPanel.tsx', 'utf8')
assert.ok(settings.includes('EMPTY_ICON_SIZE_COMPACT'))
assert.ok(settings.includes('EMPTY_ICON_STROKE'))

const hostInv = readFileSync('src/renderer/src/components/HostInventoryModal.tsx', 'utf8')
assert.ok(hostInv.includes('CHROME_ICON_SIZE'))

const monitor = readFileSync('src/renderer/src/components/ResourceMonitorModal.tsx', 'utf8')
assert.ok(monitor.includes('CHROME_ICON_SIZE'))

const tools = readFileSync('src/renderer/src/components/ServerToolsModal.tsx', 'utf8')
assert.ok(tools.includes('CHROME_ICON_SIZE'))
assert.ok(tools.includes('EMPTY_ICON_SIZE_COMPACT'))

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(css.includes('--icon-size-tab: 16px'))
assert.ok(css.includes('--color-text-secondary: #b4bccf'))
assert.ok(css.includes('--muted: #8e97ab'))
assert.match(css, /\[data-ui-theme='light'\][\s\S]*?--color-text-secondary:\s*#57606a/)
assert.match(css, /\[data-ui-theme='sand'\][\s\S]*?--color-text-secondary:\s*#57534e/)
assert.doesNotMatch(css, /\[data-ui-theme='light'\][\s\S]{0,400}--color-text-secondary:\s*var\(--text\)/)
assert.match(css, /--color-border-muted:\s*color-mix/)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.49'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.40'), changelog.indexOf('## v0.6.39'))
assert.ok(note.includes('M-polish-4') || note.includes('质感专项'))
assert.ok(note.includes('muted') || note.includes('层级') || note.includes('secondary'))
assert.ok(changelogFor('0.6.40').length >= 2)
assert.ok(changelogFor('0.6.39').length >= 2)

console.log('test-polish-17 ok')
