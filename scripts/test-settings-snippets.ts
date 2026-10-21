import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// ST2: settings rows share one rhythm and a readable width
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.settings-body > section \{ max-width: 720px; \}/)
assert.match(css, /\.settings-body > section > \.settings-row \{ min-height: 36px;/)
assert.match(css, /fieldset\.settings-row > legend \{ float: left;/)

// SN4: header counts what is visible; split is in the tooltip; shorter placeholder
const sp = readFileSync('src/renderer/src/components/SnippetsPanel.tsx', 'utf8')
assert.match(sp, /data-testid="snip-count" title=\{t\('sn4.split', \{ mine: items.length, builtin: BUILTIN_SNIPPETS.length \}\)\}/)
assert.match(sp, /\{t\('snip.titleN', \{ n: rows.length \}\)\}/)
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.equal(i18n.split("'sn4.split':").length - 1, 2)
assert.match(i18n, /'snip.searchPh': '搜索标题、命令或分类'/)
console.log('test-settings-snippets ok')