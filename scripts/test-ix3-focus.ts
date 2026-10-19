/** IX-3: restore keyboard focus after a dialog or overlay closes. Forbids "close loses terminal". */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  confirmInitialFocus,
  noteOverlayClose,
  noteOverlayOpen,
  resetOverlayFocusForTest,
  setTerminalFocusHandler,
  shouldCaptureOnEnqueue,
  shouldRestoreOnQueueLength
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

type Doc = { body: FakeEl; documentElement: FakeEl; activeElement: FakeEl }

function installDocument(): Doc {
  const body = makeEl('body')
  const documentElement = makeEl('html')
  const doc: Doc = { body, documentElement, activeElement: body }
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: doc })
  return doc
}

function terminalTree(): { textarea: FakeEl; sessionId: string } {
  const wrap = makeEl('wrap')
  wrap.attrs['data-terminal'] = 'true'
  wrap.attrs['data-session-id'] = 'sess-1'
  const xterm = makeEl('xterm', wrap)
  xterm.classes.add('xterm')
  const textarea = makeEl('xterm-helper-textarea', xterm)
  textarea.classes.add('xterm-helper-textarea')
  return { textarea, sessionId: 'sess-1' }
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    queueMicrotask(() => resolve())
  })
}

const doc = installDocument()
const termCalls: Array<string | undefined> = []

function armTerminal(): void {
  termCalls.length = 0
  setTerminalFocusHandler((sessionId) => {
    termCalls.push(sessionId)
  })
}

/** Same enqueue / drain rules DialogHost uses. */
function mockDialogQueue() {
  let len = 0
  let held = false
  return {
    enqueue() {
      const prev = len
      if (shouldCaptureOnEnqueue(prev)) {
        noteOverlayOpen()
        held = true
      }
      len += 1
    },
    /** Esc, cancel, and confirm all drain one item. Restore only when the queue is empty. */
    close() {
      len = Math.max(0, len - 1)
      if (len > 0) return
      if (!held) return
      if (!shouldRestoreOnQueueLength(len)) return
      held = false
      noteOverlayClose()
    },
    get length() {
      return len
    }
  }
}

resetOverlayFocusForTest()
armTerminal()

assert.equal(shouldCaptureOnEnqueue(0), true)
assert.equal(shouldCaptureOnEnqueue(1), false)
assert.equal(shouldRestoreOnQueueLength(0), true)
assert.equal(shouldRestoreOnQueueLength(1), false)
assert.equal(confirmInitialFocus(true), 'cancel')
assert.equal(confirmInitialFocus(false), 'ok')

// FR-A: terminal focused → delete confirm → Esc/cancel → next key goes to the shell.
{
  resetOverlayFocusForTest()
  armTerminal()
  const { textarea } = terminalTree()
  const cancel = makeEl('cancel')
  doc.activeElement = textarea
  const dialog = mockDialogQueue()
  dialog.enqueue()
  doc.activeElement = cancel
  dialog.close()
  await settle()
  assert.deepEqual(termCalls, ['sess-1'], 'FR-A cancel restores the terminal session')
  assert.equal(textarea.focusCalls, 0, 'FR-A must not focus the stale xterm textarea')
  assert.equal(cancel.focusCalls, 0, 'FR-A must not leave focus on the dialog')
}

// FR-B: confirm restores the terminal too.
{
  resetOverlayFocusForTest()
  armTerminal()
  const { textarea } = terminalTree()
  doc.activeElement = textarea
  const dialog = mockDialogQueue()
  dialog.enqueue()
  doc.activeElement = makeEl('ok')
  dialog.close()
  await settle()
  assert.deepEqual(termCalls, ['sess-1'], 'FR-B confirm restores the terminal session')
  assert.equal(textarea.focusCalls, 0, 'FR-B must not focus the stale xterm textarea')
}

