/** Tour/welcome/settings/about open toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const checks: [string, string][] = [
  ['tour', 'l7.tour'],
  ['quickStart', 'pf1.welcome'],
  ['replayWelcome', 'pf1.replay'],
  ['about', 'about.desc'],
  ['settings', 'settings.title'],
]
for (const [action, key] of checks) {
  const idx = app.indexOf(`action === '${action}'`)
  assert.ok(idx >= 0, action)
  assert.match(app.slice(idx, idx + 500), new RegExp(key.replace(/\./g, '\\.')))
}

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l7.tour': '打开新手引导'"))
assert.ok(i18n.includes("pf1.welcome': '欢迎使用 AI-SSH-Pro'"))
assert.ok(i18n.includes("pf1.replay': '再次打开欢迎'"))
assert.ok(i18n.includes('about.desc'))
assert.ok(i18n.includes("settings.title': '设置'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.43')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-welcome-settings-open-toasts/)
console.log('test-welcome-settings-open-toasts ok')
