/** Polish-25 / M-polish-10: call sites on ui/Button + PanelHeader; dead chrome CSS removed. Package 0.6.48. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.58')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-25.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const dir = 'src/renderer/src/components/'
const read = (f: string) => readFileSync(dir + f, 'utf8')

// Workspace panel toolbars go through PanelHeader.
for (const f of ['AlertWorkbenchTab.tsx', 'HostInventoryModal.tsx', 'AuditLogPanel.tsx', 'SettingsPanel.tsx', 'DockerPanel.tsx', 'SnippetsPanel.tsx', 'PlaybookTabs.tsx', 'RecordingsTab.tsx']) {
  const s = read(f)
  assert.ok(s.includes('<PanelHeader'), `${f} uses PanelHeader`)
  assert.ok(!s.includes('<div className="workspace-panel-toolbar">'), `${f} has no hand-rolled toolbar`)
}
const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'))
const raw = files.reduce((n, f) => n + (read(f).match(/<div className="workspace-panel-toolbar/g) ?? []).length, 0)
assert.ok(raw <= 6, `hand-rolled toolbars left: ${raw}`)

// Primary/secondary chrome buttons go through ui/Button.
for (const f of ['ServerToolsModal.tsx', 'ResourceMonitorModal.tsx', 'HostInventoryModal.tsx', 'KnownHostsModal.tsx', 'FolderSyncModal.tsx', 'BatchExecuteModal.tsx', 'WhatsNewModal.tsx']) {
  const s = read(f)
  assert.ok(/<Button variant="(primary|secondary|ghost)"/.test(s), `${f} uses Button`)
  assert.ok(!/<button[^>]*className="(primary|secondary|ghost)"/.test(s), `${f} has no raw primary/secondary`)
}

// Behaviour hooks kept.
const bench = read('AlertWorkbenchTab.tsx')
assert.ok(bench.includes('className="l2-head"') && bench.includes('data-testid="l2d-open"') && bench.includes('data-testid="l2-prefs"'))
assert.ok(bench.includes('aria-expanded={more}'))
const inv = read('HostInventoryModal.tsx')
assert.ok(inv.includes('!focused ? ('))

// Dead chrome CSS removed.
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
for (const dead of ['.layout-toggle-ai-icon', '.about-modal', '.conn-layout', '.session-sidebar-toolbar', '.app-toolbar-hint', '.wn-kbd']) {
  assert.ok(!new RegExp(dead.replace('.', '\\.') + '(?![\\w-])').test(styles), `${dead} removed`)
}
assert.ok(styles.includes('.ui-btn--icon'))

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.48'), changelog.indexOf('## v0.6.47'))
assert.ok(note.includes('M-polish-10'))
assert.ok(changelogFor('0.6.48').length >= 1)

console.log('test-polish-25 ok')