/** Polish-24 / M-polish-9: shared ui/Button + PanelHeader. Package 0.6.47. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import { ICON_PATHS } from '../src/shared/icon-registry'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.57')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-24.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

assert.ok(existsSync('src/renderer/src/components/ui/Button.tsx'))
assert.ok(existsSync('src/renderer/src/components/ui/PanelHeader.tsx'))
assert.ok(existsSync('src/renderer/src/components/ui/index.ts'))
assert.ok(existsSync('docs/ui-primitives.md'))

const btn = readFileSync('src/renderer/src/components/ui/Button.tsx', 'utf8')
assert.ok(btn.includes("variant === 'primary'"))
assert.ok(btn.includes("variant === 'ghost'"))
assert.ok(btn.includes("variant === 'icon'"))
assert.ok(btn.includes('CHROME_ICON_SIZE'))

const head = readFileSync('src/renderer/src/components/ui/PanelHeader.tsx', 'utf8')
assert.ok(head.includes('workspace-panel-toolbar'))
assert.ok(head.includes('ui-panel-header'))

const index = readFileSync('src/renderer/src/components/ui/index.ts', 'utf8')
assert.ok(/prefer/i.test(index))
assert.ok(index.includes('EmptyState'))

assert.ok(ICON_PATHS.x)

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(styles.includes('.ui-btn--icon'))
assert.doesNotMatch(styles, /\.ui-btn--icon\s*\{[^}]*#[0-9a-fA-F]{3,8}/)

const ops = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
assert.ok(ops.includes('PanelHeader'))
assert.ok(ops.includes("variant=\"primary\""))

const modal = readFileSync('src/renderer/src/components/Modal.tsx', 'utf8')
assert.ok(modal.includes("icon=\"x\""))

const update = readFileSync('src/renderer/src/components/UpdateModal.tsx', 'utf8')
assert.ok(update.includes("variant=\"ghost\""))
assert.ok(update.includes("variant=\"primary\""))

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
assert.ok(changelogFor('0.6.47').length >= 1)

console.log('test-polish-24 ok')