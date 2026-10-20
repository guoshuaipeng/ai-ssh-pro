/** Polish-1 soft-start: PF-1 welcome prefs, PF-3 toolbar restraint, PF-4 empty copy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldShowWelcome, loadWelcomePrefs, saveWelcomeCompleted, saveWelcomeDismissed } from '../src/shared/welcome-prefs'
import { translate } from '../src/renderer/src/lib/i18n'

const base = {
  hostCount: 0,
  dismissed: false,
  completed: false,
  releaseNotesOpen: false,
  notesHeld: false,
  replay: false
}

assert.equal(shouldShowWelcome(base), true, 'cold start with zero hosts shows welcome')
assert.equal(shouldShowWelcome({ ...base, hostCount: 1 }), false, 'a saved connection completes the welcome')
assert.equal(shouldShowWelcome({ ...base, dismissed: true }), false, 'maybe later stays dismissed')
assert.equal(shouldShowWelcome({ ...base, completed: true }), false, 'completed stays hidden')
assert.equal(shouldShowWelcome({ ...base, releaseNotesOpen: true }), false, 'release notes take this turn')
assert.equal(shouldShowWelcome({ ...base, notesHeld: true }), false, 'welcome waits until the next launch')
assert.equal(shouldShowWelcome({ ...base, hostCount: 2, replay: true }), true, 'help replay does not need zero hosts')
assert.equal(shouldShowWelcome({ ...base, replay: true, releaseNotesOpen: true }), false, 'replay still yields to release notes')
assert.equal(shouldShowWelcome({ ...base, tourOpen: true }), false, 'no dual overlay with the tour')
assert.equal(shouldShowWelcome({ ...base, quickOpen: true }), false, 'no dual overlay with quick start')

const mem = new Map<string, string>()
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v)
}
saveWelcomeDismissed(true, store)
saveWelcomeCompleted(true, store)
assert.deepEqual(loadWelcomePrefs(store), { dismissed: true, completed: true })

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) => translate('en', key, vars)

assert.equal(zh('pf1.welcome'), '欢迎使用 AI-SSH-Pro')
assert.equal(zh('pf1.headline'), '连接 · 观察 · 修复')
assert.equal(zh('brand.tagline'), '本地优先的 AI 运维工作台')
assert.equal(zh('pf1.import'), '导入会话…')
assert.equal(zh('pf1.new'), '新建连接')
assert.equal(zh('pf1.demo'), '连接演示主机')
assert.equal(zh('pf1.later'), '稍后')
assert.equal(en('pf1.welcome'), 'Welcome to AI-SSH-Pro')
assert.equal(en('pf1.headline'), 'Connect · Observe · Fix')
assert.equal(en('brand.tagline'), 'Local-first AI ops workbench')
assert.equal(en('pf1.import'), 'Import sessions…')
assert.equal(en('pf1.new'), 'New connection')
assert.equal(en('pf1.demo'), 'Connect demo host')
assert.equal(en('pf1.later'), 'Later')
assert.ok(zh('brand.tagline').length <= 28, 'tagline stays within 28 characters')

for (const key of ['pf4.hostsDesc', 'pf4.sftpTitle', 'pf4.snipTitle', 'pf4.fwdTitle', 'pf4.alertTitle', 'pf4.playbookTitle', 'pf4.auditTitle', 'pf4.recTitle', 'pf4.paletteTitle'] as const) {
  const title = zh(key, { q: '磁盘' })
  assert.ok(!/^暂无|^无数据/.test(title), `${key} is not a bare 暂无`)
  assert.ok(en(key, { q: 'disk' }).length > 0, `${key} has english`)
}
assert.equal(zh('pf4.pickHost'), '选择主机并连接')
assert.equal(zh('pf4.alertHome'), '返回运维首页')
assert.ok([...zh('pf4.playbookTitle')].length <= 16, 'playbook title length')
assert.ok([...zh('pf4.snipTitle')].length <= 16, 'snippet title length')

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsEnd = toolbar.indexOf(']', opsStart)
const ops = toolbar.slice(opsStart, opsEnd)
assert.ok(ops.includes('resourceMonitor') && ops.includes('serverTools') && ops.includes('sftp'), 'three ops')
assert.ok(!ops.includes('portForward') && !ops.includes('snippets') && !ops.includes('backup'), 'ops stay at three')
assert.ok(!toolbar.includes('display: "none"') && !toolbar.includes('display:"none"'), 'more menu is not hidden')
assert.ok(toolbar.includes('data-tool="more"') && toolbar.includes('data-tool="recent"'), 'recent and more are factory chrome')
assert.ok(!/[📊🧰📁]/.test(toolbar), 'toolbar has no ops emoji')

const welcome = readFileSync('src/renderer/src/components/WelcomePanel.tsx', 'utf8')
assert.ok(welcome.includes('className="secondary"') && !welcome.includes('className="primary"'), 'welcome CTAs are secondary')
assert.ok(welcome.includes('data-command="importSessions"') && welcome.includes('data-command="connection"') && welcome.includes('data-command="demoHost"'))

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('data-command="importSessions"') || app.includes("command: 'importSessions'"), 'sidebar shares import command')
assert.ok(app.includes('WelcomePanel'), 'welcome is mounted from the shell')
assert.ok(!app.includes('window.confirm'), 'no native confirm')

const css = readFileSync('src/renderer/src/styles.css', 'utf8') + readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.modal-footer\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(css, /\.tab-bar\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(css, /:focus-visible\s*\{[^}]*--color-focus-ring/)
assert.ok(css.includes('--color-bg-elevated') && css.includes('--space-3') && css.includes('--radius-xl'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.63', 'package version')

console.log('test-polish-1 ok')
