import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ungroupPlan } from '../src/shared/host-drag'
import { TERMINAL_PREFS_DEFAULTS } from '../src/shared/ipc'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D89
const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
ok(ai.includes('className="titlebar-popover ai-more-menu"') && ai.includes('role="menu"') && ai.includes("e.key === 'ArrowDown'") && ai.includes("if (e.key === 'Escape')"), 'D89 menu role + keys')
ok(/className="danger" disabled=\{busy\} onClick=\{\(\) => \{ setMoreOpen\(false\); clearConversation\(\) \}\}/.test(ai) && ai.includes("confirmText: tg('ai.clear')"), 'D89 clear is danger and still confirms')
const css = readFileSync('src/renderer/src/features.css', 'utf8')
ok(css.includes('.ai-more-menu > button {') && css.includes('[data-testid="terminal-prefs"] .field > input[type="checkbox"]'), 'D89 + prefs css')
// D90
ok(ungroupPlan(['a', 'b', 'c'], [{ id: 'a', folderId: 'f' }, { id: 'b' }]).join() === 'a', 'D90 ungroupPlan')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('data-testid="ungroup-drop"') && app.includes('moveProfileToFolder(moving, undefined)') && app.includes('setHostDragging(true)'), 'D90 wiring')
// D92
ok(TERMINAL_PREFS_DEFAULTS.copyOnSelect === false, 'D92 default off')
const store = readFileSync('src/main/app-store.ts', 'utf8')
ok(store.includes('const copyOnSelect = o.copyOnSelect === true'), 'D92 normalize')
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes('if (copyOnSelectRef.current) void navigator.clipboard.writeText(t.getSelection())'), 'D92 pane')
const pm = readFileSync('src/renderer/src/components/TerminalPrefsModal.tsx', 'utf8')
ok(pm.includes('data-testid="copy-on-select"') && pm.includes('data-testid="mute-bell"') && pm.includes('copyOnSelect\n      })') === false || pm.includes('copyOnSelect'), 'D92 prefs ui')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['d90.drop', 'd90.already', 'd92.title', 'd92.hint']) ok((i18n.match(new RegExp(`'${k.replace('.', '\\.')}'`, 'g')) ?? []).length === 2, 'strings ' + k)
console.log(`cycle36 ok: ${n}`)
