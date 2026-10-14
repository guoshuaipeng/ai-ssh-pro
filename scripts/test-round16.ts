/** v0.3.18: D1 resume, D2 diff, X1 Tab passthrough, UX-38 placement, UX-42b/43b copy */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { terminalKeyAction, rankSuggestions, highlightMatch, extractPromptCommand } from '../src/shared/smart-complete'
import { placeTourCard } from '../src/shared/tour-place'
import { diffTrees, isProductionHost, matchExclude } from '../src/shared/folder-sync'
import { resumeDecision } from '../src/shared/sftp-queue'
import { changelogFor } from '../src/shared/changelog'
import { SHARED_MENUS } from '../src/shared/menus'

let n = 0
const ok = (cond: boolean, msg: string) => {
  assert.ok(cond, msg)
  n++
}

ok(terminalKeyAction('Tab', { atEnd: true, hasGhost: true }) === 'passthrough', 'terminal Tab is never stolen')
ok(terminalKeyAction('ArrowRight', { atEnd: true, hasGhost: true }) === 'accept-ghost', '→ at end accepts ghost')
ok(terminalKeyAction('ArrowRight', { atEnd: false, hasGhost: true }) === 'passthrough', '→ mid-line stays with the shell')
ok(terminalKeyAction('End', { atEnd: false, hasGhost: true }) === 'accept-ghost', 'End accepts ghost')
ok(terminalKeyAction('End', { atEnd: true, hasGhost: false }) === 'passthrough', 'End without ghost is a normal key')

ok(extractPromptCommand('user@host:~$ ls -l') === 'ls -l', 'prompt command')
ok(extractPromptCommand('no prompt here') === null, 'no prompt')

const ranked = rankSuggestions({
  query: 'ss',
  hostKey: 'h1',
  entries: [
    { command: 'ss -ltnp', hostKey: 'other', count: 9, lastUsed: 1 },
    { command: 'ss -ltnp | grep :80', hostKey: 'h1', count: 2, lastUsed: 50 }
  ],
  snippets: [{ command: 'ss -s' }]
})
ok(ranked[0]?.command === 'ss -ltnp | grep :80' && ranked[0]?.source === 'host', 'host history ranks first')
ok(ranked.some((s) => s.source === 'snippet' && s.command === 'ss -s'), 'snippet included')
ok(rankSuggestions({ query: 's', hostKey: 'h1', entries: [] }).length === 0, 'min 2 chars')
const hi = highlightMatch('ss -ltnp', 'ss')
ok(hi.match === 'ss' && hi.after.startsWith(' '), 'highlight match')

const placed = placeTourCard({
  target: { left: 40, top: 80, width: 120, height: 32 },
  avoids: [{ left: 40, top: 500, width: 400, height: 80 }],
  viewport: { width: 1366, height: 768 },
  card: { width: 280, height: 160 }
})
ok(placed.side === 'right' && placed.fits, 'tour prefers the right side')
const blocked = placeTourCard({
  target: { left: 900, top: 40, width: 200, height: 36 },
  avoids: [{ left: 1110, top: 20, width: 240, height: 200 }],
  viewport: { width: 1366, height: 768 },
  card: { width: 280, height: 140 }
})
ok(blocked.side !== 'right', 'tour avoids covering the action on the right')

const rows = diffTrees(
  [
    { rel: 'a.txt', size: 1, mtime: 10 },
    { rel: 'b.txt', size: 2, mtime: 10 }
  ],
  [
    { rel: 'b.txt', size: 2, mtime: 10 },
    { rel: 'c.txt', size: 3, mtime: 10 }
  ],
  'size-mtime'
)
ok(rows.some((r) => r.rel === 'a.txt' && r.kind === 'new'), 'sync new')
ok(rows.some((r) => r.rel === 'c.txt' && r.kind === 'deleted'), 'sync deleted')
ok(rows.some((r) => r.rel === 'b.txt' && r.kind === 'same'), 'sync same')
ok(matchExclude('src/node_modules/x', ['.git', 'node_modules', '*.log']), 'exclude node_modules')
ok(!matchExclude('src/app.ts', ['*.log']), 'keep source')
ok(isProductionHost('web 生产', []), 'prod zh')
ok(isProductionHost('api', ['prod']), 'prod tag')
ok(!isProductionHost('staging', ['preview']), 'not prod')

ok(resumeDecision({ partSize: 0, total: 100 }) === 'fresh', 'no part')
ok(resumeDecision({ partSize: 40, total: 100, sourceMtime: 1, recordedMtime: 1 }) === 'resume', 'resume')
ok(resumeDecision({ partSize: 40, total: 100, sourceMtime: 2, recordedMtime: 1 }) === 'source-changed', 'source changed')

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
ok(/\.tab,\s*\.tab-title,\s*\.tab--disconnected,[\s\S]*font-style:\s*normal/.test(css), 'UX-42b upright tabs')

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
ok(i18n.includes("'ux09.title': \"选择主机以打开「{feature}」\""), 'UX-43b zh title has no stray space')
ok(!i18n.includes('选择主机以打开 {feature}'), 'old spaced zh title is gone')

ok(SHARED_MENUS.some((m) => m.items.some((i) => i.type === 'item' && i.id === 'folderSync' && i.needsSession)), 'folder sync menu')
ok(SHARED_MENUS.some((m) => m.items.some((i) => i.type === 'item' && i.id === 'smartComplete' && i.toggle)), 'smart complete toggle')
ok(changelogFor('0.3.18').length >= 8, 'whats new 0.3.18')
ok(readFileSync('CHANGELOG.md', 'utf8').includes('## v0.3.18'), 'changelog md')

console.log(`round16 ok (${n})`)
