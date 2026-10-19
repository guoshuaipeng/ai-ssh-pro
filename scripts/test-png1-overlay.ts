/** PNG-1: one product overlay. Update, then changelog, then welcome, then optional G2. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  admitProductOverlay,
  escProductTarget,
  pickProductOverlay,
  productBackdropCount,
  shouldOfferTourAfterWelcome,
  suppressParkableProduct,
  isParkableProduct,
  type ProductOverlay
} from '../src/shared/overlay-stack'
import { shouldShowWelcome } from '../src/shared/welcome-prefs'
import {
  bindProductFocus,
  captureEditorFocus,
  noteOverlayClose,
  noteOverlayOpen,
  resetOverlayFocusForTest,
  restoreEditorFocus,
  setTerminalFocusHandler
} from '../src/renderer/src/lib/focus-restore'

const base = {
  systemUpdate: false,
  releaseNotes: false,
  welcome: false,
  tour: false,
  tourExplicit: false,
  quickStart: false,
  quickExplicit: false,
  tasks: false
}

assert.equal(
  pickProductOverlay({ ...base, systemUpdate: true, releaseNotes: true, welcome: true, tour: true, tourExplicit: true, tasks: true }),
  'systemUpdate',
  'system update is in front of changelog and welcome'
)
assert.equal(
  pickProductOverlay({ ...base, releaseNotes: true, welcome: true, tour: true, tasks: true }),
  'releaseNotes',
  'changelog is in front of welcome'
)
assert.equal(
  pickProductOverlay({ ...base, welcome: true, tour: true, tasks: true }),
  'welcome',
  'welcome stays in front of a queued tour and task cards'
)
assert.equal(
  pickProductOverlay({ ...base, welcome: true, tour: true, tourExplicit: true, tasks: true }),
  'tour',
  'help can open the tour without leaving welcome on screen'
)
assert.equal(pickProductOverlay({ ...base, tasks: true }), 'tasks')
assert.equal(pickProductOverlay(base), null)

const bits = [false, true]
for (const systemUpdate of bits) {
  for (const releaseNotes of bits) {
    for (const welcome of bits) {
      for (const tour of bits) {
        for (const tourExplicit of bits) {
          for (const tasks of bits) {
            const visible = pickProductOverlay({
              ...base,
              systemUpdate,
              releaseNotes,
              welcome,
              tour,
              tourExplicit,
              tasks
            })
            assert.ok(productBackdropCount(visible) <= 1)
            const shown = new Set<ProductOverlay>()
            if (visible) shown.add(visible)
            assert.equal(shown.has('welcome') && shown.has('tour'), false)
            assert.equal(shown.has('welcome') && shown.has('tasks'), false)
          }
        }
      }
    }
  }
}

assert.equal(admitProductOverlay('systemUpdate', 'releaseNotes'), 'queue')
assert.equal(admitProductOverlay('systemUpdate', 'welcome'), 'queue')
assert.equal(admitProductOverlay('releaseNotes', 'welcome'), 'queue')
assert.equal(admitProductOverlay('welcome', 'tour'), 'queue', 'G2 waits; it does not cover welcome')
assert.equal(admitProductOverlay('welcome', 'tasks'), 'queue', 'task cards wait; they do not cover welcome')
assert.equal(admitProductOverlay('welcome', 'tour', { explicit: true }), 'show', 'Help → tour takes the slot')
assert.equal(admitProductOverlay('tour', 'welcome', { explicit: true }), 'show', 'Help → welcome takes the slot back')
assert.equal(admitProductOverlay('tour', 'welcome'), 'queue')
assert.equal(admitProductOverlay('systemUpdate', 'systemUpdate'), 'refuse')
assert.equal(admitProductOverlay('welcome', 'welcome'), 'refuse')
assert.equal(admitProductOverlay(null, 'welcome'), 'show')
assert.equal(admitProductOverlay('tasks', 'tour'), 'show', 'a higher layer may take the slot; tasks wait')
assert.equal(productBackdropCount('systemUpdate'), 1)
assert.equal(productBackdropCount('releaseNotes'), 1)
assert.equal(productBackdropCount('welcome'), 0)
assert.equal(productBackdropCount('tour'), 0)
assert.equal(productBackdropCount(null), 0)

assert.equal(escProductTarget({ product: 'welcome', higherChrome: true, modalBackdrops: 0 }), null, 'Esc leaves welcome while a menu is open')
assert.equal(escProductTarget({ product: 'welcome', higherChrome: false, modalBackdrops: 1 }), null, 'Esc leaves welcome while a dialog is open')
assert.equal(escProductTarget({ product: 'welcome', higherChrome: false, modalBackdrops: 0 }), 'welcome')
assert.equal(escProductTarget({ product: 'tour', higherChrome: false, modalBackdrops: 0 }), 'tour')
assert.equal(escProductTarget({ product: 'systemUpdate', higherChrome: false, modalBackdrops: 1 }), 'systemUpdate')
assert.equal(
  escProductTarget({ product: 'systemUpdate', higherChrome: false, modalBackdrops: 2 }),
  null,
  'a dialog above the update is the top layer'
)
assert.equal(escProductTarget({ product: 'releaseNotes', higherChrome: false, modalBackdrops: 1 }), 'releaseNotes')
assert.equal(escProductTarget({ product: 'releaseNotes', higherChrome: false, modalBackdrops: 2 }), null)
assert.equal(escProductTarget({ product: null, higherChrome: false, modalBackdrops: 0 }), null)
assert.notEqual(
  escProductTarget({ product: 'systemUpdate', higherChrome: false, modalBackdrops: 1 }),
  'welcome',
  'Esc does not close welcome underneath the update'
)

assert.equal(
  shouldOfferTourAfterWelcome({ welcomeWasVisible: true, completedNow: true, tourDone: false, replay: false }),
  true
)
assert.equal(
  shouldOfferTourAfterWelcome({ welcomeWasVisible: false, completedNow: true, tourDone: false, replay: false }),
  false,
  'a cold start that never showed welcome does not raise the tour'
)

const welcomeBase = {
  hostCount: 0,
  dismissed: false,
  completed: false,
  releaseNotesOpen: false,
  notesHeld: false,
  replay: false
}
assert.equal(shouldShowWelcome({ ...welcomeBase, hostCount: 2 }), false, 'hosts already configured: no forced welcome')
assert.equal(shouldShowWelcome({ ...welcomeBase, hostCount: 2, replay: true }), true, 'Help can reopen welcome')
assert.equal(shouldShowWelcome({ ...welcomeBase, hostCount: 2, replay: true, releaseNotesOpen: true }), false)

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

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    queueMicrotask(() => resolve())
  })
}

function terminalTextarea(): FakeEl {
  const wrap = makeEl('wrap')
  wrap.attrs['data-terminal'] = 'true'
  wrap.attrs['data-session-id'] = 'sess-1'
  const xterm = makeEl('xterm', wrap)
  xterm.classes.add('xterm')
  const textarea = makeEl('xterm-helper-textarea', xterm)
  textarea.classes.add('xterm-helper-textarea')
  return textarea
}

resetOverlayFocusForTest()
armTerminal()
const textarea = terminalTextarea()
doc.activeElement = textarea
const welcomeBtn = makeEl('welcome-import')
const emptyNew = makeEl('empty-new-connection')

let pending: (() => void) | null = null
const scope = bindProductFocus({
  schedule(fn) {
    pending = fn
    return 1
  },
  cancel() {
    pending = null
  },
  now() {
    return captureEditorFocus()
  },
  restore(ticket) {
    restoreEditorFocus(ticket)
  }
})

const closeLayer = scope.activate()
doc.activeElement = welcomeBtn
noteOverlayOpen()
noteOverlayClose()
await settle()
assert.equal(welcomeBtn.focusCalls, 1, 'Esc on a menu or palette returns to the product overlay')
assert.deepEqual(termCalls, [], 'that Esc does not steal the shell underneath the overlay')
assert.equal(emptyNew.focusCalls, 0)

closeLayer()
assert.equal(termCalls.length, 0, 'closing the product layer waits for the deferred restore')
assert.ok(pending)
const flush = pending!
pending = null
flush()
assert.deepEqual(termCalls, ['sess-1'], 'the product layer restores the terminal, not a stand-in')
assert.equal(emptyNew.focusCalls, 0, 'empty-state New connection is not focused')
assert.equal(welcomeBtn.focusCalls, 1)

resetOverlayFocusForTest()
armTerminal()
const queued: string[] = []
let queuedTimer: (() => void) | null = null
let captures = 0
const replay = bindProductFocus({
  schedule(fn) {
    queuedTimer = fn
    return 2
  },
  cancel() {
    queuedTimer = null
  },
  now() {
    captures += 1
    return { land: { kind: 'terminal', sessionId: 'sess-1' } }
  },
  restore() {
    queued.push('restore')
  }
})
const replayClose = replay.activate()
replayClose()
assert.equal(captures, 1)
assert.ok(queuedTimer)
const reopen = replay.activate()
assert.equal(queuedTimer, null, 'a queued next overlay cancels the restore')
assert.deepEqual(queued, [])
assert.equal(captures, 1, 'the original ticket stays')
reopen()
assert.ok(queuedTimer)
queuedTimer!()
assert.deepEqual(queued, ['restore'])

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const dismissAt = app.indexOf('const dismissWelcome = useCallback')
const dismissBody = app.slice(dismissAt, app.indexOf('}, [])', dismissAt))
assert.equal(dismissBody.includes('empty-new-connection'), false)
assert.equal(dismissBody.includes('.focus('), false)
assert.ok(app.includes("open={product === 'systemUpdate'}"))
assert.ok(app.includes("open={product === 'releaseNotes'}"))
assert.equal(app.includes('open={whatsNewOpen}'), false)
assert.equal(app.includes('open={updateModalOpen && Boolean(updateInfo)}'), false)
assert.ok(app.includes('open={product === \'tour\'}') || app.includes('open={product === "tour"}'))
assert.ok(app.includes("product === 'tasks'"))
assert.ok(app.includes("const showWelcome = product === 'welcome'"))
assert.equal((app.match(/data-product-layer/g) ?? []).length, 1)
assert.ok(app.includes('productBackdropCount(product)'))
assert.ok(app.includes('bindProductFocus'))
assert.ok(app.includes("target === 'releaseNotes' || target === 'systemUpdate'"))
const replayAt = app.indexOf("action === 'replayWelcome'")
const replayBody = app.slice(replayAt, app.indexOf("action === 'tour'", replayAt))
assert.ok(replayBody.includes('setWelcomeReplay(true)'))
assert.ok(replayBody.includes('setTourOpen(false)'))
assert.ok(!app.includes('window.confirm'))

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
assert.ok(unreleased.includes('（PNG-1）'))
assert.ok(unreleased.includes('Public HOLD'))
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.39')

console.log('test-png1-overlay ok')


assert.equal(isParkableProduct('quickStart'), true)
assert.equal(isParkableProduct('tour'), true)
assert.equal(isParkableProduct('systemUpdate'), false)
assert.equal(suppressParkableProduct('quickStart', { higherChrome: true }), null)
assert.equal(suppressParkableProduct('tour', { higherChrome: true }), null)
assert.equal(suppressParkableProduct('welcome', { higherChrome: true }), null)
assert.equal(suppressParkableProduct('releaseNotes', { higherChrome: true }), 'releaseNotes')
assert.equal(suppressParkableProduct('quickStart', { workspaceEditor: true }), null)
assert.equal(suppressParkableProduct('tour', { workspaceEditor: true }), null)
assert.equal(suppressParkableProduct('quickStart', { higherChrome: false, workspaceEditor: false }), 'quickStart')
assert.equal(suppressParkableProduct(null, { higherChrome: true }), null)

const featuresCss = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(featuresCss, /\.tour-root\s*\{[^}]*z-index:\s*90/)
assert.match(readFileSync('src/renderer/src/App.tsx', 'utf8'), /suppressParkableProduct/)
assert.match(readFileSync('src/renderer/src/styles.css', 'utf8'), /\.cmdp-backdrop\s*\{[^}]*z-index:\s*1500/)
console.log('test-png1-overlay: park chrome + tour z-index ok')
