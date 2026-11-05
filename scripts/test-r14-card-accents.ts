/** R14: streaming / cancelled / error left-accent hierarchy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles.css', 'utf8').replace(/\r\n/g, '\n')
assert.ok(css.includes('R14 Round14: card left accents'), 'R14 accent marker')
const start = css.indexOf('R14 Round14: card left accents')
const end = css.indexOf('@container (max-width: 230px)', start)
const block = css.slice(start, end > start ? end : start + 500)
assert.ok(block.includes('.ai-panel .msg.assistant.ai-card-streaming'), 'streaming rule')
assert.ok(block.includes('border-left: 2px solid var(--color-accent)'), 'streaming accent')
assert.ok(block.includes('.ai-panel .ai-card-cancelled'), 'cancelled rule')
assert.ok(block.includes('border-left: 2px solid var(--color-text-muted)'), 'cancelled muted')
assert.ok(block.includes('.ai-panel .msg.assistant.ai-card-error'), 'error rule')
assert.ok(block.includes('border-left: 2px solid var(--color-danger)'), 'error danger')
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R14 accent block')

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes('ai-card-streaming'), 'streaming class')
assert.ok(panel.includes('ai-card-cancelled'), 'cancelled class')
assert.ok(panel.includes('ai-card-error'), 'error class')
assert.ok(panel.includes('data-card="streaming"'), 'streaming data-card')
assert.ok(panel.includes('data-card="cancelled"'), 'cancelled data-card')
assert.ok(panel.includes('data-card="error"'), 'error data-card')

console.log('test-r14-card-accents: ok')
