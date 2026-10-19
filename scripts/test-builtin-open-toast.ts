/** builtinSnippets / builtinPlaybooks open toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const s = app.indexOf("action === 'builtinSnippets'")
const p = app.indexOf("action === 'builtinPlaybooks'")
assert.ok(s >= 0 && p >= 0)
assert.match(app.slice(s, s + 250), /snip\.builtinOpen/)
assert.match(app.slice(p, p + 280), /m2\.builtinOpen/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("snip.builtinOpen': '打开内置命令片段…'"))
assert.ok(i18n.includes("snip.builtinOpen': 'Opening built-in snippets…'"))
assert.ok(i18n.includes("m2.builtinOpen': '打开内置运维剧本…'"))
assert.ok(i18n.includes("m2.builtinOpen': 'Opening built-in playbooks…'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.43')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-builtin-open-toast/)
console.log('test-builtin-open-toast ok')
