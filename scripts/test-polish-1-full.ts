/** Polish-1 complete batch: PF-2/5/6/7/8 and N1★ presentation. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { effectiveChannelLabel, saveUpdateChannelPrefs, rememberUpdateSource } from '../src/shared/update-channel'
import { settingsSectionsForQuery, type SettingsSection } from '../src/shared/settings-nav'
import { isEngineerLeak, noticeKind, shouldShowSkeleton } from '../src/shared/product-error'
import { friendlyError } from '../src/renderer/src/lib/friendly-error'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

assert.equal(zh('about.check'), '检查更新')
assert.equal(zh('about.whatsNew'), '更新内容')
assert.notEqual(zh('about.check'), zh('about.whatsNew'))
assert.equal(zh('about.versionLine', { v: 'v0.4.4', channel: 'Gitee' }), '版本 v0.4.4 · 更新通道：Gitee')
assert.equal(zh('brand.tagline'), '本地优先的 AI 运维工作台')
assert.equal(en('brand.tagline'), 'Local-first AI ops workbench')
assert.equal(zh('about.local'), '密钥与会话默认保存在本机')
assert.equal(en('about.check'), 'Check for updates')
assert.equal(en('about.whatsNew'), "What's new")
assert.ok(!zh('about.check').includes('…'))
assert.ok(!/TODO|FIXME|vault/i.test(zh('about.local') + zh('about.check') + zh('pf5.updateFail', { channel: 'Gitee' })))

assert.equal(zh('pf5.updateFail', { channel: 'Gitee' }), '暂时无法检查更新 · 源：Gitee')
assert.equal(zh('pf5.sshUnreachable', { host: 'db' }), '无法连接到 db')
assert.equal(zh('pf5.auth'), '用户名或密钥未通过验证')
assert.equal(zh('pf5.importFail'), '无法解析该文件')
assert.equal(zh('pf5.aiFail'), '助手暂时无响应')
assert.equal(zh('pf5.sftpPerm'), '没有权限访问此路径')
assert.equal(zh('pf7.connectFirst'), '先连接一台主机')
assert.equal(zh('settings.none', { q: '没有' }), '没有找到「没有」相关设置')
assert.ok(en('pf5.updateFail', { channel: 'GitHub' }).includes('GitHub'))
assert.ok(!zh('about.versionLine', { v: 'v0.4.4', channel: 'Gitee' }).includes('['))

const labels = {
  general: '通用',
  appearance: '外观',
  terminal: '终端',
  connections: '连接',
  ops: '运维',
  ai: 'AI',
  shortcuts: '快捷键',
  security: '安全',
  files: '文件',
  backup: '备份与同步',
  about: '关于'
} as Record<SettingsSection, string>
assert.ok(settingsSectionsForQuery('更新', labels).includes('about'))
assert.ok(settingsSectionsForQuery('主题', labels).includes('appearance'))
assert.ok(settingsSectionsForQuery('密钥', labels).includes('ai'))
assert.equal(settingsSectionsForQuery('zzzz-no-such', labels).length, 0)

const mem = new Map<string, string>()
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v)
}
saveUpdateChannelPrefs({ channel: 'auto', mirror: '' }, store)
assert.equal(effectiveChannelLabel('zh-CN', store), '自动（Gitee → GitHub）')
rememberUpdateSource({ source: 'gitee', channel: 'auto', at: 1 }, store)
assert.equal(effectiveChannelLabel('zh-CN', store), 'Gitee')
saveUpdateChannelPrefs({ channel: 'github', mirror: '' }, store)
assert.equal(effectiveChannelLabel('zh-CN', store), 'GitHub')

assert.equal(noticeKind("Error invoking remote method 'ssh:connect': Error: connect ECONNREFUSED 10.0.0.1:22"), 'unreachable')
assert.equal(noticeKind('All configured authentication methods failed'), 'auth')
assert.equal(noticeKind('Permission denied: /var'), 'permission')
assert.equal(noticeKind('Session disconnected'), 'dropped')
assert.equal(shouldShowSkeleton(299), false)
assert.equal(shouldShowSkeleton(300), true)

for (const sample of [
  "Error invoking remote method 'ssh:connect': Error: connect ECONNREFUSED 10.0.0.1:22",
  'All configured authentication methods failed',
  'connect ETIMEDOUT 10.0.0.8:22',
  'Permission denied: /root',
  'getaddrinfo ENOTFOUND missing.example'
]) {
  const fe = friendlyError(sample, { locale: 'zh-CN' })
  assert.equal(isEngineerLeak(fe.message), false, fe.message)
  assert.ok(fe.message.length > 0)
}

const css = [
  readFileSync('src/renderer/src/styles.css', 'utf8'),
  readFileSync('src/renderer/src/features.css', 'utf8'),
  readFileSync('src/renderer/src/styles-m2.css', 'utf8')
].join('\n')
assert.equal(css.match(/var\(\s*--[a-z0-9-]+\s*,\s*#/gi), null, 'no hex fallback in var()')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
  .replace(/\.tab\.tab-guard-prod\s*\{[^}]*\}/, '')
assert.equal(features.match(/#(161a20|1d222a|2a3039|3b82f6|22c55e|f59e0b|ef4444|e11d48|0f1115)\b/gi), null)
assert.match(css, /\.layout-resizer\s*\{[^}]*width:\s*1px/)
assert.match(css, /\.app-statusbar\s*\{[^}]*height:\s*28px/)
assert.match(css, /\.titlebar-menu-dropdown\s*\{[^}]*var\(--shadow-menu\)/)
assert.match(css, /\.sftp-pane\.is-active\s*\{[^}]*outline:\s*none/)
assert.ok(css.includes('--surface-1: var(--color-bg-surface)'))
assert.ok(css.includes('--color-ok: #3fb950') || css.includes('--ok: #3fb950'))

const about = readFileSync('src/renderer/src/components/AboutBlock.tsx', 'utf8')
const settings = readFileSync('src/renderer/src/components/SettingsPanel.tsx', 'utf8')
const modal = readFileSync('src/renderer/src/components/AboutModal.tsx', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.ok(settings.includes('AboutBlock') && modal.includes('AboutBlock'))
assert.ok(about.includes('about.check') && about.includes('about.whatsNew') && about.includes("className=\"primary\""))
assert.ok(!about.includes('about.ok'))
assert.ok(app.includes('data-testid="app-statusbar"') || app.includes("className=\"app-statusbar\""))
assert.ok(app.includes('openUnifiedSettings') && app.includes("sectionForAction('settings')"))
assert.ok(!app.includes('window.confirm') && !settings.includes('window.confirm'))
assert.ok(toolbar.includes('pf7.connectFirst'))
assert.ok(!toolbar.includes('file://'))
assert.ok(toolbar.includes('PRODUCT_NAME') && toolbar.includes("-dev"))
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsEnd = toolbar.indexOf(']', opsStart)
assert.equal((toolbar.slice(opsStart, opsEnd).match(/id: '/g) ?? []).length, 3)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.57')

console.log('test-polish-1-full ok')
