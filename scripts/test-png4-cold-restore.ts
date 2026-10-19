/** PNG-4: cold start restores a whitelist workspace and does not raise welcome when hosts exist. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { coldStartShowsWelcome, planColdStart, restoredLayoutFrame, showsDroppedConnection, showsRestoreHold } from '../src/shared/cold-start'
import { pickProductOverlay } from '../src/shared/overlay-stack'
import { RESTORE_KINDS, planRestore, snapshotWorkspace } from '../src/shared/session-restore'
import { loadRestoreLayout, loadStartupMode, saveRestoreLayout } from '../src/shared/startup-pref'
import { SETTINGS_SEARCH_TERMS } from '../src/shared/settings-nav'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1]) => translate('zh-CN', key)
const en = (key: Parameters<typeof translate>[1]) => translate('en', key)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.43')

function memoryStore() {
  const mem = new Map<string, string>()
  return {
    getItem: (key: string) => (mem.has(key) ? mem.get(key)! : null),
    setItem: (key: string, value: string) => {
      mem.set(key, value)
    }
  }
}

const fresh = memoryStore()
assert.equal(loadStartupMode(fresh), 'home', 'startup radio default stays ops home')
assert.equal(loadRestoreLayout(fresh), true, '恢复上次布局 defaults on')
saveRestoreLayout(false, fresh)
assert.equal(loadRestoreLayout(fresh), false, 'the setting can be turned off')
saveRestoreLayout(true, fresh)
assert.equal(loadRestoreLayout(fresh), true)

assert.equal(zh('settings.restoreTabs'), '恢复上次布局')
assert.equal(en('settings.restoreTabs'), 'Restore last layout')
assert.equal(zh('restore.click'), '点击连接')

const known = new Set(['p1'])
const saved = {
  profileIds: ['p1'],
  tabs: [
    { kind: 'home', title: '', order: 0, active: false },
    { kind: 'terminal', profileId: 'p1', title: 'db', order: 1, active: true },
    { kind: 'sftp', profileId: 'p1', title: '', order: 2 },
    { kind: 'connection', title: 'new', order: 3 },
    { kind: 'import-preview', title: 'import', order: 4 },
    { kind: 'local', title: 'local', order: 5 },
    { kind: 'playbook-run', title: 'run', order: 6, playbookId: 'pb' },
    { kind: 'playbook-edit', title: '', order: 7 },
    { kind: 'sync-preview', title: '', order: 8 },
    { kind: 'docker', title: 'docker', order: 9 },
    { kind: 'remote-file', title: 'file', order: 10 },
    { kind: 'batch', title: 'batch', order: 11 },
    { kind: 'terminal', profileId: 'gone', title: 'old', order: 12 }
  ]
}

const restored = planColdStart({ mode: 'home', restoreLayout: true, saved, knownProfileIds: known })
assert.equal(restored.kind, 'restore')
if (restored.kind === 'restore') {
  assert.deepEqual(restored.tabs.map((row) => row.kind), ['home', 'terminal', 'sftp'])
  assert.equal(restored.activeIndex, 1)
  assert.equal(restored.autoConnect, false, 'default restore does not SSH')
  assert.ok(restored.skipped >= 8)
}

const explicit = planColdStart({ mode: 'last', restoreLayout: true, saved, knownProfileIds: known })
assert.equal(explicit.kind, 'restore')
if (explicit.kind === 'restore') assert.equal(explicit.autoConnect, true, '上次会话 still reconnects')

const off = planColdStart({ mode: 'last', restoreLayout: false, saved, knownProfileIds: known })
assert.equal(off.kind, 'home')
assert.equal(off.autoConnect, false)

const blank = planColdStart({ mode: 'blank', restoreLayout: true, saved, knownProfileIds: known })
assert.equal(blank.kind, 'blank')
assert.equal(blank.autoConnect, false)

const legacyHome = planColdStart({
  mode: 'home',
  saved: { profileIds: ['p1'], tabs: [{ kind: 'home', title: 'home', order: 0, active: true }] },
  knownProfileIds: known
})
assert.equal(legacyHome.kind, 'home', 'omitted flag keeps home from restoring')

const allowed = [
  'home',
  'alert-workbench',
  'monitor',
  'toolbox',
  'sftp',
  'forward',
  'inventory',
  'settings',
  'playbook-list',
  'playbook-edit',
  'audit',
  'recordings',
  'sync-settings',
  'terminal'
]
assert.deepEqual([...RESTORE_KINDS], allowed)

const finished = planRestore(
  [
    { kind: 'playbook-edit', title: '', order: 0, playbookId: 'pb1', active: true },
    { kind: 'alert-workbench', title: '', order: 1 },
    { kind: 'forward', title: '', order: 2 },
    { kind: 'inventory', title: '', order: 3 },
    { kind: 'settings', title: '', order: 4, settingsSection: 'general' },
    { kind: 'monitor', title: '', order: 5, profileId: 'p1' },
    { kind: 'file-diff', title: '', order: 6 },
    { kind: 'alert-rules', title: '', order: 7 },
    { kind: 'dashboard', title: '', order: 8 },
    { kind: 'recording-play', title: '', order: 9 }
  ],
  known
)
assert.deepEqual(finished.keep.map((row) => row.kind), ['playbook-edit', 'alert-workbench', 'forward', 'inventory', 'settings', 'monitor'])

const shot = snapshotWorkspace(
  [
    { tabId: 't1', title: 'shell', profileId: 'p1' },
    { tabId: 't2', view: 'connection', title: 'new' },
    { tabId: 't3', view: 'import-preview', title: 'import' },
    { tabId: 't4', kind: 'local', title: 'local' },
    { tabId: 't5', view: 'playbook-edit', title: 'edit' },
    { tabId: 't6', view: 'sync-preview', title: 'sync' },
    { tabId: 't7', view: 'playbook-edit', title: 'edit', playbookId: 'pb1' },
    { tabId: 't8', view: 'home', title: 'home' }
  ],
  't1'
)
assert.deepEqual(shot.map((row) => row.kind), ['terminal', 'playbook-edit', 'home'])

const welcomeBase = {
  sessionsReady: true,
  bootNoted: true,
  hostCount: 0,
  dismissed: false,
  completed: false,
  releaseNotesOpen: false,
  notesHeld: false,
  replay: false
}
assert.equal(coldStartShowsWelcome({ ...welcomeBase, sessionsReady: false, hostCount: 0 }), false, 'welcome waits until hosts are known')
assert.equal(coldStartShowsWelcome({ ...welcomeBase, bootNoted: false }), false)
assert.equal(coldStartShowsWelcome(welcomeBase), true, 'zero hosts still welcome')
assert.equal(coldStartShowsWelcome({ ...welcomeBase, hostCount: 2 }), false, 'hosts: no welcome wall')
assert.equal(coldStartShowsWelcome({ ...welcomeBase, hostCount: 2, replay: true }), true, 'help can reopen welcome')
assert.equal(coldStartShowsWelcome({ ...welcomeBase, hostCount: 2, releaseNotesOpen: true }), false)
assert.equal(coldStartShowsWelcome({ ...welcomeBase, releaseNotesOpen: true }), false, 'update notes keep the slot')
assert.equal(coldStartShowsWelcome({ ...welcomeBase, workspaceBlocked: true }), false)
assert.equal(
  pickProductOverlay({
    systemUpdate: false,
    releaseNotes: true,
    welcome: coldStartShowsWelcome({ ...welcomeBase, hostCount: 3, releaseNotesOpen: true }),
    tour: false,
    tourExplicit: false,
    quickStart: false,
    quickExplicit: false,
    tasks: false
  }),
  'releaseNotes',
  'restore does not take the overlay slot from update notes'
)

assert.equal(showsRestoreHold({ view: 'sftp', restored: true }), true)
assert.equal(showsRestoreHold({ view: 'sftp', boundSessionId: 's1' }), false, 'a live SFTP tab is not a placeholder')
assert.equal(showsRestoreHold({ view: 'sftp' }), false, 'an opening SFTP tab keeps its own panel')
assert.equal(showsRestoreHold({ restored: true }), true)
assert.equal(showsRestoreHold({ restored: true, cold: true }), true, 'a click stays on the calm placeholder')
assert.equal(showsRestoreHold({ restored: true, sessionId: 'live' }), false)
assert.equal(showsDroppedConnection({ status: 'disconnected', restored: true }), false)
assert.equal(showsDroppedConnection({ status: 'disconnected', sessionId: 'live', restored: true }), true)

const frame = restoredLayoutFrame(1366, 768)
assert.equal(frame.fits, true)
assert.ok(frame.contentHeight >= 480)
assert.ok(frame.contentHeight < 768)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const bootAt = app.indexOf('restoreLayout: loadRestoreLayout()')
const boot = app.slice(bootAt, app.indexOf('}, [sessionsReady])', bootAt))
assert.ok(boot.includes('cold: plan.autoConnect && needsSession'))
assert.equal(boot.includes('connectProfile'), false)
assert.equal(boot.includes('ssh.connect'), false)
assert.ok(app.includes('coldStartShowsWelcome'))
assert.ok(app.includes('showsRestoreHold'))
const wakeAt = app.indexOf('const tab = tabsRef.current.find((t) => t.tabId === activeTabId && t.cold)')
assert.ok(wakeAt > bootAt, 'reconnect still waits for an explicit cold tab')

const settings = readFileSync('src/renderer/src/components/SettingsPanel.tsx', 'utf8')
assert.ok(settings.includes('data-testid="restore-layout"'))
assert.ok(settings.includes("t('settings.restoreTabs')"))
const modal = readFileSync('src/renderer/src/components/StartupSettingsModal.tsx', 'utf8')
assert.ok(modal.includes('data-testid="startup-restore-layout"'))

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsButtons = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.equal((opsButtons.match(/id: '/g) ?? []).length, 3, 'no new toolbar primary')

const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.restore-connecting\s*\{[^}]*overflow:\s*hidden/)
assert.match(css, /\.restore-connecting \.empty-state-title,\s*\.restore-connecting \.empty-state-primary\s*\{[^}]*white-space:\s*nowrap/)
assert.match(css, /\.settings-row[^{]*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(css, /\.l7-startup label\s*\{[^}]*white-space:\s*nowrap/)

assert.ok(SETTINGS_SEARCH_TERMS.general.includes('布局'))
assert.ok(SETTINGS_SEARCH_TERMS.general.includes('layout'))

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
const match = /^- \*\*[^\n*]*（PNG-4）/m.exec(unreleased)
assert.ok(match, 'Unreleased title carries PNG-4')
const bullet = unreleased.slice(match.index, unreleased.indexOf('\n- **', match.index + 1))
const title = bullet.slice(0, bullet.indexOf('.**') + 3)
const body = bullet.slice(title.length)
assert.match(title, /^-\s\*\*[^*\n]*（PNG-4）\.\*\*/)
assert.equal(body.includes('PNG-4'), false, 'the id stays in the title')
assert.match(body, /恢复上次布局/)
assert.match(body, /Public HOLD/)
assert.match(body, /0\.4\.4/)
assert.match(body, /不打 tag/)


