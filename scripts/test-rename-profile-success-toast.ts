/** renameProfile toasts on successful rename. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const renameProfile')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 950)
assert.match(chunk, /showToast\(tg\('ctx\.renamed', \{ name: renamed \}\)\)/)
assert.match(chunk, /persistSessionState/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("ctx.renamed': '已重命名为「{name}」'"))
assert.ok('ctx.renamed' in Object.fromEntries(
  [...i18n.matchAll(/'(ctx\.renamed)':\s*'([^']*)'/g)].map((m) => [m[1], m[2]])
) || i18n.includes('ctx.renamed'))
assert.ok(i18n.includes('Renamed to'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-rename-profile-success-toast/)
console.log('test-rename-profile-success-toast ok')
