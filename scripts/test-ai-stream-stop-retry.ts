/** H04/H05: stop mid-stream unlocks composer; stale turns do not paint live; retry is a new submit. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8').replace(/\r\n/g, '\n')

assert.ok(panel.includes('const live = turnRef.current === turn'), 'stale turns must not paint live transcript')
assert.ok(panel.includes('H05: free the composer immediately'), 'cancelled clears busy without waiting for finally')
assert.ok(panel.includes('H05: only clear busy for this turn'), 'finally must not clear a newer turn busy')
assert.ok(/const stopGeneration = useCallback\(\(\) => \{\s*void window\.aiss\.ai\.abortChat\(\)\s*\n\s*\/\/ H05: unlock composer right away/.test(panel), 'stop unlocks composer immediately')
assert.ok(panel.includes("inputRef.current?.focus()"), 'focus composer after stop')
assert.ok(panel.includes('streaming: false'), 'streaming flag cleared on cancel/stop')

assert.match(panel, /const retryLastUser = useCallback\(\(\) => \{\s*if \(busy\) \{\s*showToast\(tg\('ai\.busyWait'\)/)
assert.ok(panel.includes('void submitToAi(row.content)'), 'retry calls submitToAi (new turn)')

const taStart = panel.indexOf('<textarea\n')
assert.ok(taStart > 0)
const taEnd = panel.indexOf('/>', taStart)
const ta = panel.slice(taStart, taEnd)
assert.equal(/disabled=\{busy\}/.test(ta), false, 'textarea must stay typable during/after stream')
assert.ok(panel.includes("data-testid=\"ai-stop\"") && panel.includes('onClick={stopGeneration}'))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'ai.cancelled':"))
assert.ok(i18n.includes("ai.busyWait': '请先停止生成再继续'"))

console.log('test-ai-stream-stop-retry ok')
