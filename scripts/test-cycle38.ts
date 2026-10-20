import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { wheelZoomStep } from '../src/shared/wheel-zoom'
import { typeAheadIndex } from '../src/shared/select-nav'
const rd = (p: string) => readFileSync(p, 'utf8')
// D97
const ai = rd('src/renderer/src/components/AIPanel.tsx')
const rf = ai.slice(ai.indexOf('data-testid="ai-cmd-refill"') - 500, ai.indexOf('data-testid="ai-cmd-refill"') + 600)
assert.match(rf, /conversation && activeSessionId/)
assert.match(rf, /fillCommandBar\(activeSessionId/)
assert.doesNotMatch(rf, /runSuggestedCommand|confirmStep/, 'fill only, never run')
// D99
assert.deepEqual(wheelZoomStep(0, -100), { step: 1, acc: 0 })
assert.deepEqual(wheelZoomStep(0, 100), { step: -1, acc: 0 })
assert.deepEqual(wheelZoomStep(0, -10), { step: 0, acc: -10 })
assert.equal(wheelZoomStep(-45, -10).step, 1)
const tp = rd('src/renderer/src/components/TerminalPane.tsx')
assert.match(tp, /if \(!ev\.ctrlKey \|\| ev\.shiftKey/)
assert.match(tp, /removeEventListener\('wheel', onWheelZoom/)
assert.match(rd('src/renderer/src/App.tsx'), /aiss-term-zoom[\s\S]{0,40}onZoom|'zoomIn' : 'zoomOut'/)
// D100
const names = ['app.log', 'bin', 'boot', 'etc'].map((label) => ({ label }))
assert.equal(typeAheadIndex(names, 'b', 0), 1)
assert.equal(typeAheadIndex(names, 'b', 1), 2)
assert.equal(typeAheadIndex(names, 'bo', 1), 2)
const sp = rd('src/renderer/src/components/SftpPanel.tsx')
const k = sp.slice(sp.indexOf('const onPaneKey'), sp.indexOf('const switchDrive'))
assert.ok(k.indexOf("tag === 'INPUT'") < k.indexOf('D100'), 'inputs keep their keys')
for (const key of ['d97.fill', 'd97.tip', 'd100.selectedAll']) assert.equal(rd('src/renderer/src/lib/i18n.tsx').split(`'${key}'`).length - 1, 2, key)
console.log('test-cycle38 ok')
