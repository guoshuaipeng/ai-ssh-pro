import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const repo = resolve(import.meta.dirname, '..')
const outDir = join(repo, 'docs', 'screenshots', 'iteration-2026-10-16')
const tempDir = join(process.env.TEMP || tmpdir(), 'aiss-screenshots')
const mainJs = join(repo, 'out', 'main', 'index.js')
if (!existsSync(mainJs)) throw new Error('run npm run build first')
mkdirSync(outDir, { recursive: true })
mkdirSync(tempDir, { recursive: true })

const root = mkdtempSync(join(tmpdir(), 'aissh-demo-'))
const home = join(root, 'home')
const appData = join(root, 'AppData', 'Roaming')
const userData = join(appData, 'ai-ssh-pro')
for (const d of [home, appData, userData]) mkdirSync(d, { recursive: true })
const now = Date.now()
writeFileSync(
  join(userData, 'ai-ssh-pro.json'),
  JSON.stringify({
    savedSessions: {
      folders: [
        { id: 'f-web', name: 'Demo · Web' },
        { id: 'f-db', name: 'Demo · Database' }
      ],
      profiles: [
        { id: 'p1', label: 'demo-web-01', host: '10.0.0.11', port: 22, username: 'ops', folderId: 'f-web' },
        { id: 'p2', label: 'demo-mysql', host: '10.0.1.21', port: 22, username: 'dba', folderId: 'f-db' }
      ]
    },
    recentConnections: [
      {
        id: 'ops@10.0.0.11:22',
        host: '10.0.0.11',
        port: 22,
        username: 'ops',
        label: 'demo-web-01',
        lastConnectedAt: now - 60_000,
        pinned: true
      }
    ],
    locale: 'zh-CN'
  })
)

