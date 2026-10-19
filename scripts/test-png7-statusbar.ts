/** PNG-7: status bar height/class and tray title contracts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isEngineerLeak } from '../src/shared/product-error'
import { PRODUCT_NAME, trayHoverTitle } from '../src/shared/product'
import { disconnectStatusSentence, statusBarSlots } from '../src/shared/status-bar'

function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm')
  const m = source.match(re)
  assert.ok(m, `missing rule ${selector}`)
  return m[1]!
}

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const status = ruleBody(styles, '.app-statusbar')
assert.match(status, /height:\s*24px/)
assert.match(status, /min-height:\s*22px/)
assert.match(status, /max-height:\s*24px/)
assert.match(status, /background:\s*var\(--color-bg-surface\)/)
assert.match(status, /flex-wrap:\s*nowrap/)
assert.match(status, /overflow:\s*hidden/)
assert.match(styles, /@media \(max-width:\s*1366px\)\s*\{[^}]*\.app-statusbar\s*\{[^}]*height:\s*24px/)
assert.match(styles, /@media \(max-width:\s*1366px\)\s*\{[\s\S]*?\.main\s*\{\s*min-width:\s*0/)
assert.match(styles, /\.statusbar-slot--disconnect/)
assert.match(styles, /\.statusbar-reconnect/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const foot = app.slice(app.indexOf('data-testid="app-statusbar"'))
assert.ok(foot.includes('className="app-statusbar"') || app.includes('className="app-statusbar"'))
assert.ok(foot.includes('data-testid="sync-status"'))
assert.ok(foot.includes('data-testid="statusbar-record"'))
assert.ok(foot.includes('data-testid="statusbar-broadcast"'))
assert.ok(foot.includes('data-testid="statusbar-disconnect"'))
assert.ok(foot.includes('data-testid="statusbar-reconnect"'))
assert.ok(app.includes('data-testid="statusbar-ai-pending"'))
assert.ok(app.includes("sb.aiPending"))
assert.ok(app.includes("openAiPendingConfirm"))
assert.ok(foot.includes('pf5.reconnect'))
assert.ok(foot.indexOf('data-testid="statusbar-disconnect"') < foot.indexOf('</footer>'))
assert.ok(app.indexOf('className="app-shell"') < app.indexOf('data-testid="app-statusbar"'))

assert.deepEqual(statusBarSlots({ syncEnabled: false, phase: 'synced' }), { tray: false, slots: [] })
const synced = statusBarSlots({ syncEnabled: true, phase: 'synced' })
assert.equal(synced.tray, false)
assert.equal(synced.slots.map((slot) => slot.id).join(','), 'sync')
assert.equal(synced.slots[0]?.glyph, '✓')

const idle = statusBarSlots({ syncEnabled: false, phase: 'off', recording: false, broadcastCount: 0, disconnected: false })
assert.deepEqual(idle.slots, [])

const all = statusBarSlots({
  syncEnabled: true,
  phase: 'syncing',
  recording: true,
  broadcastCount: 2,
  disconnected: true,
  host: 'web-1',
  tabId: 'tab-1'
})
assert.deepEqual(all.slots.map((slot) => slot.id), ['disconnect', 'broadcast', 'record', 'sync'])
assert.ok(all.slots.every((slot, i) => i === 0 || slot.priority < all.slots[i - 1]!.priority))
assert.equal(all.slots.find((slot) => slot.id === 'broadcast')?.count, 2)
assert.equal(statusBarSlots({ syncEnabled: true, phase: 'off', recording: true }).slots.map((slot) => slot.id).join(','), 'record')

const zh = disconnectStatusSentence('web-1', 'zh-CN')
const en = disconnectStatusSentence('web-1', 'en')
assert.equal(zh, '与 web-1 的连接已断开')
assert.equal(en, 'The connection to web-1 dropped')
assert.equal(disconnectStatusSentence('', 'zh-CN'), '连接已断开')
assert.equal(disconnectStatusSentence('', 'en'), 'The connection dropped')
const leaked = "Error invoking remote method 'ssh:connect': Error: connect ECONNREFUSED 10.0.0.1:22"
assert.equal(disconnectStatusSentence(leaked, 'zh-CN'), '连接已断开')
assert.equal(disconnectStatusSentence('/home/ubuntu/out/renderer/index.html', 'en'), 'The connection dropped')
assert.equal(isEngineerLeak(zh), false)
assert.equal(isEngineerLeak(en), false)
assert.equal(isEngineerLeak(disconnectStatusSentence(leaked, 'en')), false)

const title = trayHoverTitle()
assert.equal(title, PRODUCT_NAME)
assert.equal(title, 'AI-SSH-Pro')
assert.equal(/[\\/]|file:|\.html|\.tsx|node_modules/.test(title), false)

const about = readFileSync('src/renderer/src/components/AboutBlock.tsx', 'utf8')
const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.ok(about.includes('PRODUCT_NAME'))
assert.ok(toolbar.includes('PRODUCT_NAME'))
assert.equal(readFileSync('src/renderer/index.html', 'utf8').includes(`<title>${PRODUCT_NAME}</title>`), true)

const index = readFileSync('src/main/index.ts', 'utf8')
const create = index.slice(index.indexOf('function createWindow'), index.indexOf('function openDebugWindow'))
assert.match(create, /title:\s*trayHoverTitle\(\)/)
assert.match(create, /applyBrandPresence\(/)
assert.doesNotMatch(create, /title:\s*['"`][^'"`]*[/\\][^'"`]*['"`]/)
const brand = readFileSync('src/main/brand-presence.ts', 'utf8')
assert.match(brand, /setToolTip\(title\)/)
assert.match(brand, /new Tray\(/)
assert.equal(brand.includes('sync'), false)
assert.match(brand, /trayHoverTitle\(\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'sb\.recording': '正在录制'/)
assert.match(i18n, /'sb\.recording': 'Recording'/)
assert.match(i18n, /'sb\.broadcast': '正在广播 · \{n\}'/)
assert.match(i18n, /'sb\.broadcast': 'Broadcasting · \{n\}'/)
assert.match(i18n, /'pf5\.reconnect': '重连'/)
assert.match(i18n, /'pf5\.reconnect': 'Reconnect'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.38')

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
assert.match(unreleased, /PNG-7/)
assert.match(unreleased, /Public HOLD/)
assert.match(unreleased, /0\.4\.4/)

console.log('test-png7-statusbar ok')
