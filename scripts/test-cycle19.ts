import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openDecision, EDIT_MAX_BYTES } from '../src/shared/sftp-open'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
ok(openDecision('a.txt', 100) === 'edit', 'small text edits')
ok(openDecision('nginx.conf', EDIT_MAX_BYTES) === 'edit', 'exactly 2MB edits')
ok(openDecision('app.log', EDIT_MAX_BYTES + 1) === 'large', 'big log is large')
ok(openDecision('x.TAR.GZ', 10) === 'binary', 'ext case-insensitive')
ok(openDecision('a.png', 10) === 'binary', 'png binary')
ok(openDecision('Makefile', 10) === 'edit', 'no ext edits')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes("openDecision(e.name, e.size)"), 'sftp uses openDecision')
ok(sp.includes("transferFiles('download', [{ name: e.name"), 'download via transferFiles')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes("tg('d35.tabReason', { reason: friendlyErrorMessage(t.failRaw) })"), 'tab tooltip reason')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['d35.tabReason', 'd36.large', 'd36.binary', 'd36.download', 'd36.openAnyway']) ok(i18n.split(`'${k}'`).length === 3, `i18n zh+en ${k}`)
const cb = readFileSync('src/renderer/src/components/CommandInput.tsx', 'utf8')
ok(cb.includes('suggest-run-in-cwd'), 'D34 run-in-cwd span')
console.log(JSON.stringify({ test: 'cycle19', total: n, failed: 0 }))