// FR-D: host picker / command palette restore the prior surface (terminal or another control).
{
  resetOverlayFocusForTest()
  armTerminal()
  const { textarea } = terminalTree()
  doc.activeElement = textarea
  noteOverlayOpen()
  doc.activeElement = makeEl('palette-input')
  noteOverlayClose()
  await settle()
  assert.deepEqual(termCalls, ['sess-1'], 'FR-D palette/host picker restores the terminal')
  assert.equal(textarea.focusCalls, 0)

  resetOverlayFocusForTest()
  armTerminal()
  const search = makeEl('toolbar-search')
  doc.activeElement = search
  noteOverlayOpen()
  doc.activeElement = makeEl('palette-input')
  noteOverlayClose()
  await settle()
  assert.equal(search.focusCalls, 1, 'FR-D restores a non-terminal prior surface')
  assert.deepEqual(termCalls, [], 'FR-D does not steal a non-terminal surface into the shell')
}

// FR-E: nested queue — inner close does not restore; outer close restores once.
{
  resetOverlayFocusForTest()
  armTerminal()
  const { textarea } = terminalTree()
  doc.activeElement = textarea
  const dialog = mockDialogQueue()
  dialog.enqueue()
  doc.activeElement = makeEl('outer-cancel')
  dialog.enqueue()
  dialog.close()
  await settle()
  assert.deepEqual(termCalls, [], 'FR-E inner close does not restore')
  assert.equal(dialog.length, 1)
  dialog.close()
  await settle()
  assert.deepEqual(termCalls, ['sess-1'], 'FR-E outer close restores once')
  assert.equal(textarea.focusCalls, 0)

  resetOverlayFocusForTest()
  armTerminal()
  doc.activeElement = textarea
  noteOverlayOpen()
  doc.activeElement = makeEl('picker')
  noteOverlayOpen()
  noteOverlayClose()
  await settle()
  assert.deepEqual(termCalls, [], 'FR-E stacked overlay inner close does not restore')
  noteOverlayClose()
  await settle()
  assert.deepEqual(termCalls, ['sess-1'], 'FR-E stacked overlay outer close restores once')
}

// StrictMode replays open → close → open before the restore flushes.
{
  resetOverlayFocusForTest()
  armTerminal()
  const { textarea } = terminalTree()
  doc.activeElement = textarea
  noteOverlayOpen()
  noteOverlayClose()
  noteOverlayOpen()
  await settle()
  assert.deepEqual(termCalls, [], 'strict remount does not restore early')
  noteOverlayClose()
  await settle()
  assert.deepEqual(termCalls, ['sess-1'], 'strict remount still restores on the real close')
}

// Safe land: a disconnected prior node is not focused and does not throw.
{
  resetOverlayFocusForTest()
  armTerminal()
  const gone = makeEl('gone')
  doc.activeElement = gone
  noteOverlayOpen()
  gone.connected = false
  doc.activeElement = makeEl('dialog')
  noteOverlayClose()
  await settle()
  assert.equal(gone.focusCalls, 0, 'disconnected prior surface is a safe land')
  assert.deepEqual(termCalls, [])
}

// Nothing focused: close is a no-op, not a throw.
{
  resetOverlayFocusForTest()
  armTerminal()
  doc.activeElement = doc.body
  noteOverlayOpen()
  noteOverlayClose()
  await settle()
  assert.deepEqual(termCalls, [])
}

// Session API path used when no test handler is installed: event, not the stale node.
{
  resetOverlayFocusForTest()
  const seen: Array<{ type: string; sessionId?: string }> = []
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      dispatchEvent(ev: CustomEvent<{ sessionId?: string }>) {
        seen.push({ type: ev.type, sessionId: ev.detail?.sessionId })
        return true
      }
    }
  })
  const { textarea } = terminalTree()
  doc.activeElement = textarea
  noteOverlayOpen()
  noteOverlayClose()
  await settle()
  assert.equal(textarea.focusCalls, 0, 'session API does not focus the stale textarea')
  assert.deepEqual(seen, [{ type: 'aiss-focus-terminal', sessionId: 'sess-1' }])
}

