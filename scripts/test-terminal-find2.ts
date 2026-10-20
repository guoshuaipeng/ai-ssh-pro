import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileFind, findAllInBuffer, pickMatch, seedQueryFromSelection } from '../src/renderer/src/lib/terminal-find'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }
const lines = ['Error: disk full', 'ok', 'error again; ERROR x', 'a.b a+b']
ok('count, case-insensitive by default', () => assert.equal(findAllInBuffer(lines, 'error').length, 3))
ok('case-sensitive', () => assert.deepEqual(findAllInBuffer(lines, 'error', { caseSensitive: true }), [{ row: 2, col: 0, len: 5 }]))
ok('plain text escapes regex chars', () => assert.deepEqual(findAllInBuffer(lines, 'a+b'), [{ row: 3, col: 4, len: 3 }]))
ok('regex with length', () => {
  const m = findAllInBuffer(lines, 'd\\w+k', { regex: true })
  assert.deepEqual(m, [{ row: 0, col: 7, len: 4 }])
  assert.equal(findAllInBuffer(lines, '^', { regex: true }).length, 0, 'zero-length skipped')
})
ok('invalid regex reports error', () => {
  assert.equal(compileFind('(', { regex: true }).error, 'regex')
  assert.equal(compileFind('(').error, null)
})
ok('pickMatch wraps both ways', () => {
  const m = findAllInBuffer(lines, 'error')
  assert.equal(pickMatch(m, null), 0)
  assert.equal(pickMatch(m, { row: 2, col: 12 }), 2)
  assert.equal(pickMatch(m, { row: 2, col: 13 }), 0)
  assert.equal(pickMatch(m, { row: 0, col: 0 }, true), 2)
  assert.equal(pickMatch(m, { row: 2, col: 12 }, true), 1)
})
ok('seed from selection', () => {
  assert.equal(seedQueryFromSelection('  nginx \nmore'), 'nginx')
  assert.equal(seedQueryFromSelection('x'.repeat(300)), '')
})
ok('wiring', () => {
  const src = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
  for (const id of ['terminal-find-count', 'terminal-find-case', 'terminal-find-regex', 'findAllInBuffer', 'seedQueryFromSelection', 'aria-pressed'])
    assert.ok(src.includes(id), id)
})
console.log(`\n${n} passed`)
