/** Sidebar / main / AI pane toggles toast using toolbar.* keys. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /toolbar\.showSidebar/)
assert.match(app, /toolbar\.hideSidebar/)
assert.match(app, /toolbar\.showMain/)
assert.match(app, /toolbar\.hideMain/)
assert.match(app, /toolbar\.showAi/)
assert.match(app, /toolbar\.hideAi/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("toolbar.hideSidebar': '隐藏左侧会话栏'"))
assert.ok(i18n.includes("toolbar.showSidebar': 'Show session sidebar'"))
assert.ok(i18n.includes("toolbar.hideAi': '隐藏右侧 AI 面板'"))
assert.ok(i18n.includes("toolbar.showAi': 'Show AI panel'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.55')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-pane-toggle-toast/)
console.log('test-pane-toggle-toast ok')
