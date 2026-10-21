/** S41: split controls in the pane strips; themed Select; icon buttons with reasons; broadcast switch; live-ref close. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const split = readFileSync('src/renderer/src/components/SplitTerminalView.tsx', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const css = readFileSync('src/renderer/src/features.css', 'utf8')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(!split.includes('split-toolbar'), 'no separate toolbar row')
assert.ok(!/<select\b/.test(split), 'no native select')
assert.match(split, /<Select[\s\S]{0,300}testId="split-second"/)
assert.match(split, /role="switch"\s*aria-checked=\{broadcastEnabled\}/)
assert.match(split, /onClick=\{\(\) => onToggleBroadcast\?\.\(\)\}/)
for (const id of ['split-swap', 'split-equal']) assert.ok(split.includes(`testId="${id}"`), id)
// S41b: orientation and close moved to the tab-bar mode popover (single entry)
for (const id of ['split-orient', 'split-close']) assert.ok(!split.includes(`testId="${id}"`), id)
assert.match(split, /const orientation = orientationProp \?\? defaultOrientation/)
// disabled buttons keep a tooltip on a wrapper
assert.match(split, /disabled \? <span className="split-icon-wrap" title=\{tip\}>/)
assert.match(split, /tip=\{swapTip\} disabled=\{!secondary\}/)
// role badge follows the session, not the side
assert.match(split, /role=\{secondIsA \? 'secondary' : 'primary'\}/)
assert.match(split, /role=\{secondIsA \? 'primary' : 'secondary'\}/)
// strip controls don't hand focus to xterm
assert.match(split, /!target\.closest\('button, \.split-pane-ctl'\)/)
// close/broadcast go through the live-ref menu path (splitEnabledRef fix stays intact)
assert.match(app, /orientation=\{splitOrientation\}/)
assert.match(app, /onToggleBroadcast=\{\(\) => handleTitlebarMenuActionRef\.current\('toggleBroadcast'\)\}/)
assert.match(app, /applySplitToggle\(splitEnabledRef, live\.length\)/)
// visuals: focus frame, broadcast frame in warn, tokens only
assert.match(css, /\.split-pane\.is-focused \.split-pane-body \{ box-shadow: inset 0 0 0 1px var\(--color-accent\); \}/)
assert.match(css, /\.split-view\.is-broadcast \.split-pane-body \{ box-shadow: inset 0 0 0 1px var\(--color-warn\); \}/)
const block = css.slice(css.indexOf('/* S41:'))
assert.doesNotMatch(block, /(padding|gap|font-size):[^;]*\b(4|8|12|16|24|32)px/)
for (const k of ['s41.primary', 's41.secondary', 's41.swapDisabled', 's41.bcOn', 's41.bcOff', 's41.modeOff', 's41.modeH', 's41.modeV', 's41.modeTip']) assert.equal(i18n.split(`'${k}'`).length - 1, 2, k)
console.log('test-split-s41 ok')
