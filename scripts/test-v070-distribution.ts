/** v0.7.0: official update.json first, cache-first UI, no Gitee probe, packaging notes. */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import {
  formatCacheAge,
  loadUpdateCache,
  saveUpdateCache
} from '../src/renderer/src/lib/update-check'
import {
  OFFICIAL_UPDATE_JSON,
  normalizeChannel,
  normalizeRelease,
  planSources,
  probeUpdateSources,
  sourceLabel
} from '../src/shared/update-channel'
import { translate } from '../src/renderer/src/lib/i18n'
import { changelogFor } from '../src/shared/changelog'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { electronLanguages?: string[]; compression?: string; files?: string[] }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.7.0')
assert.ok((pkg.scripts['test:parts'] || '').includes('scripts/test-v070-distribution.ts'))
assert.deepEqual(pkg.build?.electronLanguages, ['en-US', 'zh-CN'])
assert.equal(pkg.build?.compression, 'maximum')
assert.ok(pkg.build?.files?.includes('!**/*.map'))

assert.equal(normalizeChannel('gitee'), 'auto')
assert.equal(normalizeChannel('official'), 'official')
assert.deepEqual(planSources('auto').map((s) => s.id), ['official', 'github'])
assert.equal(planSources('auto')[0]?.url, OFFICIAL_UPDATE_JSON)
assert.equal(sourceLabel('auto', 'zh-CN'), '自动（官网 → GitHub）')
assert.equal(sourceLabel('official', 'zh-CN'), '官网清单')
assert.equal(zh('upd.title'), '有可用更新')
assert.equal(zh('upd.later'), '稍后提醒')
assert.equal(zh('upd.download'), '前往下载')
assert.equal(zh('upd.downloadPan123'), '123云盘下载')
assert.equal(zh('upd.upToDate', { version: '0.7.0' }), '当前已是最新版本 v0.7.0')
assert.ok(!zh('n1.hint').includes('先试 Gitee'))
assert.ok(zh('n1.hint').includes('官网更新清单'))
assert.equal(zh('n1.auto'), '自动（官网 → GitHub）')
assert.equal(en('n1.official'), 'Official manifest only')
assert.ok(!/[\u4e00-\u9fff]/.test(en('n1.hint')))

const manifest = {
  schemaVersion: 1,
  version: '0.8.0',
  notes: '- official notes\n- second',
  htmlUrl: 'https://guoshuaipeng.github.io/ai-ssh-pro/',
  downloads: {
    win32: {
      github: 'https://github.com/guoshuaipeng/ai-ssh-pro/releases/download/v0.8.0/AI-SSH-Pro-0.8.0-win-x64.exe',
      pan123: 'https://www.123pan.com/s/win'
    },
    linux: {
      github: 'https://github.com/guoshuaipeng/ai-ssh-pro/releases/download/v0.8.0/AI-SSH-Pro-0.8.0-linux-x64.AppImage',
      pan123: 'https://www.123pan.com/s/linux'
    }
  },
  pan123: { url: 'https://www.123pan.com/s/all', code: '' }
}
const win = normalizeRelease('official', manifest, OFFICIAL_UPDATE_JSON, 'win32')
assert.equal(win?.version, '0.8.0')
assert.equal(win?.downloadUrl?.includes('win-x64.exe'), true)
assert.equal(win?.pan123Url, 'https://www.123pan.com/s/win')
const linux = normalizeRelease('official', manifest, OFFICIAL_UPDATE_JSON, 'linux')
assert.equal(linux?.pan123Url, 'https://www.123pan.com/s/linux')

const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
const cached = saveUpdateCache(
  { currentVersion: '0.6.63', status: 'available', latestVersion: '0.7.0', source: 'official' },
  store,
  1_000
)
assert.equal(loadUpdateCache(store)?.latestVersion, '0.7.0')
assert.equal(formatCacheAge(cached.at, cached.at + 3 * 60_000, 'zh-CN'), '上次 · 3 分钟前')
assert.equal(formatCacheAge(cached.at, cached.at + 10_000, 'zh-CN'), '上次 · 刚刚')
assert.ok(formatCacheAge(cached.at, cached.at + 3 * 60_000, 'en').includes('3 min'))

