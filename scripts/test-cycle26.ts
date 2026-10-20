import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isRunnableName } from '../src/shared/local-open'
import { KEYMAP, matchKeymap } from '../src/shared/keymap'
import { SHARED_MENUS } from '../src/shared/menus'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D58
for (const f of ['a.exe', 'b.BAT', 'c.ps1', 'd.lnk', 'e.sh', 'f.py', 'g.msi']) ok(isRunnableName(f), `runnable ${f}`)
for (const f of ['a.txt', 'b.pdf', 'c.png', 'README', 'x.log']) ok(!isRunnableName(f), `openable ${f}`)
const main = readFileSync('src/main/index.ts', 'utf8')
ok(main.includes("if (!file || isRunnableName(file)) return 'blocked'") && main.includes('shell.openPath(file)'), 'D58 main guard')
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes("tg('d58.title'") && sp.includes('else void openLocalEntry(current)') && sp.includes('else void openLocalEntry(e)'), 'D58 Enter + dblclick confirm')
// D57
const k = KEYMAP.filter((x) => x.keys === 'Ctrl+Shift+Y')
ok(k.length === 1 && k[0]!.id === 'copyLastOutput', 'D57 unique shortcut')
ok(matchKeymap({ key: 'y', code: 'KeyY', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }, true) === 'copyLastOutput', 'D57 works in terminal')
ok(SHARED_MENUS.flatMap((m) => m.items).some((it) => it.type === 'item' && it.id === 'copyLastOutput'), 'D57 menu')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes("action === 'copyLastOutput'"), 'D57 action')
// D56
ok(app.includes("querySelectorAll<HTMLElement>('[data-profile-id]')"), 'D56 arrows')
ok(readFileSync('src/renderer/src/components/SessionDockerBranch.tsx', 'utf8').includes('data-profile-id={profile.id}'), 'D56 row id')
console.log(JSON.stringify({ test: 'cycle26', total: n, failed: 0 }))
