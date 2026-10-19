/** clearScrollback toast includes host. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes("tg('term.scrollbackCleared', { host })"))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("term.scrollbackCleared': '已清空 {host} 的回滚缓冲'"))
assert.ok(i18n.includes("term.scrollbackCleared': 'Cleared scrollback for {host}'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.58')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-scrollback-cleared-host/)
console.log('test-scrollback-cleared-host ok')
