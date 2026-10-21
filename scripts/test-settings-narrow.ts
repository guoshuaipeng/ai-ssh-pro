import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const css = readFileSync('src/renderer/src/features.css', 'utf8')
const cq = css.slice(css.indexOf('@container (max-width: 900px)'), css.indexOf('}', css.indexOf('.settings-body { overflow: visible')) + 1)
assert.ok(!/max-height:\s*220px/.test(cq), 'narrow nav must not have its own scroll')
assert.match(cq, /\.settings-nav \{[^}]*flex-direction: row;[^}]*flex-wrap: wrap/)
assert.match(cq, /\.settings-body \{ overflow: visible/)
assert.match(css, /\.settings-embed div\.field \{ display: grid;/)
assert.match(css, /\.settings-embed \.workspace-panel-body--settings[^{]*\{ overflow: visible/)
console.log('test-settings-narrow: 5 passed')