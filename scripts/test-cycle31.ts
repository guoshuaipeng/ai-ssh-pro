import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findPaths } from '../src/shared/term-links'
import { searchTree } from '../src/shared/sftp-tree-search'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D72
const p1 = findPaths('src/app.ts:12:3: error TS2304')
ok(p1.length === 1 && p1[0]!.path === 'src/app.ts' && p1[0]!.end === 15, 'D72 file:line:col')
ok(findPaths('ls /etc/nginx/ and ./build/out.js, ~/x/y').map((h) => h.path).join() === '/etc/nginx/,./build/out.js,~/x/y', 'D72 abs / ./ / ~')
ok(findPaths('see https://a.com/b/c').length === 0, 'D72 skips URLs')
ok(findPaths('on 2026/10/21 ratio 1/2 at 10:21/22').length === 0, 'D72 skips dates/fractions')
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes('const hits = findPaths(text)') && tp.includes('if (!(ev.ctrlKey || ev.metaKey)) return') && tp.includes('requestSftpGoto(sessionId, p)'), 'D72 Ctrl+click locates only')
// D73
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('data-testid="connecting-cancel"') && app.includes('cancelledConnectingTabsRef.current.add(id)'), 'D73 cancel button')
ok(/catch \(e\) \{\s+\/\/ D73[^\n]*\n\s+if \(cancelledConnectingTabsRef\.current\.has\(tabId\)\)/.test(app), 'D73 no error card after cancel')
// D74 covered
const bar = readFileSync('src/renderer/src/components/SessionCommandBar.tsx', 'utf8')
ok(bar.includes('cmd-explain-risk'), 'D74 covered: filled command shows risk')
// D75
const tree: Record<string, { name: string; isDirectory: boolean; link?: 'dir' }[]> = {
  '/srv': [{ name: 'app', isDirectory: true }, { name: 'node_modules', isDirectory: true }, { name: 'nginx.conf', isDirectory: false }, { name: 'ln', isDirectory: true, link: 'dir' }],
  '/srv/app': [{ name: 'config', isDirectory: true }, { name: 'README', isDirectory: false }],
  '/srv/app/config': [{ name: 'app.CONF', isDirectory: false }],
  '/srv/node_modules': [{ name: 'x.conf', isDirectory: false }],
  '/srv/ln': [{ name: 'y.conf', isDirectory: false }]
}
const listed: string[] = []
const list = async (dir: string) => {
  listed.push(dir)
  return { path: dir, entries: (tree[dir] ?? []).map((e) => ({ ...e, path: `${dir}/${e.name}`, size: 1 })) }
}
const r = await searchTree('/srv', 'conf', list)
ok(r.hits.map((h) => h.rel).sort().join() === 'app/config,app/config/app.CONF,nginx.conf', 'D75 finds by name, case-insensitive')
ok(!listed.includes('/srv/node_modules') && !listed.includes('/srv/ln'), 'D75 skips node_modules and symlinked dirs')
const lim = await searchTree('/srv', 'conf', list, { maxDepth: 1, maxDirs: 10, maxHits: 10 })
ok(lim.truncated && !lim.hits.some((h) => h.name === 'app.CONF'), 'D75 depth limit reported')
ok((await searchTree('/srv', '  ', list)).hits.length === 0, 'D75 empty query')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes('data-testid="sftp-remote-tree-search"') && sp.includes('<SftpTreeSearch'), 'D75 wired')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const key of ['d72.noCwd', 'd73.cancel', 'd75.button', 'd75.countMore']) ok(i18n.split(`'${key}'`).length === 3, `i18n ${key}`)
console.log(`test-cycle31 ok (${n})`)