function listen(handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void): Promise<{ server: Server; url: string }> {
  const server = createServer(handler)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}/update.json` })
    })
  })
}

const officialHits = { n: 0 }
const githubHits = { n: 0 }
const official = await listen((_req, res) => {
  officialHits.n++
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(manifest))
})
const github = await listen((_req, res) => {
  githubHits.n++
  res.statusCode = 500
  res.end('no')
})
try {
  const r = await probeUpdateSources({
    channel: 'auto',
    currentVersion: '0.7.0',
    platform: 'win32',
    officialUrl: official.url,
    githubUrl: github.url,
    timeoutMs: 1000,
    budgetMs: 3000
  })
  assert.equal(r.status, 'available')
  assert.equal(r.source, 'official')
  assert.equal(r.pan123Url, 'https://www.123pan.com/s/win')
  assert.equal(officialHits.n, 1)
  assert.equal(githubHits.n, 0, 'github not contacted when official answers')
} finally {
  official.server.close()
  github.server.close()
}

const about = readFileSync('src/renderer/src/components/AboutBlock.tsx', 'utf8')
assert.equal(about.includes("t('upd.checking')"), false)
assert.ok(about.includes("t('about.check')"))
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.equal(app.includes("tg('upd.checking')"), false)
assert.ok(app.includes('loadUpdateCache') && app.includes('saveUpdateCache'))
assert.ok(app.includes("!manual && screenshotHooksEnabled()"))
assert.ok(app.includes('shouldAutoCheck()'))
assert.ok(app.includes('pan123Url'))
const modal = readFileSync('src/renderer/src/components/UpdateModal.tsx', 'utf8')
assert.ok(modal.includes('update-overlay'))
assert.ok(modal.includes('upd.downloadPan123'))
assert.ok(modal.includes("variant=\"ghost\""))
assert.ok(modal.includes("variant=\"primary\""))
const settings = readFileSync('src/renderer/src/components/SettingsPanel.tsx', 'utf8')
assert.ok(settings.includes('n1.official'))
assert.equal(settings.includes("['gitee', 'n1.gitee']"), false)
assert.ok(settings.includes('settings-update-cache'))

assert.ok(existsSync('docs/iterations/v0.7.0.md'))
assert.ok(existsSync('docs/update-manifest.md'))
assert.ok(existsSync('docs/website/update.json'))
assert.ok(existsSync('docs/packaging-size.md'))
assert.ok(existsSync('.github/RELEASE_TEMPLATE.md'))
const sample = JSON.parse(readFileSync('docs/website/update.json', 'utf8')) as { version: string; downloads: Record<string, { github?: string; pan123?: string }> }
assert.equal(sample.version, '0.7.0')
assert.ok(sample.downloads.win32?.github && sample.downloads.win32?.pan123)

const readme = readFileSync('README.md', 'utf8')
const readmeZh = readFileSync('README.zh-CN.md', 'utf8')
assert.ok(readme.includes('0.7.0'))
assert.ok(readme.includes('guoshuaipeng.github.io/ai-ssh-pro'))
assert.ok(readme.includes('123'))
assert.ok(!readme.includes('commands run only after confirmation'))
assert.ok(!readme.includes('**No cloud sync.**'))
assert.ok(readmeZh.includes('仅建议'))
assert.ok(!readmeZh.includes('**没有云同步。**'))
assert.ok(readmeZh.includes('123 云盘'))

const design = readFileSync('docs/design/ops-home-redesign.md', 'utf8')
assert.ok(design.includes('已在 v0.6.55 落地'))
assert.equal(design.includes('**待评审，未实现**'), false)

const channel = readFileSync('src/shared/update-channel.ts', 'utf8')
assert.equal(channel.includes('GITEE_LATEST_API'), false)
assert.ok(!channel.includes('gitee.com/api/v5'))

const changelog = readFileSync('CHANGELOG.md', 'utf8')
assert.ok(changelog.includes('## v0.7.0'))
assert.ok(changelogFor('0.7.0').length >= 1)
assert.ok(changelog.includes('update.json'))

console.log('test-v070-distribution ok')
