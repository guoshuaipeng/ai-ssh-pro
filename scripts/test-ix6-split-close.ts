/** IX-6: split focus visibility and close chords. Pure Node, no host rg. Package stays 0.4.4. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CLOSE_OTHERS_KEEP_ZH, CLOSE_TIP_TERMINAL_ZH, CLOSE_TIP_ZH, closeControlTipKey } from '../src/shared/close-tab'
import { isShellReservedKey, matchKeymap } from '../src/shared/keymap'
import { reduceSplitFocus, splitPaneClass, splitSideCurrent, type SplitSide } from '../src/shared/split-focus'
import { buildTabMenu, type TabMenuCtx } from '../src/shared/inline-menus'
import { closeOthers } from '../src/shared/tab-actions'
import { tabStripChrome } from '../src/shared/tab-overflow'

const ev = (keys: string) => {
  const parts = keys.split('+')
  const k = parts[parts.length - 1]!
  const code = /^[A-Z]$/.test(k) ? `Key${k}` : k
  return { key: k, code, ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt'), metaKey: false }
}

let side: SplitSide = 'left'
assert.equal(splitSideCurrent('left', side), 'true')
assert.equal(splitSideCurrent('right', side), undefined)
assert.equal(splitPaneClass('left', side).includes('is-focused'), true)
assert.equal(splitPaneClass('right', side).includes('is-focused'), false)
side = reduceSplitFocus(side, 'right')
assert.equal(side, 'right')
assert.equal(splitSideCurrent('right', side), 'true')
assert.equal(splitSideCurrent('left', side), undefined)
assert.equal(splitPaneClass('right', side), 'split-pane is-focused')
side = reduceSplitFocus(side, 'left')
assert.equal(splitSideCurrent('left', side), 'true')
assert.equal(splitPaneClass('right', side).includes('is-focused'), false)

assert.equal(matchKeymap(ev('Ctrl+W'), true), undefined, 'Ctrl+W stays with the shell')
assert.equal(isShellReservedKey(ev('Ctrl+W')), true)
assert.equal(matchKeymap(ev('Ctrl+Shift+W'), true), 'closeTab')
assert.equal(matchKeymap(ev('Ctrl+W'), false), 'closeTab')
assert.equal(matchKeymap(ev('Ctrl+Shift+W'), false), 'closeTab')
assert.equal(closeControlTipKey(true), 'tab.closeTipTerminal')
assert.equal(closeControlTipKey(false), 'tab.closeTip')

const tabs = [
  { id: 'home', view: 'home', seq: 1 },
  { id: 'cur', view: 'session', seq: 2 },
  { id: 'pin', view: 'monitor', seq: 3, pinned: true },
  { id: 'pin2', view: 'sftp', seq: 4, pinned: true },
  { id: 'gone', view: 'file-diff', seq: 5 },
  { id: 'also', view: 'audit', seq: 6 }
]
assert.deepEqual(closeOthers(tabs, 'cur').sort(), ['also', 'gone'])
assert.deepEqual(closeOthers(tabs, 'pin').sort(), ['also', 'cur', 'gone'])
const fromHome = closeOthers(tabs, 'home')
assert.equal(fromHome.includes('home'), false)
assert.equal(fromHome.includes('pin'), false)
assert.equal(fromHome.includes('pin2'), false)
assert.deepEqual(fromHome.sort(), ['also', 'cur', 'gone'])
assert.deepEqual(closeOthers([{ id: 'only', view: 'session', seq: 1 }], 'only'), [])

const tabCtx: TabMenuCtx = {
  pinned: false,
  readOnlyOn: false,
  canDuplicate: false,
  canSessionTools: false,
  canForward: false,
  closeOthersDisabled: false,
  closeRightDisabled: true
}
const closeOthersItem = buildTabMenu(tabCtx).find((node) => node.type === 'item' && node.id === 'closeOthers')
assert.equal(closeOthersItem && closeOthersItem.type === 'item' ? closeOthersItem.hintKey : '', 'tab.closeOthersKeep')

assert.deepEqual(tabStripChrome(true), { arrows: true, menu: true })
assert.deepEqual(tabStripChrome(false), { arrows: false, menu: false })

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const split = readFileSync('src/renderer/src/components/SplitTerminalView.tsx', 'utf8')
const menus = readFileSync('src/shared/inline-menus.ts', 'utf8')
const built = readFileSync('src/renderer/src/components/BuiltMenu.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
const changelog = readFileSync('CHANGELOG.md', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }

assert.ok(i18n.includes(`'tab.closeTip': '${CLOSE_TIP_ZH}'`))
assert.ok(i18n.includes(`'tab.closeTipTerminal': '${CLOSE_TIP_TERMINAL_ZH}'`))
assert.ok(i18n.includes(`'tab.closeOthersKeep': '${CLOSE_OTHERS_KEEP_ZH}'`))
assert.ok(i18n.includes("'tab.closeTip': 'Ctrl+W Close'"))
assert.ok(i18n.includes("'tab.closeTipTerminal': 'Ctrl+Shift+W Close tab'"))
assert.ok(i18n.includes("'tab.closeOthersKeep': 'Keeps current, pinned, and Ops home'"))

assert.match(app, /closeControlTipKey\(terminalFocused\)/)
assert.equal(app.split('title={closeTip}').length - 1, 2)
assert.match(app, /closest\('\.xterm'\)/)
const closeBranch = app.slice(app.indexOf("if (action === 'closeTab')"), app.indexOf('// UX-45'))
assert.match(closeBranch, /isDialogOpen\(\)/)
assert.match(closeBranch, /closeTabRef\.current/)
assert.match(menus, /hintKey: 'tab\.closeOthersKeep'/)
assert.match(built, /tab-menu-hint/)
assert.match(features, /\.tab-context-menu button \.tab-menu-hint\s*\{[^}]*color:\s*var\(--color-text-muted\)/)

const slot = split.slice(split.indexOf('function SplitPaneSlot'), split.indexOf('export default function'))
const paneOpen = slot.indexOf('className={splitPaneClass')
const handler = slot.indexOf('onMouseDownCapture')
const body = slot.indexOf('split-pane-body')
assert.ok(paneOpen >= 0 && handler > paneOpen && body > handler, 'content click uses the pane handler, not only the tab')
assert.match(slot, /onFocusSide\(side\)/)
assert.match(split, /reduceSplitFocus/)
assert.match(slot, /aria-current=\{current\}/)
assert.match(slot, /split-pane-tab/)
assert.match(styles, /\.split-pane\.is-focused \.split-pane-tab\s*\{[^}]*border-top:\s*2px solid var\(--color-accent\)/)
assert.match(styles, /\.split-pane-tab\s*\{[^}]*border-top:\s*2px solid transparent/)

const barRule = styles.slice(styles.indexOf('.tab-bar {'), styles.indexOf('.tab-bar-scroll {'))
assert.match(barRule, /height:\s*36px/)
assert.match(barRule, /max-height:\s*36px/)
assert.match(barRule, /flex-wrap:\s*nowrap/)
assert.match(barRule, /overflow:\s*hidden/)
assert.ok(app.includes('tabStripWheelDelta('))
assert.ok(app.includes('data-testid="tab-overflow"'))

assert.equal(pkg.version, '0.6.55')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-ix6-split-close\.ts/)
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
/** Title line only (`- **…（IX-N）.**`). A body cross-ref must not count. */
function unreleasedBulletAt(section: string, id: string): number {
  const m = new RegExp(`^- \\*\\*[^\\n*]*（${id}）`, 'm').exec(section)
  return m ? m.index : -1
}
const ix6 = unreleasedBulletAt(unreleased, 'IX-6')
const ix5 = unreleasedBulletAt(unreleased, 'IX-5')
assert.ok(ix6 >= 0 && ix5 > ix6, 'IX-6 sits in Unreleased ahead of IX-5')
const bullet = unreleased.slice(ix6, ix5)
assert.match(bullet, /Public HOLD/)
assert.match(bullet, /0\.4\.4/)
assert.match(bullet, /Ctrl\+Shift\+W/)
assert.match(bullet, /aria-current/)
assert.match(bullet, /关闭其他/)

console.log('test-ix6-split-close ok')
