import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const repo = resolve(import.meta.dirname, '..')
// 可选配置文件：node scripts/screenshot-iteration.mjs <config.json>，字段 outDir / store / shots / size
const cfg = process.argv[2] ? JSON.parse((await import('node:fs')).readFileSync(process.argv[2], 'utf8')) : null
const outDir = cfg?.outDir ? resolve(repo, cfg.outDir) : join(repo, 'docs', 'screenshots', 'iteration-2026-10-16')
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
  { id: 'f-db', name: 'Demo · Database' }
]
const p = (id, label, host, folderId, username = 'ops') => ({ id, label, host, port: 22, username, folderId })
const profiles = [
  p('p1', 'demo-web-01', '10.0.0.11', 'f-web'),
  p('p2', 'demo-web-02', '10.0.0.12', 'f-web'),
  p('p3', 'demo-mysql', '10.0.1.21', 'f-db', 'dba')
]
const recentConnections = [
  { id: 'ops@10.0.0.11:22', host: '10.0.0.11', port: 22, username: 'ops', label: 'demo-web-01', lastConnectedAt: now - 60_000, pinned: true }
]
writeFileSync(join(userData, 'ai-ssh-pro.json'), JSON.stringify(cfg?.store ?? { savedSessions: { folders, profiles }, recentConnections, locale: 'zh-CN' }, null, 2))
for (const [name, body] of Object.entries(cfg?.files ?? {})) writeFileSync(join(userData, name), typeof body === 'string' ? body : JSON.stringify(body, null, 2))

const clickText = (re) => `([...document.querySelectorAll('button,a,[role=menuitem],.titlebar-menu-item,.menu-item')].find(b=>${re}.test((b.textContent||'').trim()))||{click:()=>{}}).click()`

const defaultShots = [
  { file: '01-main.png', js: "(()=>{const i=document.querySelector('input[placeholder*=\"搜索会话\"],input[placeholder*=\"Search\"]');if(!i)return;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'demo');i.dispatchEvent(new Event('input',{bubbles:true}))})()" },
  { file: '02-shortcuts-f1.png', js: "window.dispatchEvent(new KeyboardEvent('keydown',{key:'F1',bubbles:true}))" },
  { file: '03-cmdk.png', js: "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))" },
  { file: '04-new-connection.png', js: "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));" + clickText('/新建连接|New connection/') },
  { file: '05-known-hosts.png', js: "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));" + clickText('/主机密钥|Known hosts/') },
  { file: '06-settings-theme.png', js: "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));" + clickText('/设置|Settings/') },
  { file: '07-ui-theme-toggle.png', js: "window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',ctrlKey:true,altKey:true,bubbles:true}))" }
]
const shots = cfg?.shots ?? defaultShots

const wrapperDir = join(root, 'wrapper')
mkdirSync(wrapperDir)
writeFileSync(join(wrapperDir, 'package.json'), JSON.stringify({ name: 'ai-ssh-pro', version: '0.0.0-demo', type: 'module', main: 'main.mjs' }))
writeFileSync(join(wrapperDir, 'main.mjs'), `
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
app.setPath('appData', ${JSON.stringify(appData)})
app.setPath('userData', ${JSON.stringify(userData)})
const shots = ${JSON.stringify(shots.map((s) => ({ ...s, path: join(outDir, s.file) })))}
const size = ${JSON.stringify(cfg?.size ?? [1400, 860])}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let done = false
app.on('browser-window-created', (_e, win) => {
  if (done) return
  done = true
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setContentSize(size[0], size[1])
      await sleep(4000)
      await win.webContents.executeJavaScript("document.querySelectorAll('details').forEach(d=>d.open=true)", true).catch(()=>{})
      for (const s of shots) {
        if (s.js) { const r = await win.webContents.executeJavaScript(s.js, true).catch((e)=>console.error('[demo] js', s.file, e)); if (r !== undefined) console.log('[demo] js-result', s.file, JSON.stringify(r)) }
        await sleep(s.wait ?? 0)
        await sleep(1400)
        const img = await win.webContents.capturePage()
        writeFileSync(s.path, img.toPNG())
        console.log('[demo] saved', s.path)
      }
    } catch (e) { console.error('[demo] failed', e) }
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
console.log('[demo] electron pid', child.pid)
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
