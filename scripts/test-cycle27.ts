import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pushRecentRun, recentRunsContext, RECENT_RUNS_MAX, RECENT_CTX_MAX, RECENT_FRESH_MS, type LastRun } from '../src/shared/failed-output'
import { searchSessions, hitsPerSession, SEARCH_ALL_CAP } from '../src/shared/term-search-all'
import { KEYMAP, matchKeymap } from '../src/shared/keymap'
import { SHARED_MENUS } from '../src/shared/menus'
import { withSkipHost } from '../src/shared/paste-skip'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
const sens = (c: string) => /passwd|token/.test(c)
// D59
let list: LastRun[] = []
for (let i = 0; i < 8; i++) list = pushRecentRun(list, { command: `cmd${i}`, code: i % 2, at: 1000 + i, out: `out${i}` }, sens)
ok(list.length === RECENT_RUNS_MAX && list[0]!.command === 'cmd3', 'D59 keeps last 5')
ok(pushRecentRun(list, { command: 'passwd root', code: 0, at: 2000 }, sens) === list, 'D59 sensitive not kept')
const ctx = recentRunsContext(list, 2000, sens)
ok(ctx.includes('$ cmd3   # exit 1') && ctx.includes('out7') && ctx.indexOf('cmd3') < ctx.indexOf('cmd7'), 'D59 order + exit codes')
ok(recentRunsContext(list, 1000 + RECENT_FRESH_MS + 100, sens) === '', 'D59 stale dropped')
const big = recentRunsContext([{ command: 'cat x', code: 1, at: 0, out: 'y'.repeat(50000) }, { command: 'ls', code: 0, at: 0, out: 'z'.repeat(50000) }], 1, sens)
ok(big.length <= RECENT_CTX_MAX + 4 && big.includes('…'), 'D59 size cap')
ok(recentRunsContext([{ command: 'curl -H "Authorization: Bearer abcdefghijklmnop1234" x', code: 1, at: 0 }], 1, () => false).includes('abcdefghijklmnop1234') === false, 'D59 redacted')
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes("id: 'aiAskRecent'") && tp.includes("requestAskWithContext(sessionId, recentCtx, tg('d59.q'))"), 'D59 menu prefill only')
// D60
const src = [{ sessionId: 'a', label: 'web', lines: ['ok', 'ERROR disk full', 'x'] }, { sessionId: 'b', label: 'db', lines: ['error: conn refused'] }]
const hits = searchSessions(src, 'error')
ok(hits.length === 2 && hits[0]!.label === 'web' && hits[1]!.row === 0, 'D60 case-insensitive across tabs')
ok(searchSessions(src, 'e').length === 0, 'D60 min length')
ok(hitsPerSession(hits).size === 2, 'D60 per tab')
ok(searchSessions([{ sessionId: 'c', label: 'c', lines: Array(500).fill('needle') }], 'needle').length === SEARCH_ALL_CAP, 'D60 cap')
ok(KEYMAP.filter((x) => x.keys === 'Ctrl+Shift+Alt+F').length === 1, 'D60 unique shortcut')
ok(matchKeymap({ key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true, altKey: true, metaKey: false }, true) === 'searchAllTerms', 'D60 works in terminal')
ok(SHARED_MENUS.flatMap((m) => m.items).some((it) => it.type === 'item' && it.id === 'searchAllTerms'), 'D60 menu')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes("action === 'searchAllTerms'") && app.includes('<SearchAllTermsModal'), 'D60 wired')
ok(tp.includes('registerTermBuffer(sessionId') && tp.includes('detail?.query'), 'D60 pane registers + seeds query')
// D61 covered by D2
const fs = readFileSync('src/renderer/src/components/FolderSyncModal.tsx', 'utf8')
ok(fs.includes('useState(false)') && fs.includes("tg('d2.typeHost'"), 'D61 delete off by default + prod confirm')
// D7c
ok(withSkipHost(['a', 'b'], 'a', false).join() === 'b', 'D7c remove')
const pm = readFileSync('src/renderer/src/components/TerminalPrefsModal.tsx', 'utf8')
ok(pm.includes('paste-skip-ask-all') && pm.includes("tg('d7c.title')"), 'D7c list')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const key of ['d59.ask', 'd60.title', 'd7c.title']) ok(i18n.split(`'${key}'`).length === 3, `i18n ${key} zh+en`)
console.log(`test-cycle27 ok (${n})`)
