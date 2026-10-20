/** IX-7: long-dwell editors stay on the workbench. Short confirms keep App Modal. Pure Node, no host rg. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  devDefaultSurface,
  editorOpenPlan,
  mountsFullScreenModal,
  rulesPanelMaxPx,
  type EditorId
} from '../src/shared/editor-surface'
import {
  captureEditorFocus,
  resetOverlayFocusForTest,
  restoreEditorFocus,
  setTerminalFocusHandler
} from '../src/renderer/src/lib/focus-restore'

type FakeEl = {
  id: string
  parent: FakeEl | null
  classes: Set<string>
  attrs: Record<string, string>
  connected: boolean
  focusCalls: number
  readonly isConnected: boolean
  focus: () => void
  closest: (sel: string) => FakeEl | null
  getAttribute: (name: string) => string | null
}

function matches(el: FakeEl, sel: string): boolean {
  if (sel.startsWith('.')) return el.classes.has(sel.slice(1))
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const name = sel.slice(1, -1).split('=')[0]!
    return Object.prototype.hasOwnProperty.call(el.attrs, name)
  }
  return false
}

function makeEl(id: string, parent: FakeEl | null = null): FakeEl {
  const el: FakeEl = {
    id,
    parent,
    classes: new Set(),
    attrs: {},
    connected: true,
    focusCalls: 0,
    get isConnected() {
      return this.connected
    },
    focus() {
      this.focusCalls += 1
    },
    closest(sel: string) {
      const parts = sel.split(',').map((s) => s.trim())
      let n: FakeEl | null = this
      while (n) {
        if (parts.some((p) => matches(n!, p))) return n
        n = n.parent
      }
      return null
    },
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name]! : null
    }
  }
  return el
}

const body = makeEl('body')
const documentElement = makeEl('html')
const doc = { body, documentElement, activeElement: body as FakeEl }
Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: doc })

const termCalls: Array<string | undefined> = []
function armTerminal(): void {
  termCalls.length = 0
  setTerminalFocusHandler((sessionId) => {
    termCalls.push(sessionId)
  })
}

const rules = editorOpenPlan('alert-rules')
assert.equal(rules.placement, 'center-tab')
assert.equal(rules.placement === 'center-tab' ? rules.kind : '', 'alert-rules')
assert.equal(mountsFullScreenModal('alert-rules'), false)

const history = editorOpenPlan('alert-history')
assert.equal(history.placement, 'center-tab')
assert.equal(mountsFullScreenModal('alert-history'), false)

const maintenance = editorOpenPlan('alert-maintenance')
assert.equal(maintenance.placement, 'center-tab')
assert.equal(maintenance.placement === 'center-tab' ? maintenance.kind : '', 'alert-maintenance')

const sampling = editorOpenPlan('probe-sampling')
assert.equal(sampling.placement, 'settings-anchor')
assert.equal(sampling.placement === 'settings-anchor' ? sampling.anchor : '', 'ops')

const shortIds: EditorId[] = ['enable-template', 'end-maintenance', 'danger-step', 'confirm', 'host-picker', 'command-palette']
for (const id of shortIds) {
  assert.equal(editorOpenPlan(id).placement, 'app-modal', id)
  assert.equal(mountsFullScreenModal(id), true, id)
}

assert.equal(devDefaultSurface({ dwellSec: 31 }), 'center-tab')
assert.equal(devDefaultSurface({ dwellSec: 45, anchor: 'ops' }), 'settings-anchor')
assert.equal(devDefaultSurface({ dwellSec: 30 }), 'app-modal')
assert.equal(devDefaultSurface({ dwellSec: 8, compareList: true }), 'center-tab')
assert.equal(devDefaultSurface({ dwellSec: 90, short: true }), 'app-modal')

assert.equal(rulesPanelMaxPx(1366), 320)
assert.equal(rulesPanelMaxPx(1365), 320)
assert.equal(rulesPanelMaxPx(1920), 420)

// Esc / close: prior non-terminal surface comes back. Do not steal the shell.
{
  resetOverlayFocusForTest()
  armTerminal()
  const rulesButton = makeEl('rules-button')
  doc.activeElement = rulesButton
  const ticket = captureEditorFocus()
  const panel = makeEl('alert-rules-panel')
  doc.activeElement = panel
  restoreEditorFocus(ticket)
  assert.equal(rulesButton.focusCalls, 1, 'close restores the control that opened the editor')
  assert.equal(panel.focusCalls, 0)
  assert.deepEqual(termCalls, [], 'close does not steal a non-terminal surface into the shell')
}

// Prior terminal: session API, not the stale xterm textarea.
{
  resetOverlayFocusForTest()
  armTerminal()
  const wrap = makeEl('wrap')
  wrap.attrs['data-terminal'] = 'true'
  wrap.attrs['data-session-id'] = 'sess-9'
  const textarea = makeEl('xterm-helper-textarea', wrap)
  textarea.classes.add('xterm-helper-textarea')
  doc.activeElement = textarea
  const ticket = captureEditorFocus()
  doc.activeElement = makeEl('alert-rules-panel')
  restoreEditorFocus(ticket)
  assert.deepEqual(termCalls, ['sess-9'])
  assert.equal(textarea.focusCalls, 0, 'must not focus the stale xterm textarea')
}

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const workbench = readFileSync('src/renderer/src/components/AlertWorkbenchTab.tsx', 'utf8')
const editor = readFileSync('src/renderer/src/components/AlertRulesModal.tsx', 'utf8')
const modal = readFileSync('src/renderer/src/components/Modal.tsx', 'utf8')
const dialogs = readFileSync('src/renderer/src/lib/dialogs.tsx', 'utf8')
const templates = readFileSync('src/renderer/src/components/AlertRuleTemplatesTab.tsx', 'utf8')
const maint = readFileSync('src/renderer/src/components/MaintenanceTab.tsx', 'utf8')
const playbook = readFileSync('src/renderer/src/components/PlaybookTabs.tsx', 'utf8')
const surface = readFileSync('src/shared/editor-surface.ts', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const changelog = readFileSync('CHANGELOG.md', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }

assert.match(surface, /IA nit N2/)
assert.match(surface, /L2d/)
assert.doesNotMatch(app, /setAlertModalOpen/)
assert.match(app, /openClassifiedEditor\('alert-rules'\)/)
assert.match(app, /editorOpenPlan\(id\)/)

const listAt = workbench.indexOf('data-testid="l2-list"')
const panelAt = workbench.indexOf('<AlertRulesModal')
assert.ok(listAt > 0 && panelAt > listAt, 'rule edit is docked beside the list, not instead of it')
assert.match(workbench, /data-testid="alert-workbench"/)
assert.doesNotMatch(workbench, /modal-backdrop/)

assert.match(editor, /className="alert-rules-panel"/)
assert.match(editor, /data-kind=\{kind\}/)
assert.match(editor, /'alert-rules'/)
assert.match(editor, /captureEditorFocus\(\)/)
assert.match(editor, /restoreEditorFocus\(ticket\)/)
assert.match(editor, /closest\('\.terminal-layer'\)/)
assert.match(editor, /classList\.contains\('active'\)/)
assert.doesNotMatch(editor, /<Modal/)
assert.doesNotMatch(editor, /modal-backdrop/)
assert.doesNotMatch(editor, /aria-modal/)
assert.doesNotMatch(editor, /position:\s*fixed/)

assert.match(modal, /className="modal modal-backdrop"/)
assert.match(dialogs, /<Modal/)
assert.doesNotMatch(dialogs, /embedded/)
assert.match(templates, /<Modal/)
assert.match(templates, /testId="l2c-enable-modal"/)
assert.match(maint, /confirmDialog\(/)
assert.match(playbook, /askConfirm\(/)
assert.match(playbook, /danger:\s*true/)

const panelRule = features.slice(features.indexOf('.alert-rules-panel {'), features.indexOf('.alert-rules-panel-head'))
assert.match(panelRule, /max-width:\s*min\(420px,\s*40%\)/)
assert.match(panelRule, /min-width:\s*0/)
assert.doesNotMatch(panelRule, /position:\s*fixed/)
assert.match(features, /max-width:\s*min\(320px,\s*36%\)/)
const narrow = styles.slice(styles.indexOf('@media (max-width: 1366px)'), styles.indexOf('@media (max-width: 1366px)') + 700)
assert.match(narrow, /\.main\s*\{[^}]*overflow-x:\s*hidden/)
assert.match(narrow, /\.main\s*\{[^}]*min-width:\s*0/)

assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-ix7-surface\.ts/)
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
/** Title line only (`- **…（IX-N）.**`). A body cross-ref must not count. */
function unreleasedBulletAt(section: string, id: string): number {
  const m = new RegExp(`^- \\*\\*[^\\n*]*（${id}）`, 'm').exec(section)
  return m ? m.index : -1
}
const ix7 = unreleasedBulletAt(unreleased, 'IX-7')
const ix6 = unreleasedBulletAt(unreleased, 'IX-6')
assert.ok(ix7 >= 0 && ix6 > ix7, 'IX-7 sits in Unreleased ahead of IX-6')
assert.equal(unreleased.slice(ix7, ix6).includes('IX-3'), false)
assert.equal(unreleased.slice(ix7, ix6).includes('IX-5'), false)
assert.equal(unreleased.slice(ix7, ix6).includes('IX-6'), false)
const bullet = unreleased.slice(ix7, ix6)
assert.match(bullet, /Public HOLD/)
assert.match(bullet, /0\.4\.4/)
assert.match(bullet, /kind=alert-rules/)
assert.match(bullet, /不打 tag/)
assert.match(bullet, /No tag, no Release/)

console.log('test-ix7-surface ok')