const wrapperDir = join(root, 'wrapper')
mkdirSync(wrapperDir)
writeFileSync(join(wrapperDir, 'package.json'), JSON.stringify({ name: 'ai-ssh-pro', version: '0.0.0-demo', type: 'module', main: 'main.mjs' }))
writeFileSync(
  join(wrapperDir, 'main.mjs'),
  `
import { app, BrowserWindow } from 'electron'
import { writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
app.setPath('appData', ${JSON.stringify(appData)})
app.setPath('userData', ${JSON.stringify(userData)})
const outDir = ${JSON.stringify(outDir)}
const tempDir = ${JSON.stringify(tempDir)}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = [
  { file: 'cov-01-dark-main.png', prep: ['dismissProduct'], wait: 700 },
  { file: 'cov-02-known-hosts.png', prep: ['dismissProduct', 'knownHosts'], wait: 1000 },
  { file: 'cov-03-sftp.png', prep: ['dismissProduct', 'closeModals', 'sftp'], wait: 2000 },
  { file: 'cov-sftp-dual.png', prep: ['dismissProduct', 'closeModals', 'sftpDual'], wait: 2200 },
  { file: 'cov-04-ai-confirm.png', prep: ['dismissProduct', 'closeModals', 'aiConfirm'], wait: 1400 },
  { file: 'cov-05-light-theme.png', prep: ['dismissProduct', 'closeModals', 'themeLight'], wait: 1100 },
  { file: 'cov-06-light-known-hosts.png', prep: ['knownHosts'], wait: 1000 }
]

async function seed(win) {
  await win.webContents.executeJavaScript(\`
    localStorage.setItem('aiss.screenshot.hooks', '1');
    localStorage.setItem('aiss.prefs.onboarding.quickDone', '1');
    localStorage.setItem('aiss.tourDone', '1');
    localStorage.setItem('aiss.prefs.welcomeDismissed', '1');
    localStorage.setItem('aiss.prefs.welcomeCompleted', '1');
    localStorage.setItem('aiss.prefs.onboarding.fresh', '0');
    localStorage.setItem('aiss.prefs.firstWeekTipsDismissed', 'true');
    true
  \`, true)
  await win.webContents.executeJavaScript(\`
    (async () => {
      if (!window.aiss?.ai?.setSettings) return false
      await window.aiss.ai.setSettings({
        providers: [{
          id: 'dashscope',
          name: 'Screenshot Demo',
          baseURL: 'https://example.invalid/v1',
          apiKey: 'sk-screenshot-demo',
          modelList: ['demo-model']
        }],
        activeProviderId: 'dashscope',
        model: 'demo-model'
      })
      window.dispatchEvent(new Event('aiss-ai-settings-saved'))
      return true
    })()
  \`, true)
}

async function fire(win, detail) {
  await win.webContents.executeJavaScript(
    'window.dispatchEvent(new CustomEvent("aiss-screenshot", { detail: ' + JSON.stringify(detail) + ' }))',
    true
  )
}

async function runPrep(win, prep) {
  for (const step of prep || []) {
    if (step === 'closeModals') {
      await fire(win, { op: 'closeModals' })
      await sleep(300)
      continue
    }
    const detail =
      step === 'dismissProduct' ? { op: 'dismissProduct' } :
      step === 'knownHosts' ? { op: 'knownHosts' } :
      step === 'sftp' ? { op: 'sftp' } :
      step === 'sftpDual' ? { op: 'sftpDual' } :
      step === 'aiConfirm' ? { op: 'aiConfirm', preview: 'systemctl status nginx --no-pager' } :
      step === 'themeLight' ? { op: 'theme', id: 'light' } :
      null
    if (detail) {
      await fire(win, detail)
      await sleep(detail.op === 'aiConfirm' ? 800 : detail.op === 'sftpDual' ? 1400 : 300)
      if (detail.op === 'aiConfirm') {
        await fire(win, detail)
        await sleep(600)
      }
      if (detail.op === 'knownHosts') {
        await sleep(400)
      }
    }
  }
}

async function probe(win) {
  return await win.webContents.executeJavaScript(\`
    (() => {
      const theme = document.documentElement.getAttribute('data-ui-theme') || ''
      return JSON.stringify({
        theme,
        ux60: !!document.querySelector('[data-testid=ux60]'),
        tour: !!document.querySelector('.tour-root'),
        cmdp: !!document.querySelector('.cmdp-backdrop'),
        kh: !!document.querySelector('[data-testid=known-hosts-modal]') || !!document.querySelector('[data-testid=known-hosts-modal-backdrop]'),
        aiDock: !!document.querySelector('[data-testid=ai-pending-confirm]'),
        aiEmpty: !!document.querySelector('[data-testid=ai-empty-state]'),
        sftpTab: !!document.querySelector('.tab-kind-sftp') || !!document.querySelector('[data-testid=sftp-root]') || !!document.querySelector('.sftp-layout'),
        sftpDual: !!document.querySelector('[data-testid=sftp-dual]'),
        sftpMock: document.querySelector('[data-testid=sftp-dual]')?.getAttribute('data-screenshot-mock') === '1',
        sftpLocalRows: document.querySelectorAll('[data-testid=sftp-pane-local] tbody tr').length,
        sftpRemoteRows: document.querySelectorAll('[data-testid=sftp-pane-remote] tbody tr').length,

        light: theme === 'light' || theme === 'sand'
      })
    })()
  \`, true)
}

let done = false
app.on('browser-window-created', (_e, win) => {
  if (done) return
  done = true
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setContentSize(1400, 860)
      await sleep(4000)
      await seed(win)
      await fire(win, { op: 'dismissProduct' })
      await sleep(600)
      mkdirSync(tempDir, { recursive: true })
      for (const s of shots) {
        await runPrep(win, s.prep)
        await sleep(s.wait || 800)
        const p = await probe(win)
        console.log('[cov]', s.file, p)
        const png = (await win.webContents.capturePage()).toPNG()
        const dest = join(outDir, s.file)
        writeFileSync(dest, png)
        copyFileSync(dest, join(tempDir, s.file))
      }
      console.log('[cov] done ->', outDir, 'and', tempDir)
    } catch (e) {
      console.error('[cov] failed', e)
      app.exit(1)
      return
    }
    app.exit(0)
  })
})
setTimeout(() => { console.error('[cov] timeout'); app.exit(2) }, 120000)
await import(${JSON.stringify(pathToFileURL(mainJs).href)})
`
)

const electron = createRequire(import.meta.url)('electron')
const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: join(root, 'AppData', 'Local') }
for (const k of Object.keys(env)) if (k.startsWith('AISS_') || k === 'ELECTRON_RENDERER_URL') delete env[k]
const child = spawn(electron, [wrapperDir], { env, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', (d) => { const s = String(d); if (s.includes('[cov]')) process.stdout.write(s) })
child.stderr.on('data', (d) => { const s = String(d); if (s.includes('[cov]') || s.includes('Error')) process.stderr.write(s) })
const killTree = () => {
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'])
  else child.kill('SIGKILL')
}
const guard = setTimeout(killTree, 125000)
child.on('exit', (code) => {
  clearTimeout(guard)
  try { rmSync(root, { recursive: true, force: true }) } catch {}
  console.log('[cov] exit', code)
  process.exit(code ?? 1)
})
