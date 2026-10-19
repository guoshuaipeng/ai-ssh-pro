import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const repo = resolve(import.meta.dirname, '..')
const outDir = join(repo, 'docs', 'screenshots', 'iteration-2026-10-16')
const mainJs = join(repo, 'out', 'main', 'index.js')
mkdirSync(outDir, { recursive: true })
const root = mkdtempSync(join(tmpdir(), 'aissh-demo-'))
const home = join(root, 'home')
const appData = join(root, 'AppData', 'Roaming')
const userData = join(appData, 'ai-ssh-pro')
for (const d of [home, appData, userData]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'ai-ssh-pro.json'), JSON.stringify({
  savedSessions: { folders: [{ id: 'f-web', name: 'Demo · Web' }], profiles: [
    { id: 'p1', label: 'demo-web-01', host: '10.0.0.11', port: 22, username: 'ops', folderId: 'f-web' }
  ]},
  recentConnections: [],
  locale: 'zh-CN'
}, null, 2))

const wrapperDir = join(root, 'wrapper')
mkdirSync(wrapperDir)
writeFileSync(join(wrapperDir, 'package.json'), JSON.stringify({ name: 'ai-ssh-pro', version: '0.0.0-demo', type: 'module', main: 'main.mjs' }))
writeFileSync(join(wrapperDir, 'main.mjs'), `
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
app.setPath('appData', ${JSON.stringify(appData)})
app.setPath('userData', ${JSON.stringify(userData)})
const outDir = ${JSON.stringify(outDir)}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = (win) => win.webContents.executeJavaScript(
  "JSON.stringify({ ux60: !!document.querySelector('[data-testid=ux60]'), cmdp: !!document.querySelector('.cmdp-backdrop'), tour: !!document.querySelector('.tour-root') })",
  true
)
let done = false
app.on('browser-window-created', (_e, win) => {
  if (done) return
  done = true
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setContentSize(1400, 860)
      await sleep(4500)
      let p0 = await probe(win)
      console.log('[demo] before', p0)
      writeFileSync(outDir + '/verify-01-main-or-quick.png', (await win.webContents.capturePage()).toPNG())
      await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))", true)
      await sleep(800)
      let p1 = await probe(win)
      console.log('[demo] cmdk', p1)
      writeFileSync(outDir + '/verify-02-cmdk-no-ux60.png', (await win.webContents.capturePage()).toPNG())
      const parsed = JSON.parse(p1)
      if (parsed.cmdp && parsed.ux60) {
        console.error('[demo] FAIL stack: cmdp and ux60 both visible')
        app.exit(3)
        return
      }
      if (parsed.cmdp && parsed.tour) {
        console.error('[demo] FAIL stack: cmdp and tour both visible')
        app.exit(4)
        return
      }
      console.log('[demo] stackOk', !parsed.ux60 && !parsed.tour && parsed.cmdp)
      await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))", true)
      await sleep(600)
      let p2 = await probe(win)
      console.log('[demo] afterEsc', p2)
      writeFileSync(outDir + '/verify-03-after-esc.png', (await win.webContents.capturePage()).toPNG())
      console.log('[demo] saved verify shots')
    } catch (e) { console.error('[demo] failed', e); app.exit(1); return }
    app.exit(0)
  })
})
setTimeout(() => { console.error('[demo] timeout'); app.exit(2) }, 90000)
await import(${JSON.stringify(pathToFileURL(mainJs).href)})
`)

const electron = createRequire(import.meta.url)('electron')
const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: join(root, 'AppData', 'Local') }
for (const k of Object.keys(env)) if (k.startsWith('AISS_') || k === 'ELECTRON_RENDERER_URL') delete env[k]
const child = spawn(electron, [wrapperDir], { env, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', (d) => { const s = String(d); if (s.includes('[demo]')) process.stdout.write(s) })
child.stderr.on('data', (d) => { const s = String(d); if (s.includes('[demo]')) process.stderr.write(s) })
const killTree = () => { if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']); else child.kill('SIGKILL') }
const guard = setTimeout(killTree, 95000)
child.on('exit', (code) => {
  clearTimeout(guard)
  try { rmSync(root, { recursive: true, force: true }) } catch {}
  console.log('[demo] exit', code)
  process.exit(code ?? 1)
})
