import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { followDims } from '../src/shared/pty-follow'
// D104
assert.deepEqual(followDims({ cols: 60, rows: 30 }, { cols: 120, rows: 40 }), { cols: 120, rows: 30 })
assert.equal(followDims(undefined, { cols: 120, rows: 40 }), null)
assert.equal(followDims({ cols: 60, rows: 30 }, undefined), null)
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
assert.equal((tp.match(/ssh\.resize\(/g) || []).length, 1, 'only syncSize resizes the PTY')
assert.match(tp, /if \(followRef\.current\) \{[\s\S]{0,260}return\s*\}\s*f\.fit\(\)\s*reportPtySize/)
const sv = readFileSync('src/renderer/src/components/SplitTerminalView.tsx', 'utf8')
assert.match(sv, /follow=\{secondIsA && a\.id === sessionId\}/)
assert.match(sv, /follow=\{!secondIsA && b\.id === sessionId\}/)
assert.match(sv, /followPtySize=\{follow\}/)
// D105
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /<SplitModeMenu variant="status" mode=\{splitModeOf\(splitEnabled, splitOrientation\)\} onPick=\{pickSplitMode\} \/>/)
const mm = readFileSync('src/renderer/src/components/SplitModeMenu.tsx', 'utf8')
assert.match(mm, /data-testid=\{isStatus \? 'statusbar-split' : 'tab-split'\}/)
assert.match(mm, /bottom: window\.innerHeight - r\.top \+ 6/)
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.splitTip': '当前：{mode}。点击切换分屏模式或关闭分屏'"))
assert.ok(i18n.includes("'sb.splitTip': 'Current: {mode}. Click to change or close split view'"))
// D106
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /--z-term-overlay: 6; --z-term-bar: 8; --z-menu: 10000;/)
assert.match(css, /\.terminal-pane-wrap \.terminal-find-bar \{ z-index: var\(--z-term-bar\); \}/)
assert.match(css, /body > \.titlebar-popover\.split-mode-menu \{ z-index: var\(--z-menu\); \}/)
console.log('test-cycle43 ok')
