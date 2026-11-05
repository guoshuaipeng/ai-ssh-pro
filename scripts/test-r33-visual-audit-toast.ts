/** R33: full-page visual audit quick P2 — toast long-copy wrap + toast-action testid. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R33 Round33: miss toast long copy wraps'))
const start = css.indexOf('R33 Round33: miss toast long copy wraps')
const block = css.slice(start, start + 500)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R33 toast CSS')
assert.ok(block.includes('.toast:has(.toast-actions)'))
assert.ok(block.includes('align-items: flex-start'))
assert.ok(block.includes('min-width: 0'))
assert.ok(block.includes('flex: 1 1 auto') || block.includes('flex:1 1 auto'))

const toast = norm('src/renderer/src/lib/toast.tsx')
assert.ok(toast.includes('data-testid="toast-action"'))

const design = norm('docs/design/r33-full-page-visual-audit.md')
assert.ok(design.includes('full-page visual audit'))
assert.ok(design.includes('新开对话') || design.includes('miss'))
assert.ok(design.includes('Ask'))

const backlog = norm('docs/backlog.md')
assert.ok(
  backlog.includes('Round 33') ||
    backlog.includes('2026-11-05 Round 33') ||
    backlog.includes('整页视觉')
)

console.log('test-r33-visual-audit-toast: ok')
