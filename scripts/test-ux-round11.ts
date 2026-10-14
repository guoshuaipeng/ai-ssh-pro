import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHORTCUTS } from '../src/shared/workspace-features'

// Static checks on the discoverability pass (menus/i18n are TSX, so read them as text).
const menus = readFileSync('src/renderer/src/components/TitlebarMenus.tsx', 'utf8')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
const block = (id: string) => {
  const a = menus.indexOf(`id: '${id}',`)
  return menus.slice(a, menus.indexOf(']', a))
}
const session = block('session')
const tools = block('tools')
for (const a of ['resourceMonitor', 'portForward', 'batchExec', 'snippets', 'commandPalette', 'toggleSplit']) {
  assert.ok(tools.includes(`id: '${a}'`), `Tools menu has ${a}`)
  assert.ok(!session.includes(`id: '${a}'`), `Session menu no longer has ${a}`)
}
assert.ok((session.match(/type: 'item'/g) ?? []).length <= 8, 'Session menu is short')
for (const k of ['Ctrl+Shift+P', 'Ctrl+K', 'Ctrl+Shift+M', 'Ctrl+Shift+O', 'Ctrl+Shift+B', 'Ctrl+Shift+S']) {
  const s = SHORTCUTS.find((x) => x.keys === k)
  assert.ok(s, `shortcut ${k} documented`)
  const n = (i18n.match(new RegExp(`'shortcuts\\.item\\.${s!.id}':`, 'g')) ?? []).length
  assert.equal(n, 2, `shortcut ${k} translated zh+en`)
}
const keys = new Set(SHORTCUTS.map((s) => s.keys))
assert.equal(keys.size, SHORTCUTS.length, 'no duplicate shortcut keys')
for (const k of ['menu.tools', 'menu.aiMenu', 'menu.commandPalette', 'menu.whatsNew', 'cmdp.placeholder', 'wn.title', 'ctx.monitor', 'toolbar.monitor']) {
  assert.equal((i18n.match(new RegExp(`'${k.replace('.', '\\.')}':`, 'g')) ?? []).length, 2, `${k} zh+en`)
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const pubs = [pkg.build.publish].flat()
assert.ok(pubs.every((p: { releaseType?: string }) => p.releaseType === 'release'), 'releases are published, not drafts')
console.log('ux round11 ok')
