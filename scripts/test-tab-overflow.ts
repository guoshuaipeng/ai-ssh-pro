/** P3-TO: tab strip scrollbar, wheel, arrows, and the ⌄ overflow list. Package stays 0.4.4. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'
import {
  TAB_MAX_WIDTH_PX,
  TAB_MIN_WIDTH_PX,
  TAB_STRIP_NUDGE,
  tabItemFlex,
  tabOverflowMark,
  tabStripChrome,
  tabStripNudgePx,
  tabStripRevealDelta,
  tabStripWheelDelta,
  tabWidthKeepsLabel
} from '../src/shared/tab-overflow'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.52')

assert.equal(tabOverflowMark(0), '⌄')
assert.equal(tabOverflowMark(3), '⌄ 3')
assert.equal(tabOverflowMark(12), '⌄ 12')
assert.equal(tabOverflowMark(-4), '⌄')
assert.equal(tabOverflowMark(Number.NaN), '⌄')
assert.equal(tabOverflowMark(3).includes('⋯'), false)
assert.equal(tabOverflowMark(3).includes('更多'), false)

assert.deepEqual(tabStripChrome(false), { arrows: false, menu: false })
assert.deepEqual(tabStripChrome(true), { arrows: true, menu: true })

assert.equal(tabStripWheelDelta(0, 120), 120)
assert.equal(tabStripWheelDelta(0, -40), -40)
assert.equal(tabStripWheelDelta(80, 10), 80)
assert.equal(tabStripWheelDelta(10, 80), 80)
assert.equal(tabStripWheelDelta(0, 0), 0)

assert.equal(tabStripNudgePx(0, TAB_STRIP_NUDGE), TAB_STRIP_NUDGE)
assert.equal(tabStripNudgePx(80, TAB_STRIP_NUDGE), TAB_STRIP_NUDGE)
assert.equal(tabStripNudgePx(400, TAB_STRIP_NUDGE), 340)
assert.ok(tabStripNudgePx(1000) >= 120)

assert.equal(tabStripRevealDelta({ tabLeft: 20, tabRight: 90, clientWidth: 200 }), 0)
assert.equal(tabStripRevealDelta({ tabLeft: 180, tabRight: 280, clientWidth: 200, pad: 8 }), 88)
assert.equal(tabStripRevealDelta({ tabLeft: -40, tabRight: 40, clientWidth: 200, pad: 8 }), -48)
assert.equal(tabStripRevealDelta({ tabLeft: -10, tabRight: 400, clientWidth: 200, pad: 8 }), -18)
assert.equal(tabStripRevealDelta({ tabLeft: 0, tabRight: 10, clientWidth: 0 }), 0)

assert.equal(tabItemFlex(), '0 0 auto')
assert.ok(TAB_MIN_WIDTH_PX >= 180)
assert.ok(TAB_MAX_WIDTH_PX >= TAB_MIN_WIDTH_PX)
assert.equal(tabWidthKeepsLabel(TAB_MIN_WIDTH_PX), true)
assert.equal(tabWidthKeepsLabel(172), false)
assert.equal(tabWidthKeepsLabel(112), false)
assert.equal(tabWidthKeepsLabel(96), false)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const changelog = readFileSync('CHANGELOG.md', 'utf8')

const barRule = styles.slice(styles.indexOf('.tab-bar {'), styles.indexOf('.tab-bar-scroll {'))
assert.match(barRule, /height:\s*36px/)
assert.match(barRule, /max-height:\s*36px/)
assert.match(barRule, /flex-wrap:\s*nowrap/)
assert.match(barRule, /overflow:\s*hidden/)
assert.doesNotMatch(barRule, /flex-wrap:\s*wrap\b/)

const scrollRule = styles.slice(styles.indexOf('.tab-bar-scroll {'), styles.indexOf('.tab-bar-scroll::-webkit-scrollbar'))
assert.match(scrollRule, /overflow-x:\s*auto/)
assert.match(scrollRule, /overflow-y:\s*hidden/)
assert.match(scrollRule, /flex-wrap:\s*nowrap/)
assert.match(scrollRule, /scrollbar-width:\s*none\s*!important/)
assert.match(styles, /\.tab-bar-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none\s*!important/)
assert.match(styles, /\.tab-bar-scroll::-webkit-scrollbar\s*\{[^}]*height:\s*0\s*!important/)
assert.match(styles, /\.tab-scroll-btn\s*\{[^}]*width:\s*24px/)
assert.match(styles, /\.tab-scroll-btn\s*\{[^}]*height:\s*24px/)
assert.match(styles, /\.tab-overflow-btn\s*\{[^}]*white-space:\s*nowrap/)
assert.match(styles, /\.tab-overflow-btn\s*\{[^}]*height:\s*24px/)
assert.match(styles, /\.tab-overflow-mark\s*\{[^}]*white-space:\s*nowrap/)

const itemRule = styles.slice(styles.indexOf('.tab-bar-scroll > .tab {'), styles.indexOf('.tab-bar-scroll > .tab.active'))
assert.match(itemRule, /flex:\s*0\s*0\s*auto/)
assert.doesNotMatch(itemRule, /flex:\s*0\s*1\s*auto/)
assert.match(itemRule, new RegExp(`min-width:\\s*${TAB_MIN_WIDTH_PX}px`))
assert.match(itemRule, new RegExp(`max-width:\\s*${TAB_MAX_WIDTH_PX}px`))
const narrowTabs = styles.slice(styles.indexOf('@media (max-width: 1024px)'), styles.indexOf('.tab-scroll-btn'))
assert.doesNotMatch(narrowTabs, /\.tab-bar-scroll > \.tab/)
assert.equal(styles.includes('min-width: 112px'), false)

assert.ok(app.includes('tabStripWheelDelta(e.deltaX, e.deltaY, e.deltaMode, scroll.clientWidth)'))
assert.ok(app.includes('scrollLeft += delta') && app.includes('capture: true, passive: false'))
assert.ok(app.includes('data-testid="tab-scroll-left"') && app.includes('data-testid="tab-scroll-right"'))
assert.ok(app.includes('disabled={!tabFade.left}') && app.includes('disabled={!tabFade.right}'))
assert.ok(app.includes('tabStripNudgePx(el.clientWidth, TAB_STRIP_NUDGE)'))
assert.ok(app.includes('tabStripRevealDelta(') && app.includes('data-tab-id={t.tabId}'))
assert.ok(app.includes('revealTab(hit.tabId)') && app.includes('revealTab(t.tabId)'))

const bar = app.slice(app.indexOf('className="tab-bar"'), app.indexOf('data-testid="broadcast-bar"'))
const scrollAt = bar.indexOf('data-testid="tab-bar-scroll"')
assert.ok(scrollAt > bar.indexOf('data-testid="alert-bell"'))
assert.ok(scrollAt > bar.indexOf('data-testid="broadcast-badge"'))
const scrollBlock = bar.slice(scrollAt, bar.indexOf('data-testid="tab-scroll-right"'))
assert.equal(scrollBlock.includes('alert-bell'), false)
assert.equal(scrollBlock.includes('broadcast-badge'), false)

const overflowBtn = app.slice(app.indexOf('data-testid="tab-overflow"'), app.indexOf('data-testid="tab-overflow-menu"'))
assert.ok(overflowBtn.includes('tabOverflowMark(tabHiddenCount)'))
assert.ok(overflowBtn.includes("tr('tab.overflow'"))
assert.equal(overflowBtn.includes('⋯'), false)
assert.equal(overflowBtn.includes('更多'), false)
assert.ok(toolbar.includes('⋯'))
assert.equal(toolbar.includes('toolbar.more'), false)
assert.equal(toolbar.includes('更多'), false)
assert.ok(toolbar.includes('toolbar.overflow'))

assert.equal(zh('tab.overflow', { n: 12, hidden: 3 }), '所有标签（12）· 3 个未显示')
assert.equal(en('tab.overflow', { n: 12, hidden: 3 }), 'All tabs (12) · 3 hidden')
assert.equal(zh('tab.list.title', { n: 4 }), '所有标签（4）')
assert.equal(en('tab.list.title', { n: 4 }), 'All tabs (4)')
assert.equal(zh('tab.scrollLeft'), '向左滚动标签')
assert.equal(en('tab.scrollRight'), 'Scroll tabs right')

const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
assert.ok(unreleased.includes('P3-TO'))
assert.ok(unreleased.includes('⌄'))
assert.equal(pkg.version, '0.6.52')

console.log('test-tab-overflow ok')