/* Tab strip order + pin round-trip through snapshotWorkspace */
const reordered = snapshotWorkspace(
  [
    { tabId: 'a', title: 'alpha', profileId: 'p1', openSeq: 30, pinned: false },
    { tabId: 'b', title: 'beta', profileId: 'p1', openSeq: 10, pinned: true },
    { tabId: 'c', title: 'gamma', view: 'home', openSeq: 20, pinned: false }
  ],
  'a'
)
assert.equal(reordered[0]?.kind, 'terminal')
assert.equal(reordered[0]?.title, 'beta')
assert.equal(reordered[0]?.pinned, true)
assert.equal(reordered[1]?.kind, 'home')
assert.equal(reordered[2]?.title, 'alpha')
assert.equal(reordered[2]?.active, true)
assert.equal(reordered[0]?.order, 0)
assert.equal(reordered[2]?.order, 2)

const appSrc = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(appSrc, /BroadcastTargetPicker/)
assert.match(appSrc, /onStop=\{/)
assert.match(appSrc, /pinned: row\.pinned === true/)
assert.match(appSrc, /openSeq: \(row\.order \+ 1\) \* 10/)
assert.match(readFileSync('src/renderer/src/components/BroadcastTargetPicker.tsx', 'utf8'), /x3-stop/)
assert.match(readFileSync('src/shared/startup-pref.ts', 'utf8'), /pinned\?: boolean/)
console.log('test-png4: tab order/pin + broadcast picker wiring ok')
