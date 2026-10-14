// Generates README screenshots from FAKE demo data only.
// Runs the built app (out/) with HOME/USERPROFILE/APPDATA and userData pointed at a throwaway dir,
// so no real saved sessions, inventory or keys can appear. Usage: npm run build && node scripts/screenshot-demo.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const repo = resolve(import.meta.dirname, '..')
const outDir = join(repo, 'docs', 'screenshots')
const mainJs = join(repo, 'out', 'main', 'index.js')
if (!existsSync(mainJs)) throw new Error('run npm run build first')
mkdirSync(outDir, { recursive: true })

const root = mkdtempSync(join(tmpdir(), 'aissh-demo-'))
const home = join(root, 'home')
const appData = join(root, 'AppData', 'Roaming')
const userData = join(appData, 'ai-ssh-pro')
for (const d of [home, appData, userData]) mkdirSync(d, { recursive: true })

const now = Date.now()
const folders = [
  { id: 'f-web', name: 'Demo · Web' },
  { id: 'f-db', name: 'Demo · Database' },
  { id: 'f-k8s', name: 'Demo · K8s' }
]
const p = (id, label, host, folderId, username = 'ops') => ({ id, label, host, port: 22, username, folderId })
const profiles = [
  p('p1', 'demo-web-01', '10.0.0.11', 'f-web'),
  p('p2', 'demo-web-02', '10.0.0.12', 'f-web'),
  p('p3', 'demo-nginx', '192.0.2.10', 'f-web'),
  p('p4', 'demo-mysql-primary', '10.0.1.21', 'f-db', 'dba'),
  p('p5', 'demo-redis', '10.0.1.31', 'f-db'),
  p('p6', 'demo-k8s-master', '192.0.2.50', 'f-k8s', 'root'),
  p('p7', 'demo-k8s-node-1', '192.0.2.51', 'f-k8s', 'root')
]
const recentConnections = [
  { id: 'ops@10.0.0.11:22', host: '10.0.0.11', port: 22, username: 'ops', label: 'demo-web-01', lastConnectedAt: now - 60_000, pinned: true },
  { id: 'dba@10.0.1.21:22', host: '10.0.1.21', port: 22, username: 'dba', label: 'demo-mysql-primary', lastConnectedAt: now - 3_600_000 }
]
writeFileSync(join(userData, 'ai-ssh-pro.json'), JSON.stringify({ savedSessions: { folders, profiles }, recentConnections, locale: process.env.DEMO_LOCALE || 'zh-CN' }, null, 2))

const shots = [
  {
    "file": "main-dark.png",
    "js": "(()=>{const i=document.querySelector('input[placeholder*=\"搜索会话\"],input[placeholder*=\"Search\"]');if(!i)return;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'demo');i.dispatchEvent(new Event('input',{bubbles:true}))})()"
  },
  {
    "file": "shortcuts.png",
    "js": "window.dispatchEvent(new KeyboardEvent('keydown',{key:'F1',bubbles:true}))"
  },
  {
    "file": "main-light.png",
    "js": "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));[...document.querySelectorAll('button')].find(b => /浅色|Light/.test(b.textContent||''))?.click()"
  }
]
const wrapperDir = join(root, 'wrapper')
mkdirSync(wrapperDir)
writeFileSync(join(wrapperDir, 'package.json'), JSON.stringify({ name: 'ai-ssh-pro', version: '0.0.0-demo', type: 'module', main: 'main.mjs' }))
writeFileSync(join(wrapperDir, 'main.mjs'), `
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
app.setPath('appData', ${JSON.stringify(appData)})
app.setPath('userData', ${JSON.stringify(userData)})
const shots = ${JSON.stringify(shots.map((s) => ({ ...s, path: join(outDir, s.file) })))}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let done = false
app.on('browser-window-created', (_e, win) => {
  if (done) return
  done = true
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setContentSize(1400, 860)
      await sleep(3500)
      await win.webContents.executeJavaScript("document.querySelectorAll('details').forEach(d=>d.open=true)", true).catch(()=>{})
      for (const s of shots) {
        if (s.js) await win.webContents.executeJavaScript(s.js, true).catch(()=>{})
        await sleep(1200)
        const img = await win.webContents.capturePage()
        writeFileSync(s.path, img.toPNG())
        console.log('[demo] saved', s.path)
      }
    } catch (e) { console.error('[demo] failed', e) }
    app.exit(0)
  })
})
setTimeout(() => { console.error('[demo] timeout'); app.exit(2) }, 60000)
await import(${JSON.stringify(pathToFileURL(mainJs).href)})
`)

const electron = createRequire(import.meta.url)('electron')
const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: join(root, 'AppData', 'Local') }
for (const k of Object.keys(env)) if (k.startsWith('AISS_') || k === 'ELECTRON_RENDERER_URL') delete env[k]
const child = spawn(electron, [wrapperDir], { env, stdio: ['ignore', 'pipe', 'pipe'] })
console.log('[demo] electron pid', child.pid)
child.stdout.on('data', (d) => { const s = String(d); if (s.includes('[demo]')) process.stdout.write(s) })
child.stderr.on('data', (d) => { const s = String(d); if (s.includes('[demo]')) process.stderr.write(s) })
const killTree = () => { if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']); else child.kill('SIGKILL') }
const guard = setTimeout(killTree, 75000)
child.on('exit', (code) => {
  clearTimeout(guard)
  try { rmSync(root, { recursive: true, force: true }) } catch {}
  console.log('[demo] exit', code)
  process.exit(code ?? 1)
})
