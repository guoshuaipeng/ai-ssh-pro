import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const repo = resolve(import.meta.dirname, '..')
// Key-screen visual QA (dark + light):
//   node scripts/screenshot-key-screens.mjs [outDir] [--set chrome] [--only ai-chat,ai-empty] [--themes dark|light] [--no-build] [--empty]
//   --empty seeds no saved hosts (ops-home no-host state); files are prefixed `empty-`.
// Builds with electron-vite first unless --no-build (reuse out/). --only / --themes keep iteration runs short.
const argv = process.argv.slice(2)
const VALUE_FLAGS = ['--only', '--set', '--themes']
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(argv[i - 1]))
const csv = (v) => (v || '').split(',').map((x) => x.trim()).filter(Boolean)
const only = csv(opt('--only'))
const themes = csv(opt('--themes') || 'dark,light')
const shotSet = opt('--set') || process.env.AISS_SHOT_SET || ''
const emptySeed = argv.includes('--empty')
const outDir = resolve(positional[0] || join(process.env.TEMP || tmpdir(), 'aiss-key-screens'))
if (!argv.includes('--no-build')) {
  const b = spawnSync('npx electron-vite build', { cwd: repo, stdio: 'inherit', shell: true })
  if (b.status !== 0) throw new Error('electron-vite build failed')
}
const tempDir = join(process.env.TEMP || tmpdir(), 'aiss-key-screens-tmp')
const mainJs = join(repo, 'out', 'main', 'index.js')
if (!existsSync(mainJs)) throw new Error('out/main/index.js missing: drop --no-build or run npm run build')
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
      profiles: emptySeed ? [] : [
        { id: 'p1', label: 'demo-web-01', host: '10.0.0.11', port: 22, username: 'ops', folderId: 'f-web' },
        { id: 'p2', label: 'demo-mysql', host: '10.0.1.21', port: 22, username: 'dba', folderId: 'f-db' }
      ]
    },
    recentConnections: emptySeed ? [] : [
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
const W = [1400, 860], N = [960, 760]
const base = [
  { name: 'home-wide', size: W, steps: [{ op: 'menu', action: 'opsHome' }], wait: 1200 },
  { name: 'home-narrow', size: N, steps: [{ op: 'menu', action: 'opsHome' }], wait: 1200 },
  { name: 'terminal', size: W, steps: [{ op: 'menu', action: 'demoHost' }], wait: 3200 },
  { name: 'sftp', size: W, steps: [{ op: 'sftpDual' }], wait: 2600 },
  { name: 'settings', size: W, steps: [{ op: 'menu', action: 'settings' }], wait: 1200 },
  { name: 'modal', size: W, steps: [{ op: 'knownHosts' }], wait: 1200, close: true },
  { name: 'cmdk', size: W, steps: [{ op: 'menu', action: 'commandPalette' }], wait: 900, close: true },
  { name: 'ai-empty', size: W, steps: [{ op: 'menu', action: 'opsHome' }, { op: 'menu', action: 'ai' }], wait: 1400 },
  // M18: 4 tabs open (ops home, playbooks, terminal, audit) for the tab bar.
  { name: 'tabs', size: W, steps: [{ op: 'menu', action: 'opsHome' }, { op: 'menu', action: 'playbooks' }, { op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'auditLog' }], wait: 2400 }
]
// AISS_SHOT_SET=chrome: overlays + AI chat + protection-edge tabs (radius/shadow/chat QA).
const chrome = [
  { name: 'terminal', size: W, steps: [{ op: 'menu', action: 'demoHost' }], wait: 3200 },
  { name: 'sftp', size: W, steps: [{ op: 'sftpDual' }], wait: 2600 },
  { name: 'ai-chat', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }], wait: 1600 },
  { name: 'ai-empty', size: W, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }], wait: 1200 },
  { name: 'host-safety', size: W, steps: [{ op: 'hostSafety' }], wait: 1800 },
  { name: 'ai-history', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { click: '[data-testid="ai-new-chat"]' }, { op: 'aiChat' }, { op: 'aiChat' }, { click: '[data-testid="ai-history"]' }], wait: 1600 },
  { name: 'settings-ai', size: W, steps: [{ op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="ai"]' }, { click: '.policy-choice[data-policy="auto"] input' }], wait: 1400 },
  { name: 'ai-header', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }], wait: 1800 },
  { name: 'modal', size: W, steps: [{ op: 'knownHosts' }], wait: 1200, close: true },
  { name: 'cmdk', size: W, steps: [{ op: 'menu', action: 'commandPalette' }], wait: 900, close: true },
  { name: 'menu', size: W, steps: [{ click: '.titlebar-menu-trigger' }], wait: 700, close: true },
  { name: 'ai-safety-pop', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { op: 'aiComposerPop', which: 'safety' }], wait: 1400 },
  { name: 'ai-model-menu', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { op: 'aiComposerPop', which: 'model' }], wait: 1400 },
  // 2.3: execution replay rows (collapsed + both expanded), then the audit jump
  { name: 'ai-exec-replay', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "document.querySelectorAll('[data-testid=ai-exec-toggle]').forEach((b)=>b.click()); document.querySelector('[data-testid=ai-exec-replay]')?.scrollIntoView({block:'center'}); document.querySelectorAll('[data-testid=ai-exec-replay]').length" }], wait: 1200 },
  { name: 'ai-exec-collapsed', size: N, steps: [{ op: 'menu', action: 'opsHome' }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat', empty: true }, { op: 'aiChat' }, { eval: "document.querySelectorAll('[data-testid=ai-exec-replay].is-open [data-testid=ai-exec-toggle]').forEach((b)=>b.click()); document.querySelectorAll('[data-testid=ai-exec-replay]')[1]?.scrollIntoView({block:'end'}); true" }], wait: 1200 },
  { name: 'ai-exec-failed', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "const r=document.querySelectorAll('[data-testid=ai-exec-replay]')[1]; if(r&&!r.classList.contains('is-open')) r.querySelector('[data-testid=ai-exec-toggle]').click(); r?.scrollIntoView({block:'center'}); r?.getAttribute('data-status')" }], wait: 1200 },
  // B1: exit-code capture setting
  { name: 'settings-ai-exit', size: W, steps: [{ op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="ai"]' }, { eval: "document.querySelector('[data-testid=ai-exit-capture-row]')?.scrollIntoView({block:'center'}); !!document.querySelector('[data-testid=ai-exit-capture]')" }], wait: 1000 },
  // B2: provider presets (menu open, then Ollama applied)
  { name: 'settings-ai-presets', size: W, steps: [{ op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="ai"]' }, { eval: "document.querySelector('[data-testid=ai-preset-add]')?.scrollIntoView({block:'center'}); true" }, { click: '[data-testid=ai-preset-add]' }], wait: 900 },
  { name: 'settings-ai-ollama', size: W, steps: [{ op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="ai"]' }, { click: '[data-testid=ai-preset-add]' }, { eval: "(()=>{const b=[...document.querySelectorAll('[role=menuitem],.ctx-menu button,.context-menu button')].find(x=>/Ollama/.test(x.textContent||''));b?.click();setTimeout(()=>document.querySelector('[data-testid=ai-preset-note]')?.scrollIntoView({block:'center'}),100);return !!b})()" }], wait: 1000 },
  // C1: dynamic -D form, C2: themed session Select open
  { name: 'pf-dynamic', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'portForward' }, { click: '[data-testid=pf-dir-D]' }, { click: '[data-testid=pf-session]' }], wait: 900 },
  { name: 'settings-ai-model-select', size: W, steps: [{ op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="ai"]' }, { eval: "document.querySelector('[data-testid=ai-model-select]')?.scrollIntoView({block:'center'}); true" }, { click: '[data-testid=ai-provider-select]' }], wait: 900 },
  { name: 'conn-agent-forward', size: W, steps: [{ eval: "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/新建连接|New connection/.test((x.getAttribute('aria-label')||'')+(x.title||'')+x.textContent));b&&b.click();return !!b})()" }, { eval: "(()=>{const d=[...document.querySelectorAll('details')].find(x=>!x.open&&x.querySelector('summary'));d&&d.querySelector('summary').click();return !!d})()" }, { eval: "(()=>{const r=document.querySelector('[data-testid=conn-agent-forward-row]');r&&r.scrollIntoView({block:'center'});const c=document.querySelector('[data-testid=conn-agent-forward]');c&&c.click();return !!r})()" }], wait: 900 },
  { name: 'terminal-find', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));window.dispatchEvent(new Event('aiss-terminal-find'));await new Promise(r=>setTimeout(r,200));const i=document.querySelector('[data-testid=terminal-find] input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'e');i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));return document.querySelector('[data-testid=terminal-find-count]')?.textContent||'no-count'})()" }], wait: 900 },
  { name: 'qp-history', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));document.querySelector('.xterm textarea')?.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,400));return !!document.querySelector('[data-testid^=qp-]')})()" }], wait: 900 },
  { name: 'qp-switch', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'opsHome' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));document.querySelector('.xterm textarea')?.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'p',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,400));return !!document.querySelector('[data-testid^=qp-]')})()" }], wait: 900 },
  // B3: remote forward -R (expose warning) and the read-only block
  { name: 'pf-remote', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'portForward' }, { click: '[data-testid=pf-dir-R]' }, { eval: "(()=>{const i=[...document.querySelectorAll('.pf-form input')][0]; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'0.0.0.0'); i.dispatchEvent(new Event('input',{bubbles:true})); const p=[...document.querySelectorAll('.pf-form input')][1]; set.call(p,'9000'); p.dispatchEvent(new Event('input',{bubbles:true})); const l=[...document.querySelectorAll('.pf-form input')][3]; set.call(l,'3000'); l.dispatchEvent(new Event('input',{bubbles:true})); return true})()" }], wait: 900 },
  { name: 'pf-remote-ro', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'readonlyOn' }, { op: 'menu', action: 'portForward' }, { click: '[data-testid=pf-dir-R]' }, { eval: "!!document.querySelector('[data-testid=pf-r-blocked]')" }], wait: 900 },
  // 2.4: production banner + Auto run hint (live on policy change)
  { name: 'prod-auto', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { eval: "(async()=>{await window.aiss.ai.setSettings({aiPolicy:'auto'});window.dispatchEvent(new Event('aiss-ai-settings-saved'));await new Promise(r=>setTimeout(r,400));const b=document.querySelector('[data-testid=term-guard-banner]');return b?b.getAttribute('data-ai-policy')+' | '+b.textContent:'no-banner'})()" }], wait: 900 },
  { name: 'prod-auto-narrow', size: N, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await window.aiss.ai.setSettings({aiPolicy:'auto'});window.dispatchEvent(new Event('aiss-ai-settings-saved'));await new Promise(r=>setTimeout(r,400));const b=document.querySelector('[data-testid=term-guard-banner]');return b?b.getAttribute('data-ai-policy')+' | '+b.textContent:'no-banner'})()" }], wait: 900 },
  { name: 'prod-auto-pop', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await window.aiss.ai.setSettings({aiPolicy:'auto'});window.dispatchEvent(new Event('aiss-ai-settings-saved'));await new Promise(r=>setTimeout(r,400));const b=document.querySelector('[data-testid=term-guard-banner]');return b?b.getAttribute('data-ai-policy')+' | '+b.textContent:'no-banner'})()" }, { click: '[data-testid=banner-ai-auto]' }], wait: 1200 },
  { name: 'prod-ask', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await window.aiss.ai.setSettings({aiPolicy:'auto'});window.dispatchEvent(new Event('aiss-ai-settings-saved'));await new Promise(r=>setTimeout(r,400));const b=document.querySelector('[data-testid=term-guard-banner]');return b?b.getAttribute('data-ai-policy')+' | '+b.textContent:'no-banner'})()" }, { eval: "(async()=>{await window.aiss.ai.setSettings({aiPolicy:'ask'});window.dispatchEvent(new Event('aiss-ai-settings-saved'));await new Promise(r=>setTimeout(r,400));const b=document.querySelector('[data-testid=term-guard-banner]');return b?b.getAttribute('data-ai-policy')+' | '+b.textContent:'no-banner'})()" }], wait: 900 },
  { name: 'ai-exec-audit', size: W, steps: [{ eval: "localStorage.setItem('aiss.audit.enabled','1'); localStorage.setItem('aiss.audit.v1', JSON.stringify([{id:'aud-shot-x',at:Date.now()-30000,type:'command',host:'demo-web-01 #1',source:'AI',outcome:'allowed',detail:'systemctl status nginx --no-pager'},{id:'aud-shot-ps',at:Date.now()-60000,type:'command',host:'demo-web-01 #1',source:'AI',outcome:'allowed',detail:'ps aux --sort=-%mem | head -n 11',tabNo:1,policyChosen:'auto',policyEffective:'auto',policySource:'host'},{id:'aud-shot-y',at:Date.now()-90000,type:'command',host:'demo-web-01 #1',source:'AI',outcome:'allowed',detail:'df -h'}])); true" }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { click: '[data-testid=ai-exec-audit]' }], wait: 1400 }
]
const ONLY = ${JSON.stringify(only)}
const THEMES = ${JSON.stringify(themes)}
const PREFIX = ${JSON.stringify(emptySeed ? 'empty-' : '')}
const picked = (${JSON.stringify(shotSet)} === 'chrome' ? chrome : base).filter((s) => !ONLY.length || ONLY.includes(s.name))
if (!picked.length) { console.error('--only matched no shots: ' + ONLY.join(',')); process.exit(2) }
const shots = [
  ...(THEMES.includes('dark') ? picked.map((s) => ({ ...s, theme: 'github-dark', file: PREFIX + 'dark-' + s.name + '.png' })) : []),
  ...(THEMES.includes('light') ? picked.map((s) => ({ ...s, theme: 'light', file: PREFIX + 'light-' + s.name + '.png' })) : [])
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
    // Last-known metrics for the demo host (M17 cache): cards render them at once with the stale hint.
    localStorage.setItem('aiss.metricCache.v1', JSON.stringify({ p1: { cpu: 23, mem: 41, disk: 87, load: null, at: Date.now() - 180000 } }));
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
  win.webContents.on('render-process-gone', (_e, d) => console.log('[cov] gone', JSON.stringify(d)))
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[cov] console', String(msg).slice(0, 300)) })
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setContentSize(1400, 860)
      await sleep(4000)
      await seed(win)
      await fire(win, { op: 'dismissProduct' })
      await sleep(600)
      mkdirSync(tempDir, { recursive: true })
      win.webContents.setBackgroundThrottling(false)
      win.show(); win.focus()
      // Hide transient toasts without touching React-owned nodes.
      await win.webContents.insertCSS('.toast-stack { visibility: hidden !important; }')
      let theme = ''
      for (const s of shots) {
        if (s.theme !== theme) { await fire(win, { op: 'theme', id: s.theme }); theme = s.theme; await sleep(500) }
        if (win.isMaximized()) win.unmaximize()
        win.setMinimumSize(640, 480)
        for (let k = 0; k < 8; k++) {
          win.setContentSize(s.size[0], s.size[1])
          await sleep(200)
          const [cw, ch] = win.getContentSize()
          if (cw === s.size[0] && ch === s.size[1]) break
        }
        await sleep(400)
        for (const st of s.steps) {
          if (st.eval) console.log('[cov] eval', await win.webContents.executeJavaScript(st.eval, true).catch((e) => 'ERR ' + e))
          else if (st.click) await win.webContents.executeJavaScript('document.querySelector(' + JSON.stringify(st.click) + ')?.click(); true', true)
          else await fire(win, st)
          await sleep(500)
        }
        await sleep(s.wait || 800)
        const p = await probe(win)
        const dom = await win.webContents.executeJavaScript('(document.getElementById(\"root\")?.innerHTML.length || 0) + \" \" + location.href.slice(0, 80)', true).catch((e) => 'ERR ' + e)
        console.log('[cov] dom', dom)
        console.log('[cov]', s.file, p)
        // Make sure the frame we grab is the one after the steps (capturePage can return a stale frame).
        await Promise.race([win.webContents.executeJavaScript('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))', true), sleep(600)])
        win.webContents.invalidate()
        await sleep(350)
        await Promise.race([win.webContents.capturePage(), sleep(1500)])
        await sleep(150)
        const png = (await win.webContents.capturePage()).toPNG()
        console.log('[cov] size', JSON.stringify(win.getContentSize()))
        const dest = join(outDir, s.file)
        writeFileSync(dest, png)
        if (s.close) {
          await fire(win, { op: 'closeModals' })
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
          await sleep(400)
        }
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
setTimeout(() => { console.error('[cov] timeout'); app.exit(2) }, 240000)
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
const guard = setTimeout(killTree, 250000)
child.on('exit', (code) => {
  clearTimeout(guard)
  try { rmSync(root, { recursive: true, force: true }) } catch {}
  console.log('[cov] exit', code)
  process.exit(code ?? 1)
})
