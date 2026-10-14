import assert from 'node:assert/strict'
import {
  buildSnippetsExport,
  mergeSnippetsImport,
  moveById,
  normalizeTabTitle
} from '../src/shared/workspace-features'

let n = 0
const id = () => `id${++n}`
const existing = [{ id: 'a', title: 'disk', body: 'df -h' }]
const exported = buildSnippetsExport([...existing, { title: 'logs', body: 'tail -f {{file}}' }])
assert.match(exported, /ai-ssh-pro\/snippets/)
const merged = mergeSnippetsImport(existing, exported, id)!
assert.equal(merged.added, 1)
assert.equal(merged.skipped, 1)
assert.deepEqual(merged.list.map((s) => s.title), ['disk', 'logs'])
assert.equal(merged.list[1]!.id, 'id1')
// bare array, invalid rows, caps
const bare = mergeSnippetsImport([], JSON.stringify([{ title: ' x ', body: 'echo' }, { title: '', body: 'y' }, { title: 'z' }, 5, null]), id)!
assert.equal(bare.added, 1)
assert.equal(bare.skipped, 4)
assert.equal(bare.list[0]!.title, 'x')
assert.equal(mergeSnippetsImport([], 'not json', id), null)
assert.equal(mergeSnippetsImport([], '{"foo":1}', id), null)
// no credentials leak through export shape
assert.equal(JSON.parse(buildSnippetsExport([{ title: 't', body: 'b', id: 'secret-id' } as never])).snippets[0].id, undefined)

const tabs = ['a', 'b', 'c', 'd'].map((tabId) => ({ tabId }))
const ids = (l: { tabId: string }[]) => l.map((x) => x.tabId).join('')
assert.equal(ids(moveById(tabs, (x) => x.tabId, 'a', 'c')), 'bcad')
assert.equal(ids(moveById(tabs, (x) => x.tabId, 'd', 'a')), 'dabc')
assert.equal(moveById(tabs, (x) => x.tabId, 'a', 'zz'), tabs)
assert.equal(normalizeTabTitle('  prod   web  '), 'prod web')
assert.equal(normalizeTabTitle('   '), null)
assert.equal(normalizeTabTitle('x'.repeat(100))!.length, 60)
console.log('round6 ok')
