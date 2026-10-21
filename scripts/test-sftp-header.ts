/** SH1: symmetric one-row SFTP pane header, Explorer-style address bar, merged filter, themed drive Select. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const p = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
const head = p.slice(p.indexOf('SH1: one row per pane'), p.indexOf('sftp-filter-row'))
assert.ok(!/<select/.test(p), 'no native select in the SFTP panel')
assert.match(p, /<Select\s+testId="sftp-drive-switch"/)
// fixed order of the icon tools
const order = ['sftp-up-', 'sftp-refresh-', 'sftp-local-new"', 'sftp-recent-dirs', 'sftp-filter-toggle-', 'sftp-sort-mode', 'sftp-more-']
let at = 0
for (const id of order) { const i = head.indexOf(id, at); assert.ok(i > at, id); at = i }
// address bar: crumbs + input in one control, Ctrl+L / Alt+D, Enter / Esc
assert.match(head, /className=\{`sftp-addr\$\{pathEdit === side \? ' is-editing' : ''\}`\}/)
assert.match(p, /e\.ctrlKey && !e\.shiftKey && e\.key\.toLowerCase\(\) === 'l'/)
assert.match(head, /e\.key === 'Escape'[\s\S]{0,80}setInput\(cwd\)/)
// visible text buttons are gone; the actions live in "更多"
for (const k of ["{tg('sftp.refresh')}", "{tg('sftp.copyPath')}\n", "{tg('d45.btn')}"]) assert.equal(head.includes(`>\n                ${k}`), false, k)
for (const id of ['copyPath', 'editPath', 'cdTerm', 'treeSearch', 'hidden']) assert.ok(head.includes(`id: '${id}'`), id)
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.sftp-pane-head\.sftp-head \{ display: flex; flex-wrap: nowrap;/)
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['sh1.addrTip', 'sh1.tools', 'sh1.more', 'sh1.editPath', 'sh1.filterTip', 'sh1.filterTipRemote', 'sh1.deepSearch']) assert.equal(i18n.split(`'${k}'`).length - 1, 2, k)
console.log('test-sftp-header ok')
