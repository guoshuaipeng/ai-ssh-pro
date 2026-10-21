/** PB2: playbook editor cards, labelled fields, run as primary, reorder. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { moveStep } from '../src/shared/playbook-steps'
assert.deepEqual(moveStep(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
assert.deepEqual(moveStep(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
assert.deepEqual(moveStep(['a', 'b'], 0, 5), ['a', 'b'])
const p = readFileSync('src/renderer/src/components/PlaybookTabs.tsx', 'utf8')
const ed = p.slice(p.indexOf('export function PlaybookEditor'), p.indexOf('export function PlaybookRun'))
assert.match(ed, /<Button variant="primary" data-testid="pb2-run"/)
assert.match(ed, /data-testid="w9-pb-save-as"/)
assert.match(ed, /data-testid="w9-playbook-locked"/)
assert.equal(ed.includes("tg('w9.sampleNoAuto')"), false, 'no duplicated sample note')
assert.match(ed, /className="pb2-label">\{tg\('m2\.name'\)\}/)
assert.match(ed, /className="pb2-label">\{tg\('m2\.desc'\)\}/)
// step type and reminder cadence use the themed Select (PB3)
const selects = ed.match(/<select\b/g) || []
assert.equal(selects.length, 0)
assert.match(ed, /data-testid="pb2-handle"[\s\S]{0,400}onDragStart/)
assert.match(ed, /e\.key !== 'ArrowUp' && e\.key !== 'ArrowDown'/)
for (const id of ['pb2-dup', 'pb2-del', 'pb2-add', 'pb2-step']) assert.ok(ed.includes(`data-testid="${id}"`), id)
assert.match(ed, /className="pb2-suffix">\{tg\('pb2\.sec'\)\}/)
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['pb2.lockedWhy', 'pb2.stepsN', 'pb2.dragTip', 'pb2.dup', 'pb2.deleted', 'pb2.sec', 'pb2.timeout']) assert.equal(i18n.split(`'${k}'`).length - 1, 2, k)
console.log('test-playbook-editor ok')
