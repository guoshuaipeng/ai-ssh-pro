/** Polish-3 soft-start: tab bar TB-1 scrollbar, TB-2 wheel, TB-3 arrows and ⋯ menu. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TAB_STRIP_NUDGE, TAB_WHEEL_LINE_PX, tabStripChrome, tabStripWheelDelta } from '../src/shared/tab-overflow'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.52')

assert.deepEqual(tabStripChrome(false), { arrows: false, menu: false })
assert.deepEqual(tabStripChrome(true), { arrows: true, menu: true })

assert.equal(tabStripWheelDelta(0, 120), 120)
assert.equal(tabStripWheelDelta(0, -40), -40)
assert.equal(tabStripWheelDelta(80, 10), 80)
assert.equal(tabStripWheelDelta(0, 0), 0)
assert.equal(tabStripWheelDelta(0, 1, 1), TAB_WHEEL_LINE_PX)
assert.equal(tabStripWheelDelta(0, -2, 1), -2 * TAB_WHEEL_LINE_PX)
assert.equal(tabStripWheelDelta(3, 1, 1), 3 * TAB_WHEEL_LINE_PX)
assert.equal(tabStripWheelDelta(0, 1, 2, 400), 400)
assert.equal(tabStripWheelDelta(0, -1, 2, 0), -320)
assert.equal(TAB_STRIP_NUDGE, 160)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const changelog = readFileSync('CHANGELOG.md', 'utf8')

assert.equal(/\bwindow\.confirm\b|\bwindow\.alert\b|\bwindow\.prompt\b/.test(app), false)

const scrollRule = styles.slice(styles.indexOf('.tab-bar-scroll {'), styles.indexOf('.tab-bar-scroll::-webkit-scrollbar'))
assert.match(scrollRule, /overflow-x:\s*auto/)
assert.match(scrollRule, /overflow-y:\s*hidden/)
assert.match(scrollRule, /scrollbar-width:\s*none\s*!important/)
assert.match(scrollRule, /margin-bottom:\s*-16px/)
assert.match(scrollRule, /padding-bottom:\s*(16px|var\(--space-4\))/)
assert.match(styles, /\.tab-bar-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none\s*!important/)
assert.match(styles, /\.tab-bar\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.tab-bar\s*\{[^}]*height:\s*36px/)
assert.match(styles, /\.tab-bar\s*\{[^}]*max-height:\s*36px/)
assert.match(styles, /\.tab-bar\s*\{[^}]*overflow:\s*hidden/)
assert.match(styles, /\.tab-scroll-btn\s*\{[^}]*white-space:\s*nowrap/)
assert.match(styles, /\.tab-scroll-btn\s*\{[^}]*flex-shrink:\s*0/)
assert.match(styles, /\.tab-overflow-btn\s*\{[^}]*white-space:\s*nowrap/)
assert.match(styles, /\.tab-overflow-btn\s*\{[^}]*width:\s*28px/)
assert.match(styles, /\.tab-overflow-btn\s*\{[^}]*height:\s*24px/)

assert.ok(app.includes('tabStripChrome(tabStripOverflowing)'))
assert.ok(app.includes('tabChrome.arrows'))
assert.ok(app.includes('tabStripChrome(tabStripOverflowing)'))
assert.ok(app.includes('data-testid="tab-scroll-left"') && app.includes('data-testid="tab-scroll-right"'))
assert.ok(app.includes('data-testid="tab-bar-scroll"') && app.includes('data-testid="tab-overflow"'))
assert.ok(app.includes('tabStripWheelDelta(e.deltaX, e.deltaY, e.deltaMode, scroll.clientWidth)'))
assert.ok(app.includes('scrollLeft += delta') && app.includes('capture: true, passive: false'))
assert.ok(app.includes('TAB_STRIP_NUDGE'))

const overflowBtn = app.slice(app.indexOf('data-testid="tab-overflow"'), app.indexOf('data-testid="tab-overflow-menu"'))
assert.ok(overflowBtn.includes('tabOverflowMark(tabHiddenCount)'))
assert.equal(overflowBtn.includes('⋯'), false)
assert.ok(overflowBtn.includes('data-hidden={tabHiddenCount}'))
assert.ok(overflowBtn.includes("tr('tab.overflow'"))

const overflowMenu = app.slice(app.indexOf('data-testid="tab-overflow-menu"'), app.indexOf('data-testid="broadcast-bar"'))
assert.ok(overflowMenu.includes('setActiveTabId(t.tabId)') || overflowMenu.includes('setActiveTabId(hit.tabId)'))
assert.ok(overflowMenu.includes('closeTab('))
assert.ok(overflowMenu.includes('labelFor(t)'))
assert.ok(overflowMenu.includes('aria-current'))
assert.equal(overflowMenu.includes('{t.title}'), false)

assert.equal(zh('tab.scrollLeft'), '向左滚动标签')
assert.equal(en('tab.scrollLeft'), 'Scroll tabs left')
assert.equal(zh('tab.scrollRight'), '向右滚动标签')
assert.equal(en('tab.scrollRight'), 'Scroll tabs right')
assert.equal(zh('tab.overflow', { n: 12, hidden: 3 }), '所有标签（12）· 3 个未显示')
assert.equal(en('tab.overflow', { n: 12, hidden: 3 }), 'All tabs (12) · 3 hidden')
assert.equal(zh('tab.list.title', { n: 4 }), '所有标签（4）')
assert.equal(en('tab.list.title', { n: 4 }), 'All tabs (4)')

const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
assert.ok(unreleased.includes('Polish-3') && unreleased.includes('TB-1') && unreleased.includes('TB-2') && unreleased.includes('TB-3'))
assert.ok(unreleased.includes('⋯'))
assert.ok(unreleased.includes('L9') && unreleased.includes('S4'))
assert.ok(unreleased.includes('A-TFL') && unreleased.includes('S15'))
assert.ok(unreleased.includes('A-OM') && unreleased.includes('A-HITL'))
assert.ok(unreleased.includes('Core-A'))
assert.ok(unreleased.includes('Polish-2'))
assert.equal(pkg.version, '0.6.52')

console.log('test-polish-3 ok')
