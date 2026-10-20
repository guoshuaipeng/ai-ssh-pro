/** github menu action toasts before opening repo. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'github'")
assert.ok(idx >= 0)
assert.match(app.slice(idx, idx + 250), /toolbar\.openGithub/)
assert.match(app.slice(idx, idx + 250), /showToast\(tg\('toolbar\.openGithub'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("toolbar.openGithub': '在浏览器打开 GitHub 仓库'"))
assert.ok(i18n.includes("toolbar.openGithub': 'Open the GitHub repository in a browser'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.7.0')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-github-open-toast/)
console.log('test-github-open-toast ok')
