/** S41b: tab-bar split popover: off / side by side / top and bottom, every transition, from live refs. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applySplitMode, applySplitToggle, splitModeOf, type SplitMode, type SplitOrientation } from '../src/shared/split-toggle'

// App model: memoised picker reads only the live boxes; render() syncs them from state.
let enabled = false
let orientation: SplitOrientation = 'horizontal'
const flag = { current: false }
const orient = { current: 'horizontal' as SplitOrientation }
const render = () => { flag.current = enabled; orient.current = orientation }
const pick = (m: SplitMode, live = 2) => {
  const r = applySplitMode(flag, orient, live, m)
  if (r.toast !== 'needTwo' && r.toast !== 'noop') { enabled = r.enabled; orientation = r.orientation }
  return r.toast
}
const mode = () => splitModeOf(enabled, orientation)

// all six transitions between the three modes
assert.equal(pick('horizontal'), 'on'); render(); assert.equal(mode(), 'horizontal')
assert.equal(pick('vertical'), 'orient'); render(); assert.equal(mode(), 'vertical')
assert.equal(pick('off'), 'off'); render(); assert.equal(mode(), 'off')
assert.equal(pick('vertical'), 'on'); render(); assert.equal(mode(), 'vertical')
assert.equal(pick('horizontal'), 'orient'); render(); assert.equal(mode(), 'horizontal')
assert.equal(pick('off'), 'off'); render(); assert.equal(mode(), 'off')
// picking the current mode is a no-op; off while off is a no-op
assert.equal(pick('off'), 'noop')
assert.equal(pick('horizontal'), 'on'); render()
assert.equal(pick('horizontal'), 'noop'); assert.equal(mode(), 'horizontal')
// rapid picks before any re-render still alternate correctly
assert.deepEqual([pick('vertical'), pick('off'), pick('horizontal'), pick('vertical')], ['orient', 'off', 'on', 'orient'])
render(); assert.equal(mode(), 'vertical')
// need two live sessions to turn on; turning off never needs them
assert.equal(pick('off', 0), 'off'); render()
assert.equal(pick('horizontal', 1), 'needTwo'); assert.equal(mode(), 'off')
// keyboard / menu toggleSplit shares the same live flag and keeps the chosen orientation
orientation = 'vertical'; render()
assert.equal(applySplitToggle(flag, 2).toast, 'on'); enabled = true; render()
assert.equal(mode(), 'vertical')
assert.equal(pick('off'), 'off')

// wiring: popover entry, live refs, strip no longer has its own orientation / close buttons
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const menu = readFileSync('src/renderer/src/components/SplitModeMenu.tsx', 'utf8')
const split = readFileSync('src/renderer/src/components/SplitTerminalView.tsx', 'utf8')
assert.match(app, /applySplitMode\(splitEnabledRef, splitOrientationRef, live\.length, target\)/)
assert.match(app, /splitOrientationRef\.current = splitOrientation/)
assert.match(app, /const pickSplitMode = useCallback\(\(target: SplitMode\) => \{[\s\S]{0,1200}\}, \[\]\)/)
assert.match(menu, /role="menuitemradio"\s*aria-checked=\{m === mode\}/)
assert.match(menu, /\{m === mode \? '✓' : ''\}/)
assert.match(menu, /title=\{tg\('s41\.modeTip', \{ mode: current \}\)\}/)
assert.match(menu, /<SplitModeIcon mode=\{mode\} \/>/)
assert.match(menu, /wrapRef\.current && !wrapRef\.current\.contains\(e\.target as Node\)/)
assert.ok(!split.includes('split-orient') && !split.includes('split-close'))
console.log('test-split-mode ok')
