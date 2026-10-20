/** v0.3.19: N1 two-source update mocks, O4 locate, A4 context, D5 diff, UX-46 density, N2 import, G3 tasks */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeUpdateSources, planSources, normalizeRelease, SOURCE_TIMEOUT_MS, AUTO_BUDGET_MS } from '../src/shared/update-channel'
import { locateTargetFor, reconcileAlerts, ignoreAlert, alertHostIds } from '../src/shared/alert-locate'
import { buildAlertContext, ALERT_JOURNAL_MAX } from '../src/shared/alert-context'
import { pairSideBySide, toUnified, isTooLargeToCompare, COMPARE_BYTE_LIMIT } from '../src/shared/file-diff'
import { diffLines } from '../src/renderer/src/lib/simple-highlight'
import { resolveSftpDensity, COMPACT_BREAKPOINT } from '../src/shared/sftp-density'
import { applyImportPolicy, buildImportPreview, publicRows, redactSecrets } from '../src/shared/import-preview'
import { completeTask, dismissTasksForever, loadTaskState, pendingTasks, reopenTasks, skipTask } from '../src/shared/retention-tasks'
import { parseDf } from '../src/shared/server-tools'
import { parseFinalShell } from '../src/main/session-import-extra'
import { importSessionFilesFromPaths } from '../src/main/session-import'
import { changelogFor } from '../src/shared/changelog'
import { SHARED_MENUS } from '../src/shared/menus'
import { readFileSync } from 'node:fs'
import type { FiredAlert } from '../src/shared/alert-rules'

let n = 0
const ok = (cond: boolean, msg: string) => {
  assert.ok(cond, msg)
  n++
}

