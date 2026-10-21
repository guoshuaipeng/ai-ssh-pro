/** Cycle 44: SFTP global row (SH2), playbook step undo + themed cadence (PB3), user snippet categories (SN3). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { snippetCategories } from '../src/shared/snippet-category'
import { filterSnippets } from '../src/shared/workspace-features'
// SN3
assert.deepEqual(snippetCategories([{ category: ' 数据库 ' }, {}, { category: '数据库' }, { category: 'K8s' }], ['系统', 'K8s']), ['数据库', 'K8s', '系统'])
assert.equal(filterSnippets([{ id: '1', title: 'a', body: 'b', category: '数据库' }], '数据库').length, 1)
const store = readFileSync('src/main/app-store.ts', 'utf8')
assert.match(store, /row\.category = o\.category\.trim\(\)\.slice\(0, 24\)/, 'category survives the store')
const sp = readFileSync('src/renderer/src/components/SnippetsPanel.tsx', 'utf8')
assert.match(sp, /data-testid="snip-category"/)
assert.match(sp, /filter\(\(s\) => !catFilter \|\| s\.category === catFilter\)/)
assert.match(sp, /\(!catFilter \|\| row\.tag === catFilter\)/)
// PB3
const pb = readFileSync('src/renderer/src/components/PlaybookTabs.tsx', 'utf8')
assert.match(pb, /toastUndo\(\{\s*message: tg\('pb2\.deleted'/)
assert.match(pb, /steps: \[\.\.\.cur\.steps\.slice\(0, i\), step, \.\.\.cur\.steps\.slice\(i\)\]/)
assert.match(pb, /<Select\s+testId="w6-cadence"/)
assert.equal((pb.slice(pb.indexOf('export function PlaybookEditor'), pb.indexOf('export function PlaybookRun')).match(/<select\b/g) || []).length, 0)
// SH2
const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(sftp, /className="sftp-session-cwd sftp-icon-btn"/)
assert.match(sftp, /data-testid="sftp-density"/)
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.sftp-toolbar \.sftp-queue-summary \{ order: 4; margin-left: auto;/)
assert.match(css, /\.sftp-head \.sftp-drive, \.sftp-head \.sftp-drive\.is-prominent \{ flex: none; width: auto;/)
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['sn3.field', 'sn3.ph', 'sn3.all']) assert.equal(i18n.split(`'${k}'`).length - 1, 2, k)
console.log('test-cycle44 ok')
