/** SN2: ~25 bilingual read-only built-ins with tags; compact one-line rows with keyboard navigation. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BUILTIN_SNIPPETS, localizeBuiltin } from '../src/shared/builtin-pack'
assert.ok(BUILTIN_SNIPPETS.length >= 24 && BUILTIN_SNIPPETS.length <= 30, `count ${BUILTIN_SNIPPETS.length}`)
const ids = new Set(BUILTIN_SNIPPETS.map((s) => s.id))
assert.equal(ids.size, BUILTIN_SNIPPETS.length, 'unique ids')
for (const keep of ['builtin:snip:disk', 'builtin:snip:mem', 'builtin:snip:listen']) assert.ok(ids.has(keep), keep)
const TAGS = new Set(['系统', '磁盘', '内存', '进程', '网络', '日志', 'Docker', '服务'])
const RISKY = /\b(rm|reboot|shutdown|halt|poweroff|kill|pkill|mkfs|dd|truncate|chmod|chown)\b|systemctl\s+(restart|stop|start|reload|disable|enable)|docker\s+(rm|stop|kill|restart|prune)|>\s*\//
for (const s of BUILTIN_SNIPPETS) {
  assert.ok(s.tag && TAGS.has(s.tag[0]) && s.tag[1], `tag ${s.id}`)
  assert.ok(s.title[0] && s.title[1] && s.summary[0] && s.summary[1], `bilingual ${s.id}`)
  assert.equal(RISKY.test(s.body.replace(/2>\/dev\/null|-o \/dev\/null/g, '')), false, `risky ${s.id}: ${s.body}`)
}
// parameters use {{name}}; docker's own {{.Field}} templates are not variables
const VAR = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g
const vars = (b: string) => [...b.matchAll(VAR)].map((m) => m[1])
assert.deepEqual(vars(BUILTIN_SNIPPETS.find((s) => s.id === 'builtin:snip:portwho')!.body), ['port', 'port'])
assert.deepEqual(vars(BUILTIN_SNIPPETS.find((s) => s.id === 'builtin:snip:dockerps')!.body), [])
assert.equal(localizeBuiltin(BUILTIN_SNIPPETS[3]!, 'en-US').tag, 'System')
const ui = readFileSync('src/renderer/src/components/SnippetsPanel.tsx', 'utf8')
assert.match(ui, /\$\{row\.summary\}\\n\$\{row\.tag \?\? ''\}\\n\$\{row\.body\}/, 'search covers command and tag')
assert.match(ui, /className="sn2-cmd">\{s\.body\}/)
assert.match(ui, /e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'/)
assert.match(ui, /e\.key === 'Enter'[\s\S]{0,200}onInject\(r\.s, false\)/)
assert.ok(ui.includes('data-testid="w9-snip-seg"'), 'all / built-in / mine kept')
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.sn2-row:hover \.sn2-actions, \.sn2-row\.is-hot \.sn2-actions, \.sn2-row:focus-within \.sn2-actions \{ display: inline-flex; \}/)
console.log('test-snippets-compact ok')
