import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { batchGroups, toggleGroup, groupState } from '../src/shared/batch-targets'
import { trimLog, fenceSelection } from '../src/shared/ask-context'
import { diffTrees, resolvePlanRows, conflictChoice } from '../src/shared/folder-sync'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D65
const ss = [{ sessionId: 'a', folderId: 'f1', tags: ['web'] }, { sessionId: 'b', folderId: 'f1', tags: ['web', 'prod'] }, { sessionId: 'c', tags: ['prod'] }]
const g = batchGroups(ss, [{ id: 'f1', name: 'Web' }, { id: 'f2', name: 'Empty' }])
ok(g.map((x) => x.label).join() === 'Web,#prod,#web', 'D65 groups (empty folder hidden, tags sorted)')
let sel = toggleGroup(new Set(['a']), ['a', 'b'])
ok(sel.size === 2 && groupState(sel, ['a', 'b']) === 'all', 'D65 add group')
sel = toggleGroup(sel, ['a', 'b'])
ok(sel.size === 0 && groupState(new Set(['a']), ['a', 'b']) === 'some', 'D65 remove group / some')
const bm = readFileSync('src/renderer/src/components/BatchExecuteModal.tsx', 'utf8')
ok(bm.includes('data-testid="batch-groups"') && bm.includes('onOpenHost(row.sessionId, result!.command)'), 'D65 UI')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('folders={folders}') && app.includes('window.setTimeout(() => fillCommandBar(sid, command), 60)') && app.includes('tags: prof?.tags'), 'D65 wiring fill only')
// D66
const lines = Array.from({ length: 300 }, (_, i) => (i === 150 ? 'ERROR: disk full' : `line ${i} ok ok ok ok`))
const t = trimLog(lines.join('\n'), 1000)
ok(t.length <= 1100 && t.includes('ERROR: disk full') && t.includes('line 0 ') && t.includes('line 299') && /lines omitted, 1 error lines kept/.test(t), 'D66 head/tail/error')
ok(trimLog('short', 100) === 'short' && fenceSelection('a'.repeat(10) + 'TAIL', 4).includes('…\nTAIL'), 'D66 old behaviour for short / few-line')
ok(app.includes('fenceSelection(redactAuditText(d.text))'), 'D66 selection redacted')
// D67
const rows = diffTrees(
  [{ rel: 'a', isDir: false, size: 1, mtime: 1000 }, { rel: 'b', isDir: false, size: 1, mtime: 9000 }, { rel: 'n', isDir: false, size: 1, mtime: 1 }] as never,
  [{ rel: 'a', isDir: false, size: 2, mtime: 9000 }, { rel: 'b', isDir: false, size: 2, mtime: 1000 }, { rel: 'x', isDir: false, size: 1, mtime: 1 }] as never,
  'size-mtime'
)
const picked: Record<string, boolean> = { b: true, n: true, x: true }
ok(resolvePlanRows(rows, picked, {}).map((r) => r.rel).sort().join() === 'b,n,x', 'D67 default skips conflict')
const plan = resolvePlanRows(rows, picked, { a: 'target' })
ok(plan.find((r) => r.rel === 'a')?.reverse === true && !plan.find((r) => r.rel === 'b')?.reverse, 'D67 keep target reverses')
ok(plan.filter((r) => r.reverse).every((r) => r.kind === 'changed'), 'D67 reversed never deletes')
ok(conflictChoice({}, {}, 'a') === 'skip' && conflictChoice({ a: true }, {}, 'a') === 'source' && conflictChoice({}, { a: 'target' }, 'a') === 'target', 'D67 choice')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes("const dir = row.reverse ? (plan.direction === 'upload' ? 'download' : 'upload') : plan.direction") && sp.includes('await enqueueFile(dir, localPath'), 'D67 runSync per-row direction')
const fsm = readFileSync('src/renderer/src/components/FolderSyncModal.tsx', 'utf8')
ok(fsm.includes('data-testid="sync-conflict"') && fsm.includes('resolvePlanRows(rows, picked, keep)'), 'D67 modal')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const key of ['d65.groups', 'd65.open', 'd67.target', 'd67.summary']) ok(i18n.split(`'${key}'`).length === 3, `i18n ${key}`)
console.log(`test-cycle29 ok (${n})`)
