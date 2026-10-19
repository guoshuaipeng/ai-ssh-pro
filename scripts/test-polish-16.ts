/** Polish-16 / M-polish-3: status bar, menus, sidebar tree, light press. Package tracks current soft-start. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import {
  CHROME_ICON_SIZE,
  CHROME_ICON_STROKE,
  STATUS_ICON_SIZE,
  TREE_CHEVRON_SIZE
} from '../src/renderer/src/components/emptyIcons'
import { statusSlotIconName } from '../src/renderer/src/lib/status-icons'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.57')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-16.ts'), true)

assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(STATUS_ICON_SIZE, CHROME_ICON_SIZE)
assert.equal(TREE_CHEVRON_SIZE, 12)
assert.equal(CHROME_ICON_STROKE, 1.5)

assert.equal(statusSlotIconName({ id: 'broadcast' }), 'arrow-left-right')
assert.equal(statusSlotIconName({ id: 'record' }), 'activity')
assert.equal(statusSlotIconName({ id: 'sync', phase: 'synced' }), 'check')
assert.equal(statusSlotIconName({ id: 'sync', phase: 'syncing' }), 'refresh-cw')
assert.equal(statusSlotIconName({ id: 'sync', phase: 'conflict' }), 'triangle-alert')
assert.equal(statusSlotIconName({ id: 'disconnect' }), null)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('statusSlotIconName'))
assert.ok(app.includes('STATUS_ICON_SIZE'))
assert.ok(app.includes('TREE_CHEVRON_SIZE'))

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(css.includes('--duration-press: 90ms'))
assert.match(css, /\.statusbar-glyph\s*\{[^}]*width:\s*var\(--icon-size-chrome\)/)
assert.match(css, /\.session-folder-chevron\s*\{[^}]*inline-flex/)
assert.match(css, /\.session-host-chevron[\s\S]*?min-height:\s*28px/)
assert.match(css, /\.titlebar-icon-btn:active:not\(:disabled\)[\s\S]*?scale\(0\.96\)/)
assert.match(css, /\.titlebar-menu-check\s*\{[^}]*inline-flex/)

const features = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(features, /\.ctx-icon\s*\{[^}]*--icon-size-chrome/)
assert.match(features, /\.ctx-sub-arrow\s*\{[^}]*inline-flex/)

const ctx = readFileSync('src/renderer/src/components/ContextMenu.tsx', 'utf8')
assert.ok(ctx.includes('TREE_CHEVRON_SIZE'))
assert.ok(ctx.includes('ReactNode'))

const menus = readFileSync('src/renderer/src/components/TitlebarMenus.tsx', 'utf8')
assert.ok(menus.includes('CHROME_ICON_SIZE'))

const docker = readFileSync('src/renderer/src/components/SessionDockerBranch.tsx', 'utf8')
assert.ok(docker.includes('TREE_CHEVRON_SIZE'))

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.39'), changelog.indexOf('## v0.6.38'))
assert.ok(note.includes('M-polish-3') || note.includes('质感专项'))
assert.ok(changelogFor('0.6.39').length >= 2)
assert.ok(changelogFor('0.6.38').length >= 2)

console.log('test-polish-16 ok')
