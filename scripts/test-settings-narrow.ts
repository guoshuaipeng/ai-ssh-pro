import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const css = readFileSync('src/renderer/src/features.css', 'utf8')
const start = css.indexOf('/* c49 ST3b')
assert.ok(start > 0, 'narrow settings block present')
const cq = css.slice(start, css.indexOf('\n}', start))
assert.ok(!/max-height:\s*220px/.test(cq), 'narrow nav must not have its own scroll')
assert.ok(!/flex-direction:\s*row|flex-wrap:\s*wrap/.test(cq), 'narrow nav must not wrap to rows')
assert.match(cq, /\.settings-nav \{ width: 128px; flex-direction: column/)
assert.ok(!cq.includes('.settings-shell { flex-direction: column'), 'nav stays beside the body')
assert.match(css, /\.settings-embed div\.field \{ display: grid;/)
assert.match(css, /\.settings-embed \.workspace-panel-body--settings[^{]*\{ overflow: visible/)
console.log('test-settings-narrow: 7 passed')