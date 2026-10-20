import assert from 'node:assert/strict'
import { shouldHintBlocks, BLOCKS_HINT_AFTER } from '../src/shared/blocks-hint'
import { BLOCKS_DEFAULT_ON, startBlock, finishBlock } from '../src/shared/terminal-blocks'
import { fromStored, mergeForSave, parseStored, searchBlocks, toStored, BLOCK_HIST_MAX, BLOCK_HIST_OUTPUT_MAX } from '../src/shared/block-history'
import { advanceScript, scriptSteps } from '../src/shared/ai-script'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }

ok('D18 blocks stay default off', () => assert.equal(BLOCKS_DEFAULT_ON, false))
ok('D18 hint once, after a few real commands, not in demo', () => {
  const base = { enabled: false, shown: false, submitted: BLOCKS_HINT_AFTER, demo: false }
  assert.equal(shouldHintBlocks(base), true)
  assert.equal(shouldHintBlocks({ ...base, submitted: BLOCKS_HINT_AFTER - 1 }), false)
  assert.equal(shouldHintBlocks({ ...base, shown: true }), false)
  assert.equal(shouldHintBlocks({ ...base, enabled: true }), false)
  assert.equal(shouldHintBlocks({ ...base, demo: true }), false)
})
ok('D17 store finished blocks only, tail-capped, max N', () => {
  let b = startBlock([], 'ls', 1)
  b = finishBlock(b, 0)
  b = startBlock(b, 'tail -f x', 2)
  b[0] = { ...b[0]!, output: 'x'.repeat(BLOCK_HIST_OUTPUT_MAX + 50) + 'END' }
  const s = toStored(b, 5)
  assert.equal(s.length, 1)
  assert.equal(s[0]!.output.length, BLOCK_HIST_OUTPUT_MAX)
  assert.ok(s[0]!.output.endsWith('END'))
  const many = Array.from({ length: 50 }, (_, i) => ({ command: 'c' + i, output: '', exitCode: 0, at: i }))
  assert.equal(mergeForSave(many.slice(0, 25), many.slice(25)).length, BLOCK_HIST_MAX)
  assert.equal(mergeForSave(many.slice(0, 25), many.slice(25)).at(-1)!.command, 'c49')
})
ok('D17 parse is defensive; restored blocks collapsed + marked', () => {
  assert.deepEqual(parseStored('bad'), [])
  assert.deepEqual(parseStored('[{"command":1}]'), [])
  const r = fromStored(parseStored('[{"command":"df -h","output":"/dev/sda1","exitCode":0,"at":1}]'))
  assert.equal(r[0]!.restored, true)
  assert.equal(r[0]!.collapsed, true)
  assert.equal(r[0]!.running, false)
})
ok('D17 search command or output, case-insensitive', () => {
  const bl = [{ command: 'df -h', output: '/dev/sda1 82%' }, { command: 'free -m', output: 'Mem: 7.6G' }]
  assert.deepEqual(searchBlocks(bl, ''), [0, 1])
  assert.deepEqual(searchBlocks(bl, 'MEM'), [1])
  assert.deepEqual(searchBlocks(bl, 'sda'), [0])
  assert.deepEqual(searchBlocks(bl, 'zzz'), [])
})
ok('D16b script steps', () => {
  assert.deepEqual(scriptSteps('# look\nsystemctl status nginx\n$ journalctl -u nginx -n 50\n', 'bash'), ['systemctl status nginx', 'journalctl -u nginx -n 50'])
  assert.equal(scriptSteps('ls', 'bash'), null)
  assert.equal(scriptSteps('a\nb', 'python'), null)
  assert.equal(scriptSteps('cat <<EOF\nx\nEOF', 'bash'), null)
  assert.equal(scriptSteps('ls \\\n -l', 'bash'), null)
  assert.equal(scriptSteps('for f in *; do\necho $f\ndone', 'bash'), null)
  assert.equal(scriptSteps('if true; then\necho 1\nfi', 'sh'), null)
  assert.equal(scriptSteps('ps aux |\ngrep x', 'sh'), null)
})
ok('D16b advance only on the current step', () => {
  const run = { sessionId: 's', steps: ['a', 'b'], index: 0 }
  assert.equal(advanceScript(run, 'other'), 'same')
  assert.deepEqual(advanceScript(run, ' a '), { sessionId: 's', steps: ['a', 'b'], index: 1 })
  assert.equal(advanceScript({ ...run, index: 1 }, 'b'), null)
})
console.log(`cycle10: ${n} passed`)
