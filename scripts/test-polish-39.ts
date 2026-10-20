/** P39 polish pass: IME guards, Ctrl+Shift+C block copy, titlebar badge compaction, spellcheck, perm column. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KEYMAP, matchKeymap } from '../src/shared/keymap'
const rd = (p: string) => readFileSync(`src/renderer/src/components/${p}.tsx`, 'utf8')
for (const f of ['AIPanel', 'CommandInput', 'QuickPick', 'CommandPalette', 'HostPicker']) assert.match(rd(f), /isComposing \|\| e\.keyCode === 229\) return/, `${f} IME guard`)
for (const f of ['QuickPick', 'CommandPalette', 'HostPicker']) assert.match(rd(f), /spellCheck=\{false\}\s*className="cmdp-input"/, `${f} spellcheck`)
const block = KEYMAP.find((k) => k.keys === 'Ctrl+Shift+C' && k.scope === 'blocks')
assert.equal(block?.id, 'copyBlockOutput')
assert.equal(matchKeymap({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: 'C', code: 'KeyC' } as never, false, ['blocks']), 'copyBlockOutput')
assert.match(readFileSync('src/renderer/src/App.tsx', 'utf8'), /if \(action === 'copyBlockOutput'\) return/)
assert.match(rd('TerminalBlocks'), /e\.key\.toLowerCase\(\) === 'c'[\s\S]{0,200}writeText\(b\.output\)/)
const tb = rd('AppToolbar')
assert.match(tb, /update-badge"\]'\)[\s\S]{0,120}clientWidth - \(badge/)
assert.match(tb, /\[autoIcon, updateVersion\]/)
assert.match(rd('SftpPanel'), /<th style=\{\{ width: 84 \}\}>\{tg\('d1\.perm'\)\}/)
console.log('test-polish-39 ok')
