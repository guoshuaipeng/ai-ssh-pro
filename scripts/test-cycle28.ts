import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { diffTrees, defaultPicks } from '../src/shared/folder-sync'
import { persistableDraft } from '../src/shared/cmd-drafts'
import { snapshotWorkspace } from '../src/shared/session-restore'
import { compareBatch, batchDiffContext } from '../src/shared/batch-compare'
import { redactAuditText } from '../src/shared/audit-log'
import { isSensitiveCommand } from '../src/shared/workspace-features'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D62
const rows = diffTrees(
  [{ rel: 'a.txt', isDir: false, size: 1, mtime: 5000 }, { rel: 'b.txt', isDir: false, size: 1, mtime: 1000 }, { rel: 'c.txt', isDir: false, size: 2, mtime: 1 }] as never,
  [{ rel: 'a.txt', isDir: false, size: 2, mtime: 1000 }, { rel: 'b.txt', isDir: false, size: 2, mtime: 9000 }] as never,
  'size-mtime'
)
const b = rows.find((r) => r.rel === 'b.txt')!
ok(b.kind === 'changed' && b.targetNewer === true, 'D62 target newer flagged')
ok(!rows.find((r) => r.rel === 'a.txt')!.targetNewer, 'D62 source newer not flagged')
const picks = defaultPicks(rows)
ok(picks['a.txt'] && picks['c.txt'] && !picks['b.txt'], 'D62 target-newer unpicked')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes('data-testid="sftp-compare-open"'), 'D62 toolbar entry')
const fsm = readFileSync('src/renderer/src/components/FolderSyncModal.tsx', 'utf8')
ok(fsm.includes('setPicked(defaultPicks(next))') && fsm.includes('const [deleteExtra, setDeleteExtra] = useState(false)'), 'D62 modal defaults, no delete')
// D63
ok(persistableDraft('  ls -la  ', isSensitiveCommand, redactAuditText) === 'ls -la', 'D63 keeps plain draft')
ok(persistableDraft('mysql -p hunter2', isSensitiveCommand, redactAuditText) === '' || isSensitiveCommand('mysql -p hunter2') === false, 'D63 sensitive dropped')
ok(persistableDraft('curl -H "Authorization: Bearer abcdefghijklmnop1234"', () => false, redactAuditText) === '', 'D63 redactable dropped')
ok(persistableDraft('a\nb', () => false, (s) => s) === '' && persistableDraft('x'.repeat(501), () => false, (s) => s) === '', 'D63 multiline/long dropped')
const snap = snapshotWorkspace([{ tabId: 't', profileId: 'p', title: 'h', cwd: '/srv', draft: 'tail -f x' }], 't')
ok(snap[0]!.draft === 'tail -f x' && snap[0]!.cwd === '/srv', 'D63 snapshot carries draft + cwd')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes("if (row.kind === 'terminal' && row.draft) putDraft(cmdDrafts, tabId, row.draft)"), 'D63 restore seeds draft')
// D64
const r = (id: string, out: string, code = 0) => ({ sessionId: id, label: id, host: id, port: 22, username: 'u', ok: code === 0, code, stdout: out, stderr: '', elapsedMs: 1 })
const res = [r('a', 'v1\n'), r('b', 'v1'), r('c', 'v2', 1)]
const cmp = compareBatch(res)
ok(cmp.groups.length === 2 && cmp.outliers.join() === 'c', 'D64 outlier')
ok(compareBatch([r('a', 'x'), r('b', 'y')]).majority === null, 'D64 tie no majority')
ok(compareBatch([r('a', 'x'), r('b', 'x ')]).groups.length === 1, 'D64 trailing ws same')
const ctx = batchDiffContext('cat /etc/version', res, cmp, redactAuditText)
ok(ctx.includes('## differs: c') && ctx.includes('majority (2)') && ctx.split('v1').length === 2, 'D64 context')
const bm = readFileSync('src/renderer/src/components/BatchExecuteModal.tsx', 'utf8')
ok(bm.includes("requestAskWithContext(cmp.outliers[0]!, text, t('d64.q'))"), 'D64 prefill only')
// screenshots
const shot = readFileSync('scripts/screenshot-key-screens.mjs', 'utf8')
ok(shot.includes("name: 'search-all'") && shot.includes("name: 'paste-skip-hosts'"), 'shot scenarios')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const key of ['d62.compare', 'd62.targetNewer', 'd64.ask', 'd64.differs']) ok(i18n.split(`'${key}'`).length === 3, `i18n ${key}`)
console.log(`test-cycle28 ok (${n})`)
