import assert from 'node:assert/strict'
import { normalizeSiteManifest, planSources, probeUpdateSources, sourceLabel, SITE_LATEST_URL, GITHUB_LATEST_API } from '../src/shared/update-channel'

const manifest = {
  schemaVersion: 1,
  version: '0.6.63',
  date: '2026-10-20',
  releaseNotesUrl: 'https://github.com/guoshuaipeng/ai-ssh-pro/releases/tag/v0.6.63',
  downloads: {
    'win32-x64': { sha256: 'A'.repeat(64), url: 'https://github.com/x/win.exe' },
    'darwin-arm64': { sha256: 'b'.repeat(64), url: 'https://github.com/x/mac.dmg' },
    'linux-x64': { sha256: 'bad', url: 'notaurl' }
  }
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })

// 1. Auto plan: site first, GitHub second, no Gitee
const plan = planSources('auto')
assert.deepEqual(plan.map((p) => p.id), ['site', 'github'])
assert.equal(plan[0]!.url, SITE_LATEST_URL)
assert.equal(planSources('gitee')[0]!.id, 'gitee')

// 2. Manifest parsing: GitHub URL, sha normalized
const w = normalizeSiteManifest(manifest, SITE_LATEST_URL, 'win32', 'x64')!
assert.equal(w.version, '0.6.63')
assert.equal(w.downloadUrl, 'https://github.com/x/win.exe')
assert.equal(w.sha256, 'a'.repeat(64))
assert.equal(w.releaseUrl, manifest.releaseNotesUrl)
const m = normalizeSiteManifest(manifest, SITE_LATEST_URL, 'darwin', 'arm64')!
assert.equal(m.downloadUrl, 'https://github.com/x/mac.dmg')
const mx = normalizeSiteManifest(manifest, SITE_LATEST_URL, 'darwin', 'x64')!
assert.equal(mx.downloadUrl, 'https://github.com/x/mac.dmg', 'platform prefix fallback when arch missing')
const l = normalizeSiteManifest(manifest, SITE_LATEST_URL, 'linux', 'x64')!
assert.equal(l.downloadUrl, undefined, 'invalid url rejected')
assert.equal(l.sha256, undefined)
assert.equal(normalizeSiteManifest({ version: '' }, SITE_LATEST_URL, 'win32'), null)
assert.equal(normalizeSiteManifest({ version: 'abc' }, SITE_LATEST_URL, 'win32'), null)

// 3. Site answers: no fallback, Gitee never contacted
{
  const calls: string[] = []
  const r = await probeUpdateSources({
    channel: 'auto', currentVersion: '0.6.60', platform: 'win32', arch: 'x64',
    fetchImpl: async (u) => { calls.push(u); return json(manifest) }
  })
  assert.equal(r.status, 'available')
  assert.equal(r.source, 'site')
  assert.equal(r.fellBack, false)
  assert.deepEqual(r.tried, ['site'])
  assert.equal(r.sha256, 'a'.repeat(64))
  assert.ok(calls.every((u) => !/gitee/.test(u)))
}

// 4. Site 404 → GitHub fallback, reported
{
  const r = await probeUpdateSources({
    channel: 'auto', currentVersion: '0.6.63', platform: 'win32',
    fetchImpl: async (u) => (u === SITE_LATEST_URL ? json({}, 404) : json({ tag_name: 'v0.6.63', assets: [] }))
  })
  assert.equal(r.status, 'upToDate')
  assert.equal(r.source, 'github')
  assert.equal(r.fellBack, true)
  assert.deepEqual(r.tried, ['site', 'github'])
  assert.match(r.message, /回退/)
}

// 5. Site hangs → per-source timeout, GitHub still answers within the budget
{
  const started = Date.now()
  const r = await probeUpdateSources({
    channel: 'auto', currentVersion: '0.6.0', platform: 'win32', timeoutMs: 200, budgetMs: 1000,
    fetchImpl: (u, init) =>
      u === GITHUB_LATEST_API
        ? Promise.resolve(json({ tag_name: 'v0.6.63', assets: [] }))
        : new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  })
  assert.equal(r.source, 'github')
  assert.equal(r.fellBack, true)
  assert.ok(Date.now() - started < 1000)
}

// 6. Both fail → error, nothing hangs past budget
{
  const r = await probeUpdateSources({ channel: 'auto', currentVersion: '0.6.0', fetchImpl: async () => json({}, 500) })
  assert.equal(r.status, 'error')
  assert.equal(r.fellBack, true)
}

// 7. Labels
assert.equal(sourceLabel('site', 'zh-CN'), '官网')
assert.equal(sourceLabel('site', 'en'), 'Official site')
assert.equal(sourceLabel('auto', 'zh-CN'), '自动（官网 → GitHub）')

// 8. Published manifest in the sibling pages repo (when present) parses
try {
  const fs = await import('node:fs')
  const p = new URL('../../ai-ssh-pro-pages/latest.json', import.meta.url)
  if (fs.existsSync(p)) {
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'))
    for (const [plat, arch] of [['win32', 'x64'], ['darwin', 'arm64'], ['linux', 'x64']] as const) {
      const rel = normalizeSiteManifest(doc, SITE_LATEST_URL, plat, arch)!
      assert.ok(rel.downloadUrl && rel.sha256, `${plat} entry complete`)
    }
  }
} catch (e) {
  if (e instanceof assert.AssertionError) throw e
}

console.log('test-update-site-json: OK')
