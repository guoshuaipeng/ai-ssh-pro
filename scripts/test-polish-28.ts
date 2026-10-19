/** Polish-28 / M-polish-13: last hand-rolled toolbars on PanelHeader. Package 0.6.51. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.54')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-28.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const dir = 'src/renderer/src/components/'
const read = (f: string) => readFileSync(dir + f, 'utf8')

// No hand-rolled panel toolbars remain (components + App).
const raw = [...readdirSync(dir).filter((f) => f.endsWith('.tsx')).map(read), readFileSync('src/renderer/src/App.tsx', 'utf8')]
  .reduce((n, s) => n + (s.match(/<div className="workspace-panel-toolbar/g) ?? []).length, 0)
assert.equal(raw, 0)

// PanelHeader grew only additive, optional props.
const ph = read('ui/PanelHeader.tsx')
for (const p of ['title?: ReactNode', 'titleTooltip?: string', 'aside?: ReactNode', 'leadClassName?: string', 'actionsProps?:']) assert.ok(ph.includes(p), p)
assert.ok(ph.includes('title != null ?'), 'action-only toolbars render no h2')

// Hooks kept per site.
const sftp = read('SftpPanel.tsx')
assert.ok(sftp.includes('testId="sftp-toolbar"') && sftp.includes('className="sftp-toolbar"') && sftp.includes('actionsClassName="sftp-toolbar-actions"'))
assert.ok(sftp.includes("'data-nowrap': centerLayout.toolbarNowrap ? '1' : '0'"))
assert.ok(sftp.includes('data-testid="sftp-session-cwd"') && sftp.includes('data-testid="sftp-advanced"'))
const rte = read('RemoteTextEditor.tsx')
assert.ok(rte.includes('leadClassName="remote-file-toolbar-left"') && rte.includes('className="remote-file-path"'))
const fh = read('FileHistoryTab.tsx')
assert.ok(fh.includes('titleTooltip={path}') && fh.includes('data-testid="w3-rollback"'))
assert.ok(fh.includes('variant="icon"') && fh.includes("aria-label={tg('w3.openDir')}"), 'icon-only button is labelled')
const ops = read('OpsHomeTab.tsx')
assert.ok(ops.includes('<PanelHeader className="l7-head" title={t(\'l7.title\')} />'))
assert.ok(ops.includes('testId="l7-empty"'))
for (const f of ['MultiHostDashboard.tsx', 'SyncCenter.tsx']) assert.ok(read(f).includes('<PanelHeader'), f)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.54'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.51'), changelog.indexOf('## v0.6.50'))
assert.ok(note.includes('M-polish-13'))
assert.ok(changelogFor('0.6.51').length >= 1)

console.log('test-polish-28 ok')