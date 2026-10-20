import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEMO_TAGS } from '../src/shared/demo-host'
import { findUrls } from '../src/shared/term-links'
import { newFileProblem } from '../src/shared/sftp-new-file'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D69
ok(DEMO_TAGS.includes('demo') && DEMO_TAGS.includes('web'), 'D69 tags')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('tags: [...DEMO_TAGS],'), 'D69 new demo host tagged')
// D70
const u = findUrls('see https://example.com/a?b=1. and (http://x.io/y) or https://w.org/p_(1)')
ok(u.map((h) => h.url).join(' ') === 'https://example.com/a?b=1 http://x.io/y https://w.org/p_(1)', 'D70 trims punctuation/brackets')
ok(u[0]!.start === 4 && u[0]!.end === 4 + 'https://example.com/a?b=1'.length, 'D70 columns')
ok(findUrls('ftp://a file:///etc https://').length === 0, 'D70 http(s) only')
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes('term.registerLinkProvider(') && tp.includes('if (ev.ctrlKey || ev.metaKey) void window.aiss.app.openExternal(url)'), 'D70 Ctrl+click opens')
const main = readFileSync('src/main/app-updater.ts', 'utf8')
ok(main.includes("if (!/^https?:\\/\\//i.test(u)) return false"), 'D70 main only opens http(s)')
// D71
ok(newFileProblem('', []) === 'empty' && newFileProblem('a/b', []) === 'slash' && newFileProblem('..', []) === 'dots', 'D71 bad names')
ok(newFileProblem('x.txt', ['x.txt']) === 'exists' && newFileProblem(' y.txt ', ['x.txt']) === null, 'D71 exists / ok')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes("{ id: 'newfile', label: tg('d71.button'), onSelect: () => void newRemoteFile() }") && sp.includes('await window.aiss.sftp.stat(sessionId, path)') && /const newRemoteFile = async[\s\S]{0,120}allowRemoteWrite\(\)/.test(sp), 'D71 guarded + no overwrite')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const key of ['d70.hint', 'd71.button', 'd71.exists']) ok(i18n.split(`'${key}'`).length === 3, `i18n ${key}`)
console.log(`test-cycle30 ok (${n})`)
