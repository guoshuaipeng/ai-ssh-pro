/** Split button toggles on every click: rapid clicks and clicks after a tab switch (stale-closure regression). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applySplitToggle, decideSplitToggle } from '../src/shared/split-toggle'

assert.deepEqual(decideSplitToggle(false, 1), { next: false, toast: 'needTwo' })
assert.deepEqual(decideSplitToggle(false, 2), { next: true, toast: 'on' })
assert.deepEqual(decideSplitToggle(true, 0), { next: false, toast: 'off' })

// Model of App: the memoised handler is created once (stale closure) and only reads the live box.
let state = false
const flag = { current: false }
const render = () => { flag.current = state }
const handler = (live: number) => { const r = applySplitToggle(flag, live); if (r.toast !== 'needTwo') state = r.next; return r.toast }

// 1) rapid clicks before any re-render: on, off, on, off
assert.deepEqual([handler(2), handler(2), handler(2), handler(2)], ['on', 'off', 'on', 'off'])
assert.equal(state, false)
render()

// 2) click, switch tab (re-render without the handler being recreated), click again
assert.equal(handler(2), 'on'); render()
render() // tab switch
assert.equal(handler(2), 'off'); render()
assert.equal(state, false)
// turning off still works when the tab switch left fewer than two live sessions
assert.equal(handler(2), 'on'); render()
assert.equal(handler(1), 'off')

// 3) App wiring: decision from the live ref, ref synced each render, no stale state read
const app = readFileSync('src/renderer/src/App.tsx', 'utf8').replace(/\r\n/g, '\n')
const block = app.slice(app.indexOf("if (action === 'toggleSplit') {"), app.indexOf("if (action === 'broadcastTargets')"))
assert.match(block, /applySplitToggle\(splitEnabledRef, live\.length\)/)
assert.match(block, /if \(broadcastEnabledRef\.current\)/)
assert.doesNotMatch(block, /if \(splitEnabled\)|if \(broadcastEnabled\)/)
assert.match(app, /splitEnabledRef\.current = splitEnabled\n\s*broadcastEnabledRef\.current = broadcastEnabled/)
assert.match(app, /data-testid="tab-split"[\s\S]{0,300}onClick=\{\(\) => handleTitlebarMenuAction\('toggleSplit'\)\}/)
console.log('test-split-toggle ok')