const dialogs = readFileSync('src/renderer/src/lib/dialogs.tsx', 'utf8')
const focus = readFileSync('src/renderer/src/lib/focus-restore.ts', 'utf8')
const hostPicker = readFileSync('src/renderer/src/components/HostPicker.tsx', 'utf8')
const palette = readFileSync('src/renderer/src/components/CommandPalette.tsx', 'utf8')
const term = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const css = `${styles}\n${features}`
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
const changelog = readFileSync('CHANGELOG.md', 'utf8')

assert.match(dialogs, /shouldCaptureOnEnqueue\(prev\)/)
assert.match(dialogs, /noteOverlayOpen\(\)/)
assert.match(dialogs, /shouldRestoreOnQueueLength\(lenRef\.current\)/)
assert.match(dialogs, /noteOverlayClose\(\)/)
assert.match(dialogs, /confirmInitialFocus\(Boolean\(current\.danger\)\) === 'cancel'/)
assert.match(dialogs, /onClose=\{\(\) => finish\(false\)\}/)
assert.match(dialogs, /onClick=\{\(\) => finish\(false\)\}/)
assert.match(dialogs, /onClick=\{\(\) => finish\(true\)\}/)
assert.match(dialogs, /return \(\) => window\.clearTimeout\(id\)/)
assert.match(dialogs, /setOpenCount\(queue\.length\)/)
assert.match(hostPicker, /useOverlayFocusRestore\(open\)/)
assert.match(palette, /useOverlayFocusRestore\(open\)/)
assert.match(term, /data-session-id=\{sessionId\}/)
assert.match(term, /aiss-focus-terminal/)
assert.match(term, /apiRef\.current\?\.term\.focus\(\)/)
assert.match(focus, /aiss-focus-terminal/)
assert.match(focus, /kind === 'terminal'/)
assert.match(app, /isDialogOpen\(\)/)
assert.match(app, /ux45\.finishDialog/)
assert.match(app, /opsBlocked\.has\(action\) && isDialogOpen\(\)/)

const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
/** Title line only (`- **…（IX-N）.**`). A body cross-ref must not count. */
function unreleasedBulletAt(section: string, id: string): number {
  const m = new RegExp(`^- \\*\\*[^\\n*]*（${id}）`, 'm').exec(section)
  return m ? m.index : -1
}
const ix3 = unreleasedBulletAt(unreleased, 'IX-3')
const n2 = unreleasedBulletAt(unreleased, 'UI-N2')
assert.ok(ix3 >= 0 && n2 > ix3, 'IX-3 sits in Unreleased ahead of UI-N2')
const ix3Bullet = unreleased.slice(ix3, n2)
assert.match(ix3Bullet, /Public HOLD/)
assert.match(ix3Bullet, /0\.4\.4/)
assert.match(ix3Bullet, /term\.focus\(\)/)

assert.equal(pkg.version, '0.6.62')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-ix3-focus\.ts/)

assert.match(css, /\.sftp-pane\.is-active:focus-visible/)
assert.match(styles, /button\.primary:focus-visible,\s*button\.danger:focus-visible,\s*button\.primary\.danger:focus-visible/)
assert.match(styles, /\.modal-footer \{[^}]*flex-wrap:\s*nowrap/)
const sftpActive = css.match(/\.sftp-pane\.is-active \{([^}]*)\}/)
assert.ok(sftpActive, 'UI-N7 active SFTP pane rule')
assert.match(sftpActive[1]!, /box-shadow:\s*inset/)
assert.doesNotMatch(sftpActive[1]!, /outline:\s*1px/)
assert.doesNotMatch(focus, /outline\s*:/)
assert.doesNotMatch(dialogs, /outline\s*:/)

console.log('test-ix3-focus ok')