function listen(handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void): Promise<{ server: Server; url: string }> {
  const server = createServer(handler)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}/latest` })
    })
  })
}

const giteeBody = {
  tag_name: 'v9.9.9',
  name: 'gitee release',
  body: '- from gitee\n',
  html_url: 'https://gitee.com/guoshuaipeng/ai-ssh-pro/releases/tag/v9.9.9',
  assets: [{ name: 'AI-SSH-Pro-Setup.exe', browser_download_url: 'https://gitee.com/guoshuaipeng/ai-ssh-pro/releases/download/v9.9.9/AI-SSH-Pro-Setup.exe' }]
}
const githubBody = {
  tag_name: 'v9.9.8',
  name: 'github release',
  body: '- from github\n',
  html_url: 'https://github.com/guoshuaipeng/ai-ssh-pro/releases/tag/v9.9.8',
  assets: [{ name: 'AI-SSH-Pro-Setup.exe', browser_download_url: 'https://github.com/guoshuaipeng/ai-ssh-pro/releases/download/v9.9.8/setup.exe' }]
}

const giteeHits = { n: 0 }
const githubHits = { n: 0 }
const gitee = await listen((req, res) => {
  giteeHits.n++
  if (giteeHits.n === 1) {
    res.statusCode = 500
    res.end('nope')
    return
  }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(giteeBody))
})
const github = await listen((_req, res) => {
  githubHits.n++
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(githubBody))
})

try {
  ok(SOURCE_TIMEOUT_MS === 8000 && AUTO_BUDGET_MS === 16000, 'timeout budget')
  ok(planSources('auto').map((s) => s.id).join(',') === 'site,github', 'auto order (site manifest, then GitHub; Gitee not in auto)')
  ok(planSources('github').length === 1 && planSources('github')[0]!.id === 'github', 'github only')
  ok(planSources('custom', 'notaurl').length === 0, 'bad mirror')

  const fallback = await probeUpdateSources({
    channel: 'auto',
    currentVersion: '0.3.19',
    platform: 'win32',
    siteUrl: gitee.url,
    githubUrl: github.url,
    timeoutMs: 1000,
    budgetMs: 3000
  })
  ok(fallback.status === 'available' && fallback.source === 'github', 'gitee failure falls back to github')
  ok(fallback.downloadUrl?.includes('github.com') === true, 'download url is the github asset')
  ok(!fallback.downloadUrl?.includes('gitee.com'), 'fallback does not keep a gitee url')
  ok(githubHits.n === 1 && giteeHits.n === 1, 'both sources contacted once')

  const giteeOnly = await probeUpdateSources({
    channel: 'gitee',
    currentVersion: '0.3.19',
    platform: 'win32',
    giteeUrl: gitee.url,
    githubUrl: github.url,
    timeoutMs: 1000
  })
  ok(giteeOnly.source === 'gitee' && giteeOnly.downloadUrl?.includes('gitee.com') === true, 'gitee channel downloads from gitee')
  ok(giteeOnly.releaseUrl?.includes('gitee.com') === true, 'gitee release page')
  ok(githubHits.n === 1, 'github not called for gitee channel')

  const mirror = await listen((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({
      tag_name: 'v1.2.3',
      html_url: 'https://mirror.example/rel/v1.2.3',
      assets: [{ name: 'app.exe', browser_download_url: 'https://mirror.example/app.exe' }]
    }))
  })
  try {
    const custom = await probeUpdateSources({
      channel: 'custom',
      customUrl: mirror.url,
      currentVersion: '0.1.0',
      platform: 'win32',
      giteeUrl: gitee.url,
      githubUrl: github.url,
      timeoutMs: 1000
    })
    ok(custom.source === 'custom' && custom.downloadUrl === 'https://mirror.example/app.exe', 'custom mirror download stays on the mirror')
    ok(githubHits.n === 1 && !String(custom.downloadUrl).includes('github.com'), 'custom does not substitute GitHub')
  } finally {
    mirror.server.close()
  }

  const slow = await listen((_req, res) => {
    setTimeout(() => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(giteeBody))
    }, 5000)
  })
  const fast = await listen((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(githubBody))
  })
  try {
    const started = Date.now()
    const raced = await probeUpdateSources({
      channel: 'auto',
      currentVersion: '0.3.19',
      platform: 'linux',
      siteUrl: slow.url,
      githubUrl: fast.url,
      timeoutMs: 80,
      budgetMs: 400
    })
    const elapsed = Date.now() - started
    ok(raced.source === 'github' && raced.downloadUrl?.includes('github.com') === true, 'slow gitee times out then github answers')
    ok(elapsed < 2000, `auto stays inside a short budget (${elapsed}ms)`)
  } finally {
    slow.server.close()
    fast.server.close()
  }
} finally {
  gitee.server.close()
  github.server.close()
}

const rel = normalizeRelease('gitee', giteeBody, 'http://gitee.local/latest', 'win32')
ok(rel?.downloadUrl?.startsWith('https://gitee.com/') === true, 'normalize keeps gitee asset')

ok(locateTargetFor('disk').kind === 'toolbox' && locateTargetFor('disk').kind === 'toolbox' && (locateTargetFor('disk') as { tab?: string }).tab === 'df', 'disk → df')
ok((locateTargetFor('cpu') as { tab?: string }).tab === 'processes', 'cpu → processes')
ok((locateTargetFor('mem') as { tab?: string }).tab === 'processes', 'mem → processes')
ok((locateTargetFor('service') as { tab?: string }).tab === 'services', 'service → systemd')
ok(locateTargetFor('offline').kind === 'terminal', 'offline → terminal')

const sample: FiredAlert = {
  id: 'a1',
  hostKey: 'sess-1',
  hostTitle: 'web',
  ruleId: 'disk',
  value: 96,
  threshold: 85,
  at: 1,
  status: 'active'
}
const kept = reconcileAlerts([sample], new Set(['sess-1:disk']))
ok(kept[0]?.status === 'active', 'alert stays while breaching')
const recovered = reconcileAlerts(kept, new Set())
ok(recovered[0]?.status === 'recovered', 'recover clears the alert')
const ignored = ignoreAlert([sample], 'a1')
ok(ignored[0]?.status === 'ignored', 'ignore')
ok(!alertHostIds(ignored, new Set(['sess-1:disk'])).has('sess-1'), 'ignored host is not badged')

const ctx = buildAlertContext({
  host: 'web',
  ruleId: 'disk',
  value: 96,
  threshold: 85,
  snapshot: { cpuPercent: 10, memPercent: 20, disks: [{ mount: '/', percent: 96 }] },
  journal: 'x'.repeat(ALERT_JOURNAL_MAX + 50)
})
ok(ctx.includes('Host: web') && ctx.includes('disk / 96%'), 'alert context uses this host snapshot')
ok(!ctx.includes('other-host'), 'context has no second host')
ok((ctx.split('Recent journal (truncated):\n')[1] ?? '').length === ALERT_JOURNAL_MAX, 'journal slice cap')

const lines = diffLines('a\nb\nc', 'a\nB\nc')
const rows = pairSideBySide(lines)
ok(rows.some((r) => r.left.kind === 'del' && r.left.text === 'b'), 'side by side delete')
ok(rows.some((r) => r.right.kind === 'add' && r.right.text === 'B'), 'side by side add')
ok(toUnified(lines, 'local', 'remote').includes('--- local') && toUnified(lines, 'local', 'remote').includes('-b'), 'unified')
ok(isTooLargeToCompare(COMPARE_BYTE_LIMIT + 1) && !isTooLargeToCompare(10), '2MB gate')

ok(resolveSftpDensity('auto', 1366) === 'compact', '1366 compact')
ok(resolveSftpDensity('auto', COMPACT_BREAKPOINT + 1) === 'comfort', 'above 1366 comfort')
ok(resolveSftpDensity('comfort', 1024) === 'comfort', 'comfort override')

const SECRET = 's3cret-final-password'
const finalShell = JSON.stringify({
  connections: [
    { name: 'web', host: '192.0.2.10', port: 22, user_name: 'root', password: SECRET, group: 'prod' },
    { name: 'db', host: '192.0.2.11', port: 2222, userName: 'dba', folder: 'prod' }
  ]
})
const parsed = parseFinalShell(finalShell)
ok(parsed.length === 2 && parsed[0]?.group === 'prod' && parsed[0]?.password === SECRET, 'finalshell fields')
const xsh = ['Host=192.0.2.20', 'Port=22', 'UserName=ops', 'Name=edge', `Password=${SECRET}`].join('\n')
const dir = mkdtempSync(join(tmpdir(), 'aissh-n2-'))
try {
  writeFileSync(join(dir, 'final.json'), finalShell)
  writeFileSync(join(dir, 'edge.xsh'), xsh)
  const imported = await importSessionFilesFromPaths([join(dir, 'final.json'), join(dir, 'edge.xsh')])
  ok(imported.items.length === 3, `two formats imported (${imported.items.length})`)
  ok(!imported.notes.join('\n').includes(SECRET), 'notes do not contain the password')
  const preview = buildImportPreview(imported.items, [{ id: 'p1', host: '192.0.2.10', port: 22, username: 'root' }], imported.notes)
  ok(preview.hostCount === 3 && preview.conflictCount === 1, 'preview counts')
  ok(preview.groups.some((g) => g.name === 'prod' && g.count === 2), 'groups')
  ok(!JSON.stringify(publicRows(preview)).includes(SECRET), 'preview rows omit secrets')
  const mem = new Map<string, string>()
  const store = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v)
  }
  const applied = applyImportPolicy({
    model: preview,
    policy: 'skip',
    profiles: [{ id: 'p1', label: 'old', host: '192.0.2.10', port: 22, username: 'root' }],
    folders: [],
    newId: () => `id-${Math.random()}`
  })
  ok(applied.skipped === 1 && applied.added === 2, 'skip conflicts')
  const copied = applyImportPolicy({
    model: preview,
    policy: 'copy',
    profiles: [{ id: 'p1', label: 'old', host: '192.0.2.10', port: 22, username: 'root' }],
    folders: [],
    newId: () => `id-${Math.random()}`
  })
  ok(copied.added === 3 && copied.profiles.some((p) => /\(2\)$/.test(p.label)), 'copy keeps a duplicate')
  ok(redactSecrets(`password=${SECRET}`).includes('[redacted]'), 'redact')
  void store
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const df = parseDf('Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 20G 18G 2G 90% /\n')
ok(df[0]?.percent === 90 && df[0]?.mount === '/', 'df parser')

const bag = new Map<string, string>()
const taskStore = {
  getItem: (k: string) => bag.get(k) ?? null,
  setItem: (k: string, v: string) => void bag.set(k, v)
}
ok(pendingTasks(loadTaskState(taskStore)).length === 4, 'four default tasks')
completeTask('connect', taskStore)
skipTask('ai', taskStore)
ok(!pendingTasks(loadTaskState(taskStore)).includes('connect'), 'connect completed')
ok(!pendingTasks(loadTaskState(taskStore)).includes('ai'), 'ai skipped')
dismissTasksForever(taskStore)
ok(loadTaskState(taskStore).dismissedForever, 'dismiss all')
reopenTasks(taskStore)
const again = loadTaskState(taskStore)
ok(!again.dismissedForever && again.done.connect === true && !again.skipped.ai, 'reopen keeps completion')

ok(SHARED_MENUS.some((m) => m.items.some((i) => i.type === 'item' && i.id === 'updateChannel')), 'updates menu')
ok(SHARED_MENUS.some((m) => m.items.some((i) => i.type === 'item' && i.id === 'taskCards')), 'tasks menu')
ok(SHARED_MENUS.some((m) => m.items.some((i) => i.type === 'item' && i.id === 'sftpComfort')), 'comfort menu')
ok(changelogFor('0.3.19').length >= 7, 'whats new 0.3.19')
const changelog = readFileSync('CHANGELOG.md', 'utf8')
ok(changelog.includes('## v0.3.19'), 'changelog md')
for (const phrase of ['localStorage prefs', 'no default service alert rules', 'diff skips >2MB', 'Auto update needs reachable Gitee/GitHub/mirror JSON']) {
  ok(changelog.includes(phrase), `changelog limit: ${phrase}`)
}
ok(readFileSync('src/renderer/src/components/AiAssistCard.tsx', 'utf8').includes('a4.privacy'), 'privacy on result')
ok(readFileSync('src/renderer/src/components/MultiHostDashboard.tsx', 'utf8').includes('a4-privacy-action'), 'privacy near action')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const key of ['n1.auto', 'o4.locate', 'a4.interpret', 'a4.privacy', 'd5.compareWithLocal', 'ux46.comfort', 'n2.skip', 'g3.dismissAll', 'st.tab.df']) {
  const hits = i18n.split(`'${key}'`).length - 1
  ok(hits >= 2, `${key} zh+en (${hits})`)
}

console.log(`round17 ok (${n})`)
