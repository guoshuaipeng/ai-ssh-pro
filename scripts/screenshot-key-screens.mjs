import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startE2eSshd, freePort, E2E_USER, E2E_PASS } from './e2e-sshd.mjs'
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
if (argv.includes('--isolate-themes') && themes.length > 1) {
  // c56: each theme gets its own process + fresh seeded data dir, so the 2nd theme never sees the 1st theme's rows
  let worst = 0
  for (const t of themes) {
    const args = argv.filter((a, i) => a !== '--isolate-themes' && a !== '--themes' && argv[i - 1] !== '--themes')
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, '--themes', t, '--no-build'], { stdio: 'inherit' })
    worst = Math.max(worst, r.status ?? 1)
  }
  console.log('[cov] isolated exit ' + worst)
  process.exit(worst)
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
// c57: --sshd starts a loopback test sshd + HTTP echo; its host key is pre-trusted so no prompt appears
const SSHD = argv.includes('--sshd') ? await startE2eSshd() : null
if (SSHD) {
  SSHD.fwdPort = await freePort()
  SSHD.deadPort = await freePort() // c57 --probe-fail: forward to a closed port so the tunnel check must fail
  const hp = '127.0.0.1:' + SSHD.port
  writeFileSync(join(userData, 'ai-ssh-pro-known-hosts.json'), JSON.stringify({ entries: { [hp]: { hostPort: hp, fingerprint: SSHD.fingerprint, hostKeyBase64: SSHD.hostKeyBase64, trustedAt: Date.now() } } }))
  console.log('[cov] sshd 127.0.0.1:' + SSHD.port + ' echo ' + SSHD.echoPort + ' fwd ' + SSHD.fwdPort)
}
const E2E_DL = join(root, 'e2e-dl-config.yaml')
const E2E_DL2 = join(root, 'e2e-dl-hello.txt')
const E2E_UPSRC = join(root, 'e2e-up-src.txt')
writeFileSync(E2E_UPSRC, 'aiss-upload-ok\n')
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
        { id: 'p2', label: 'demo-mysql', host: '10.0.1.21', port: 22, username: 'dba', folderId: 'f-db' },
        ...(SSHD ? [{ id: 'p-sshd', label: 'e2e-sshd', host: '127.0.0.1', port: SSHD.port, username: E2E_USER, authMode: 'password', password: E2E_PASS, folderId: 'f-web' }] : [])
      ]
    },
    recentConnections: emptySeed ? [] : [
      { id: 'ops@10.0.2.21:22', host: '10.0.2.21', port: 22, username: 'ops', label: 'api-gw-01', lastConnectedAt: now - 2 * 3_600_000 },
      { id: 'ops@10.0.2.22:22', host: '10.0.2.22', port: 22, username: 'ops', label: 'api-gw-02', lastConnectedAt: now - 3 * 3_600_000 },
      { id: 'root@db-replica.internal:22', host: 'db-replica.internal', port: 22, username: 'root', lastConnectedAt: now - 26 * 3_600_000 },
      { id: 'ci@build-runner-3:2200', host: 'build-runner-3', port: 2200, username: 'ci', lastConnectedAt: now - 50 * 3_600_000 },
      {
        id: 'deploy@203.0.113.7:2222',
        host: '203.0.113.7',
        port: 2222,
        username: 'deploy',
        lastConnectedAt: now - 300_000,
        quick: true,
        identity: '~/.ssh/deploy_ed25519',
        jump: [{ host: 'bastion.example.com', port: 22, username: 'jump' }]
      },
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
import { writeFileSync, copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
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
  { name: 'tab-menu-ssh', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(()=>{const t=[...document.querySelectorAll('[role=tab],.tab,.session-tab')].find(x=>/演示主机|Demo host/.test(x.textContent||'')&&!/SFTP/.test(x.textContent||''));if(!t)return false;const r=t.getBoundingClientRect();t.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+20,clientY:r.bottom-4}));return true})()" }], wait: 900 },
  { name: 'modal', size: W, steps: [{ op: 'knownHosts' }], wait: 1200, close: true },
  { name: 'cmdk', size: W, steps: [{ op: 'menu', action: 'commandPalette' }], wait: 900, close: true },
  { name: 'ai-empty', size: W, steps: [{ op: 'menu', action: 'opsHome' }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }], wait: 1400 },
  // M18: 4 tabs open (ops home, playbooks, terminal, audit) for the tab bar.
  // PB2: built-in playbook opened in the editor
  { name: 'playbook-edit', size: W, steps: [{ op: 'menu', action: 'playbooks' }, { click: '[data-testid="w9-pb-preview"]' }], wait: 1400 },
  // SN2: snippets rail, compact rows (built-ins)
  { name: 'snippets-compact', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'snippets' }, { click: '[data-testid="w9-snip-seg"] button:nth-child(2)' }], wait: 1400 },
  { name: 'tabs', size: W, steps: [{ op: 'menu', action: 'opsHome' }, { op: 'menu', action: 'playbooks' }, { op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'auditLog' }], wait: 2400 },
  { name: 'audit', size: W, steps: [{ op: 'menu', action: 'auditLog' }], wait: 1400 },
  { name: 'settings-conn', size: W, steps: [{ op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="connections"]' }], wait: 1200 },
  { name: 'settings-term', size: W, steps: [{ op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="terminal"]' }], wait: 1200 },
  { name: 'audit-custom', size: W, steps: [{ op: 'menu', action: 'auditLog' }, { eval: "new Promise(r=>setTimeout(()=>{if(!document.querySelector('[data-testid=audit-dates]')){document.querySelector('[data-testid=audit-range]')?.click();setTimeout(()=>{const o=[...document.querySelectorAll('[role=option]')].pop();o?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));o?.click();r(true)},300)}else r(true)},800))" }], wait: 900 },
  { name: 'audit-date-pop', size: W, steps: [{ op: 'menu', action: 'auditLog' }, { eval: "new Promise(r=>setTimeout(()=>{if(!document.querySelector('[data-testid=audit-dates]')){document.querySelector('[data-testid=audit-range]')?.click();setTimeout(()=>{const o=[...document.querySelectorAll('[role=option]')].pop();o?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));o?.click();r(true)},300)}else r(true)},800))" }, { eval: "new Promise(r=>setTimeout(()=>{const b=document.querySelector('[data-testid=audit-since] .df-btn');if(b&&b.getAttribute('aria-expanded')!=='true')b.click();r(true)},900))" }], wait: 700 }
]
// AISS_SHOT_SET=chrome: overlays + AI chat + protection-edge tabs (radius/shadow/chat QA).
const chrome = [
  { name: 'terminal', size: W, steps: [{ op: 'menu', action: 'demoHost' }], wait: 3200 },
  { name: 'sftp', size: W, steps: [{ op: 'sftpDual' }], wait: 2600 },
  { name: 'ai-chat', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }], wait: 1600 },
  { name: 'ai-empty', size: W, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }], wait: 1200 },
  { name: 'host-safety', size: W, steps: [{ op: 'hostSafety' }], wait: 1800 },
  { name: 'n1024-settings', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="terminal"]' }], wait: 1400 },
  { name: 'n1024-ops', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'menu', action: 'demoHost' }], wait: 2400 },
  { name: 'n1024-inventory', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'menu', action: 'inventory' }], wait: 1400 },
  { name: 'n1024-gate', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'menu', action: 'gateTimeline' }], wait: 1400 },
  // c51: repro — popovers must close when the tab switches (probe dfPop/selPop must be false)
  { name: 'leak-date', size: W, steps: [{ op: 'menu', action: 'auditLog' }, { eval: "new Promise(r=>setTimeout(()=>{if(!document.querySelector('[data-testid=audit-dates]')){document.querySelector('[data-testid=audit-range]')?.click();setTimeout(()=>{const o=[...document.querySelectorAll('[role=option]')].pop();o?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));o?.click();r(true)},300)}else r(true)},800))" }, { eval: "new Promise(r=>setTimeout(()=>{const b=document.querySelector('[data-testid=audit-since] .df-btn');if(b&&b.getAttribute('aria-expanded')!=='true')b.click();r(!!document.querySelector('.df-pop'))},900))" }, { op: 'menu', action: 'opsHome' }], wait: 900 },
  { name: 'leak-select', size: W, steps: [{ op: 'menu', action: 'auditLog' }, { eval: "new Promise(r=>setTimeout(()=>{document.querySelector('[data-testid=audit-type]')?.click();r(!!document.querySelector('.ui-select-list'))},900))" }, { op: 'menu', action: 'opsHome' }], wait: 900 },
  { name: 'n1024-inventory-empty', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'menu', action: 'inventory' }], wait: 1400 }, // run with --empty for the no-profile state
  // c53 AA1: AI app action cards (prefilled / missing-ask / monitor)
  { name: 'ai-action-conn', size: W, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.add', params: { label: 'web-02', host: '10.0.0.12', username: 'deploy' }, ask: '帮我添加一台 10.0.0.12 的连接，用户 deploy', say: '已为你准备好连接表单，请确认。密码或私钥需你自己填写。' }], wait: 900 },
  { name: 'ai-action-ask', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.add', params: { host: '10.0.0.13' }, ask: '加一台 10.0.0.13', say: '还缺用户名，请在表单里补全。' }, { click: '[data-testid=ai-action-confirm]' }], wait: 900 },
  { name: 'ai-action-monitor', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'monitor.configure', params: { metric: 'cpu', threshold: '85', sustainMin: '3' }, ask: 'CPU 超过 85% 持续 3 分钟就告警', say: '将 CPU 告警阈值设为 85%，持续 3 分钟。' }], wait: 900 },
  // c55 E2E: every action, real confirm click, result read back (expect must be === true or the run fails)
  { name: 'e2e-err-nosession-fwd', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'forward.create', params: {"localPort":"18081","remotePort":"80"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 1200, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const r=ph()==='error'&&aud('forward.create','blocked')===1;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
  { name: 'e2e-err-nosession-hist', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'history.fill', params: {"query":"uptime"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 1200, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const r=ph()==='error'&&aud('history.fill','blocked')===1;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
  { name: 'e2e-err-missing', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.add', params: {"label":"e2e-missing"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 1200, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const s=await window.aiss.sessions.list();const r=ph()==='editing'&&!![...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.querySelector('[data-testid=ai-action-ask]')&&!(s.profiles||[]).some(p=>p.label==='e2e-missing')&&!aud('connection.add label=e2e-missing');return r||JSON.stringify({ph:ph()})})()" },
  { name: 'e2e-err-notfound', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.open', params: {"target":"ghost-zz"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 1200, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const r=ph()==='error'&&msg().includes('ghost-zz')&&aud('sftp.open target=ghost-zz','blocked')===1;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
  { name: 'e2e-err-cancel-click', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'snippet.create', params: {"title":"e2e-cancel","command":"ls"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-cancel]')].pop()?.click(); 'x'" }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 1200, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const l=await window.aiss.snippets.list();const r=ph()==='cancelled'&&![...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.querySelector('[data-testid=ai-action-confirm]')&&!l.some(x=>x.title==='e2e-cancel');return r||JSON.stringify({ph:ph(),n:l.length})})()" },
  { name: 'e2e-err-armed-cancel', size: W, e2e: true, steps: [{ eval: "window.__t0=document.querySelectorAll('[data-tab-id]').length; window.__a0=(localStorage.getItem('aiss.audit.v1')||'').length; 'x'" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.open', params: {"targets":"demo-web-01, e2e-web-77, demo-mysql"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-cancel]')].pop()?.click(); 'x'" }], wait: 1200, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const r=ph()==='cancelled'&&document.querySelectorAll('[data-tab-id]').length===window.__t0&&aud('connection.open')===0;return r||JSON.stringify({ph:ph(),t:tabs()})})()" },
  { name: 'e2e-ai-conn', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.add', params: {"label":"e2e-web-77","host":"10.9.8.77","username":"deploy"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 1500, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const s=await window.aiss.sessions.list();const n=(s.profiles||[]).filter(p=>p.host==='10.9.8.77'&&p.username==='deploy').length;const r=n===1&&ph()==='done'&&aud('connection.add','allowed')===1;return r||JSON.stringify({n,ph:ph(),labels:(s.profiles||[]).map(p=>p.label)})})()" },
  { name: 'e2e-monitor', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'monitor.configure', params: {"metric":"cpu","threshold":"77","sustainMin":"6","enabled":"on"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 1200, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const st=JSON.parse(localStorage.getItem('aiss.alert.rules.v1')||'null');const c=(st?.rules||[]).find(x=>x.id==='cpu');const r=ph()==='done'&&c&&c.threshold===77&&c.enabled!==false&&aud('monitor.configure','allowed')===1;return r||JSON.stringify({ph:ph(),c})})()" },
  { name: 'e2e-snippet-dbl', size: W, e2e: true, steps: [{ eval: "window.aiss.snippets.list().then((l) => { window.__s0 = l.filter((x) => x.title === 'e2e-snip-1').length; return 'x' })" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'snippet.create', params: {"title":"e2e-snip-1","command":"uptime"}, ask: 'e2e', say: 'e2e' }, { eval: "new Promise((r) => setTimeout(() => r(1), 400))" }, { eval: "const b=[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop();b.click();b.click();b.click(); 'x'" }], wait: 1200, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const l=await window.aiss.snippets.list();const n=l.filter(x=>x.title==='e2e-snip-1'&&x.body==='uptime').length;const r=n===(window.__s0||0)+1&&ph()==='done'&&aud('snippet.create','allowed')===1;return r||JSON.stringify({n,s0:window.__s0,ph:ph(),cards:document.querySelectorAll('[data-testid=ai-action-card]').length,dbg:window.__dbg,html:([...document.querySelectorAll('[data-testid=ai-action-card]')].pop()||{}).outerHTML?.slice(0,300)})})()" },
  { name: 'e2e-open-batch', size: W, e2e: true, steps: [{ eval: "window.__t0=document.querySelectorAll('[data-tab-id]').length; 'x'" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.open', params: {"targets":"demo-web-01, e2e-web-77, demo-mysql"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }, { eval: "window.__armed=!![...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.querySelector('[data-testid=ai-action-armed]')&&document.querySelectorAll('[data-tab-id]').length===window.__t0; 'x'" }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 3000, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const r=window.__armed&&ph()==='done'&&document.querySelectorAll('[data-tab-id]').length>=window.__t0+3&&aud('connection.open','allowed')===1;return r||JSON.stringify({armed:window.__armed,ph:ph(),msg:msg(),t:tabs()})})()" },
  { name: 'e2e-sftp', size: W, e2e: true, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise((r) => setTimeout(() => r('waited'), 3500))" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.open', params: {"target":"demo.ai-ssh-pro.local","path":"/var/log"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 6000, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const c=document.querySelector('[data-testid=sftp-remote-crumbs]')?.textContent||'';const r=ph()==='done'&&/var/.test(c)&&/log/.test(c)&&aud('sftp.open','allowed')===1;return r||JSON.stringify({ph:ph(),msg:msg(),c,n:document.querySelectorAll('[data-testid=sftp-remote-crumbs]').length,t:tabs()})})()" },
  { name: 'e2e-hist', size: W, e2e: true, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise((r) => setTimeout(() => r('waited'), 3500))" }, { eval: "localStorage.setItem('aiss.smartHistory', JSON.stringify([{command:'echo e2e-marker-old',hostKey:'x',count:1,lastUsed:1},{command:'echo e2e-marker',hostKey:'x',count:1,lastUsed:Date.now()}])); 'x'" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'history.fill', params: {"query":"e2e-marker"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 3500, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const tabs=()=>[...document.querySelectorAll('[data-tab-id]')].map(t=>t.textContent||'');const i=document.querySelector('[data-testid=session-command-bar] input, [data-testid=session-command-bar] textarea');const r=ph()==='done'&&i&&i.value==='echo e2e-marker'&&aud('history.fill','allowed')===1;return r||JSON.stringify({ph:ph(),msg:msg(),v:i&&i.value})})()" },
  // c56: command explanation tip must not read through the guard banner (opaque surface)
  { name: 'term-cmd-explain', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise((r) => setTimeout(() => r('waited'), 3500))" }, { eval: "localStorage.setItem('aiss.smartHistory', JSON.stringify([{command:'echo e2e-marker-old',hostKey:'x',count:1,lastUsed:1},{command:'echo e2e-marker',hostKey:'x',count:1,lastUsed:Date.now()}])); 'x'" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'history.fill', params: {"query":"e2e-marker"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 3500, expect: "(async()=>{const e=document.querySelector('[data-testid=cmd-explain]');if(!e)return 'no explain';const bg=getComputedStyle(e).backgroundColor;return bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent'||bg})()" },
  { name: 'term-cmd-explain-n', size: [1024, 760], steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise((r) => setTimeout(() => r('waited'), 3500))" }, { eval: "localStorage.setItem('aiss.smartHistory', JSON.stringify([{command:'echo e2e-marker-old',hostKey:'x',count:1,lastUsed:1},{command:'echo e2e-marker',hostKey:'x',count:1,lastUsed:Date.now()}])); 'x'" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'history.fill', params: {"query":"e2e-marker"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 3500, expect: "(async()=>{const e=document.querySelector('[data-testid=cmd-explain]');if(!e)return 'no explain';const bg=getComputedStyle(e).backgroundColor;return bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent'||bg})()" },
  { name: 'e2e-forward', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'forward.create', params: {"localPort":"18080","remotePort":"80"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 2000, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const l=await window.aiss.workspace.forwards.list();const r=ph()==='error'&&!/invoking remote/.test(msg())&&msg().length>0&&l.length===0&&aud('forward.create','blocked')===1;return r||JSON.stringify({ph:ph(),msg:msg(),l})})()" },  // demo session cannot forward: asserts a clean error + audit; the success path needs a real sshd (unit-tested)

  // c57: playbook.create + sftp.transfer (demo host: download OK, upload = read-only error after 2nd confirm)
  { name: 'e2e-playbook', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'playbook.create', params: ${argv.includes('--probe-fail') ? '{"name":"e2e-pb","commands":"uptime"}' : '{"name":"e2e-pb","commands":"uptime; df -h；free -m"}'}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 800, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const l=JSON.parse(localStorage.getItem('aiss.playbooks.v1')||'[]').filter(p=>p.name==='e2e-pb');const r=ph()==='done'&&l.length===1&&l[0].steps.length===3&&l[0].steps.every(s=>s.confirm&&s.type==='command')&&l[0].steps[2].command==='free -m'&&aud('playbook.create','allowed')===1;return r||JSON.stringify({ph:ph(),l})})()" },
  { name: 'e2e-err-pb-missing', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'playbook.create', params: ${argv.includes('--probe-fail') ? '{"name":"e2e-pb2","commands":"ls"}' : '{"name":"e2e-pb2"}'}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 600, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const l=JSON.parse(localStorage.getItem('aiss.playbooks.v1')||'[]').filter(p=>p.name==='e2e-pb2');const r=ph()==='editing'&&!!document.querySelector('[data-testid=ai-action-ask]')&&l.length===0&&aud('playbook.create')===0;return r||JSON.stringify({ph:ph(),l:l.length})})()" },
  { name: 'e2e-xfer-dl', size: W, e2e: true, expectFile: { path: ${JSON.stringify(E2E_DL)}, content: 'port: 8080\\nredis: 127.0.0.1:6379\\n${argv.includes('--probe-fail') ? 'PROBE' : ''}' }, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise((r)=>setTimeout(()=>r('x'),3000))" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.transfer', params: { target: 'demo.ai-ssh-pro.local', direction: 'download', remotePath: '/home/demo/app/config.yaml', localPath: ${JSON.stringify(E2E_DL)} }, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 2500, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const r=ph()==='done'&&aud('sftp.transfer','allowed')===1&&aud('sftp.transfer','blocked')===0;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
  { name: 'e2e-xfer-ul-armed', size: W, e2e: true, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise((r)=>setTimeout(()=>r('x'),3000))" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.transfer', params: { target: 'demo.ai-ssh-pro.local', direction: '${argv.includes('--probe-fail') ? 'download' : 'upload'}', remotePath: '/home/demo/up.txt', localPath: ${JSON.stringify(E2E_DL)} }, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }, { eval: "{const a=document.querySelector('[data-testid=ai-action-armed]');const c=[...document.querySelectorAll('[data-testid=ai-action-card]')].pop();(a&&c.dataset.phase==='editing'&&!JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').some(e=>e.at>=window.__e2eT0&&e.type==='ai.action'))?'x':'ERR not armed'}" }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 2500, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const r=ph()==='error'&&msg().length>0&&!/invoking remote/.test(msg())&&aud('sftp.transfer','blocked')===1&&aud('sftp.transfer','allowed')===0&&(()=>{const e=[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop();return !!e&&e.scrollWidth<=e.clientWidth+1&&getComputedStyle(e).whiteSpace!=='nowrap'})();return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
  { name: 'e2e-err-xfer-badpath', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.transfer', params: {"target":"demo-web-01","direction":"download","remotePath":"etc/../hostname","localPath":"relative.txt"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 800, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const r=ph()==='error'&&aud('sftp.transfer','blocked')===1&&(await window.aiss.sessions.list()).profiles.length>=2;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },

  // c58: batch.prefill + monitor.open on the demo host; SFTP upload/download SUCCESS against the loopback test sshd
  { name: 'e2e-batch-prefill', size: W, e2e: true, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise((r)=>setTimeout(()=>r('x'),3000))" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'batch.prefill', params: { targets: 'demo.ai-ssh-pro.local', command: '${argv.includes('--probe-fail') ? "df -h" : "uptime"}' }, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }, { eval: "{const a=document.querySelector('[data-testid=ai-action-armed]');const c=[...document.querySelectorAll('[data-testid=ai-action-card]')].pop();(a&&c.dataset.phase==='editing'&&!JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').some(e=>e.at>=window.__e2eT0&&e.type==='ai.action'))?'x':'ERR not armed'}" }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 1500, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const cmd=[...document.querySelectorAll('.batch-exec input:not([type=checkbox]), .batch-exec textarea')].map(e=>e.value);const ticked=document.querySelectorAll('.batch-exec input[type=checkbox]:checked').length;const r=ph()==='done'&&cmd.includes('uptime')&&ticked>=1&&!document.querySelector('[data-testid=batch-compare]')&&aud('batch.prefill','allowed')===1&&aud('batch.prefill','blocked')===0;return r||JSON.stringify({ph:ph(),msg:msg(),cmd,ticked})})()" },
  { name: 'e2e-err-batch-notfound', size: W, e2e: true, steps: [{ eval: "window.__tabs0=document.querySelectorAll('[data-tab-id]').length; 'x'" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'batch.prefill', params: {"targets":"no-such-host-zz","command":"uptime"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 800, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const r=ph()==='error'&&document.querySelectorAll('[data-tab-id]').length===window.__tabs0&&aud('batch.prefill','blocked')===1&&aud('batch.prefill','allowed')===0;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
  { name: 'e2e-monitor-open', size: W, e2e: true, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise((r)=>setTimeout(()=>r('x'),3000))" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'monitor.open', params: { target: '${argv.includes('--probe-fail') ? "demo-web-01" : "demo.ai-ssh-pro.local"}' }, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 3000, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const r=ph()==='done'&&!!document.querySelector('.rm-trend')&&aud('monitor.open','allowed')===1&&aud('monitor.open','blocked')===0;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
  { name: 'e2e-err-monitor-notfound', size: W, e2e: true, steps: [{ eval: "window.__tabs0=document.querySelectorAll('[data-tab-id]').length; 'x'" }, { op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'monitor.open', params: {"target":"zz-none"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 800, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const r=ph()==='error'&&document.querySelectorAll('[data-tab-id]').length===window.__tabs0&&aud('monitor.open','blocked')===1;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
  ...(${SSHD ? 'true' : 'false'} ? [
    { name: 'e2e-xfer-ok-dl', size: W, e2e: true, expectFile: { path: ${JSON.stringify(E2E_DL2)}, content: 'hello from e2e sftp\\n${argv.includes('--probe-fail') ? 'PROBE' : ''}' }, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.transfer', params: { target: 'e2e-sshd', direction: 'download', remotePath: '/srv/hello.txt', localPath: ${JSON.stringify(E2E_DL2)} }, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 5000, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const r=ph()==='done'&&aud('sftp.transfer','allowed')===1&&aud('sftp.transfer','blocked')===0;return r||JSON.stringify({ph:ph(),msg:msg()})})()" },
    { name: 'e2e-xfer-ok-ul', size: W, e2e: true, expectFile: { path: ${JSON.stringify(SSHD ? join(SSHD.sftpRoot, 'srv', 'uploaded.txt') : '')}, content: 'aiss-upload-ok\\n' }, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.transfer', params: { target: 'e2e-sshd', direction: 'upload', remotePath: '${argv.includes('--probe-fail') ? "/srv/no-such-dir/uploaded.txt" : "/srv/uploaded.txt"}', localPath: ${JSON.stringify(E2E_UPSRC)} }, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }, { eval: "{const a=document.querySelector('[data-testid=ai-action-armed]');const c=[...document.querySelectorAll('[data-testid=ai-action-card]')].pop();(a&&c.dataset.phase==='editing'&&!JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').some(e=>e.at>=window.__e2eT0&&e.type==='ai.action'))?'x':'ERR not armed'}" }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 5000, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;const r=ph()==='done'&&aud('sftp.transfer','allowed')===1&&aud('sftp.transfer','blocked')===0;return r||JSON.stringify({ph:ph(),msg:msg()})})()" }
  ] : []),
  // c57 ①: port-forward SUCCESS against the loopback test sshd (--sshd); a real HTTP request goes through the tunnel
  ...(${SSHD ? 'true' : 'false'} ? [{ name: 'e2e-forward-ok', size: W, e2e: true, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.open', params: {"targets":"e2e-sshd"}, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }, { eval: "new Promise((r)=>setTimeout(()=>r('x'),4000))" }, { op: 'aiAction', name: 'forward.create', params: { localPort: '${SSHD ? SSHD.fwdPort : 0}', remoteHost: '127.0.0.1', remotePort: '${SSHD ? (argv.includes('--probe-fail') ? SSHD.deadPort : SSHD.echoPort) : 0}' }, ask: 'e2e', say: 'e2e' }, { eval: "[...document.querySelectorAll('[data-testid=ai-action-confirm]')].pop()?.click(); 'x'" }], wait: 2500, expect: "(async()=>{const ph=()=>[...document.querySelectorAll('[data-testid=ai-action-card]')].pop()?.dataset.phase;const msg=()=>[...document.querySelectorAll('[data-testid=ai-action-card] .aa-status')].pop()?.textContent||'';const aud=(n,o)=>JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(n)&&(!o||e.outcome===o)).length;let body='';try{body=await (await fetch('http://127.0.0.1:'+" + "${SSHD ? SSHD.fwdPort : 0}" + "+'/aiss-e2e')).text()}catch(e){body='ERR '+e}const l=await window.aiss.workspace.forwards.list();const r=ph()==='done'&&body==='aiss-echo:/aiss-e2e'&&l.some(f=>Number(f.localPort)===" + "${SSHD ? SSHD.fwdPort : 0}" + ")&&aud('forward.create','allowed')===1&&aud('connection.open','allowed')===1&&aud('forward.create','blocked')===0;return r||JSON.stringify({ph:ph(),msg:msg(),body,l:l.length})})()" }] : []),
  ...(${argv.includes('--probe-fail') ? 'true' : 'false'} ? [{ name: 'e2e-probe-fail', size: W, e2e: true, steps: [], wait: 200, expect: "(async()=>{const s=await window.aiss.sessions.list();return (s.profiles||[]).some(p=>p.label==='no-such-profile-zz')})()" }] : []),
  // c55: batch open (armed after first click), history fill, SFTP at a dir; 1024 variants for designer review
  { name: 'ai-action-open-armed', size: W, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.open', params: {"targets":"demo-web-01, demo-mysql, demo-web-02"}, ask: '打开三台 demo 机器', say: '已准备好，请确认。' }, { click: '[data-testid=ai-action-confirm]' }], wait: 600, expect: "!!document.querySelector('[data-testid=ai-action-armed]') && document.querySelector('[data-testid=ai-action-card]')?.dataset.phase === 'editing'" },
  { name: 'ai-action-open-armed-n', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'connection.open', params: {"targets":"demo-web-01, demo-mysql, demo-web-02"}, ask: '打开三台 demo 机器', say: '已准备好，请确认。' }, { click: '[data-testid=ai-action-confirm]' }], wait: 600 },
  { name: 'ai-action-hist', size: W, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'history.fill', params: {"query":"nginx"}, ask: '把上次重启 nginx 的命令找出来', say: '已准备好，请确认。' }], wait: 700 },
  { name: 'ai-action-sftp-path', size: W, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.open', params: {"target":"demo-web-01","path":"/var/log"}, ask: '打开 web-01 的 /var/log', say: '已准备好，请确认。' }], wait: 700 },
  { name: 'ai-action-sftp-path-n', size: [1024, 760], steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'aiAction', name: 'sftp.open', params: {"target":"demo-web-01","path":"/var/log"}, ask: '打开 web-01 的 /var/log', say: '已准备好，请确认。' }], wait: 700 },
  { name: 'inventory', size: W, steps: [{ op: 'menu', action: 'inventory' }], wait: 1400, close: true },
  { name: 'gate-timeline', size: W, steps: [{ op: 'menu', action: 'gateTimeline' }], wait: 1400 },
  { name: 'alert-rules', size: W, steps: [{ op: 'menu', action: 'alertRules' }], wait: 1400, close: true },
  { name: 'settings-narrow', size: W, steps: [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }, { op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="terminal"]' }], wait: 1400 },
  { name: 'ai-history', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { click: '[data-testid="ai-new-chat"]' }, { op: 'aiChat' }, { op: 'aiChat' }, { click: '[data-testid="ai-history"]' }], wait: 1600 },
  { name: 'settings-ai', size: W, steps: [{ op: 'menu', action: 'settings' }, { click: '.settings-nav button[data-section="ai"]' }, { click: '.policy-choice[data-policy="auto"] input' }], wait: 1400 },
  { name: 'ai-header', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }], wait: 1800 },
  { name: 'modal', size: W, steps: [{ op: 'knownHosts' }], wait: 1200, close: true },
  { name: 'cmdk', size: W, steps: [{ op: 'menu', action: 'commandPalette' }], wait: 900, close: true },
  { name: 'menu', size: W, steps: [{ click: '.titlebar-menu-trigger' }], wait: 700, close: true },
  { name: 'ai-safety-pop', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { op: 'aiComposerPop', which: 'safety' }], wait: 1400 },
  { name: 'split-view', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise(r=>setTimeout(()=>r(true),1200))" }, { op: 'menu', action: 'duplicateSession' }, { eval: "new Promise(r=>setTimeout(()=>{if(!document.querySelector('[data-testid=split-view]')){document.querySelector('[data-testid=tab-split]')?.click();setTimeout(()=>{document.querySelector('[data-testid=split-mode-horizontal]')?.click();r(true)},300)}else r(true)},1200))" }, { eval: "new Promise(r=>setTimeout(()=>{document.querySelector('[data-testid=split-pane-right] .xterm-helper-textarea')?.focus();r(true)},600))" }], wait: 1000 },
  { name: 'split-mode-menu', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise(r=>setTimeout(()=>r(true),1200))" }, { op: 'menu', action: 'duplicateSession' }, { eval: "new Promise(r=>setTimeout(()=>{if(!document.querySelector('[data-testid=split-view]')){document.querySelector('[data-testid=tab-split]')?.click();setTimeout(()=>{document.querySelector('[data-testid=split-mode-horizontal]')?.click();r(true)},300)}else r(true)},1200))" }, { eval: "new Promise(r=>setTimeout(()=>{document.querySelector('[data-testid=split-pane-right] .xterm-helper-textarea')?.focus();r(true)},600))" }, { eval: "new Promise(r=>setTimeout(()=>{document.querySelector('[data-testid=tab-split]')?.click();r(true)},600))" }], wait: 600 },
  { name: 'ai-more-menu', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { click: '[data-testid="ai-more"]' }], wait: 900 },
  { name: 'ai-model-menu', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { op: 'aiComposerPop', which: 'model' }], wait: 1400 },
  // 2.3: execution replay rows (collapsed + both expanded), then the audit jump
  { name: 'ai-exec-replay', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "document.querySelectorAll('[data-testid=ai-exec-toggle]').forEach((b)=>b.click()); document.querySelector('[data-testid=ai-exec-replay]')?.scrollIntoView({block:'center'}); document.querySelectorAll('[data-testid=ai-exec-replay]').length" }], wait: 1200 },
  { name: 'ai-exec-collapsed', size: N, steps: [{ op: 'menu', action: 'opsHome' }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat', empty: true }, { op: 'aiChat' }, { eval: "document.querySelectorAll('[data-testid=ai-exec-replay].is-open [data-testid=ai-exec-toggle]').forEach((b)=>b.click()); document.querySelectorAll('[data-testid=ai-exec-replay]')[1]?.scrollIntoView({block:'end'}); true" }], wait: 1200 },
  { name: 'ai-exec-failed', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "const r=document.querySelectorAll('[data-testid=ai-exec-replay]')[1]; if(r&&!r.classList.contains('is-open')) r.querySelector('[data-testid=ai-exec-toggle]').click(); r?.scrollIntoView({block:'center'}); r?.getAttribute('data-status')" }], wait: 1200 },
  // B1: exit-code capture setting
  { name: 'settings', size: W, steps: [{ op: 'menu', action: 'settings' }], wait: 1200 },
  { name: 'settings-reconnect', size: W, steps: [{ op: 'menu', action: 'settings' }, { eval: "(()=>{const b=[...document.querySelectorAll('.settings-nav button')].find(x=>/重连|Reconnect|连接/.test(x.textContent||''));b?.click();setTimeout(()=>document.querySelector('[data-testid=d77-connect-timeout]')?.scrollIntoView({block:'center'}),150);return !!b})()" }], wait: 1200 },
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
  { name: 'paste-preview', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const ta=document.querySelector('.xterm textarea');const dt=new DataTransfer();dt.setData('text/plain',['cd /var/www','reboot','systemctl restart nginx',''].join(String.fromCharCode(10)));ta.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,300));return !!document.querySelector('[data-testid=paste-preview]')})()" }], wait: 900 },
  { name: 'ai-ask-context', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');window.dispatchEvent(new CustomEvent('aiss-ai-ask-context',{detail:{sessionId:sid,text:'nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)'}}));await new Promise(r=>setTimeout(r,900));return document.querySelector('[data-testid=ai-composer] textarea')?.value?.slice(0,40)||'no-composer'})()" }], wait: 900 },
  { name: 'term-drop-upload', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const x=document.querySelector('.xterm');const dt=new DataTransfer();dt.items.add(new File(['x'],'release.tar.gz'));x.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,300));return !!document.querySelector('[data-testid=term-drop-hint]')})()" }], wait: 700 },
  { name: 'blocks-actions', size: W, steps: [{ eval: "localStorage.setItem('aiss.blocks.enabled','1'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:sid,command:'df -h'}}));window.dispatchEvent(new CustomEvent('aiss-term-chunk',{detail:{sessionId:sid,text:['Filesystem Size Used Avail Use% Mounted on','/dev/sda1 50G 41G 9G 82% /','tmpfs 3.9G 0 3.9G 0% /dev/shm'].join(String.fromCharCode(10))}}));await new Promise(r=>setTimeout(r,400));return !!document.querySelector('[data-testid=block-ask-ai]')})()" }], wait: 900 },
  { name: 'blocks-exit', size: W, steps: [{ eval: "localStorage.setItem('aiss.blocks.enabled','1'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const N=String.fromCharCode(10),E=String.fromCharCode(27),B=String.fromCharCode(7);const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');const run=(cmd,out,code)=>{window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:sid,command:cmd}}));window.dispatchEvent(new CustomEvent('aiss-term-chunk',{detail:{sessionId:sid,text:out+N+E+']777;aiss-exit;abcd1234;'+code+B}}))};run('nginx -t','nginx: configuration file /etc/nginx/nginx.conf test is successful',0);run('systemctl restart nginx',['Job for nginx.service failed because the control process exited with error code.','See journalctl -xeu nginx.service for details.'].join(N),1);await new Promise(r=>setTimeout(r,400));return !!document.querySelector('[data-testid=block-why-failed]')})()" }], wait: 900 },
  { name: 'paste-strict', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const ta=document.querySelector('.xterm textarea');const dt=new DataTransfer();dt.setData('text/plain',['cd /var/www','ls -l',''].join(String.fromCharCode(10)));ta.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,300));return !!document.querySelector('[data-testid=paste-preview-strict]')})()" }], wait: 900 },
  { name: 'sftp-follow', size: W, steps: [{ op: 'sftpDual' }, { eval: "!!document.querySelector('[data-testid=sftp-follow-cwd]')" }], wait: 2600 },
  { name: 'qc-connect', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));document.querySelector('.xterm textarea')?.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'p',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,400));const i=document.querySelector('.cmdp-input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'ssh -p 2222 -i ~/.ssh/id_ed25519 -J ops@bastion deploy@app.internal');i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));return document.querySelector('.cmdp-input')?.closest('[role=dialog],div')?.parentElement?.textContent?.includes('app.internal')})()" }], wait: 900, close: true },
  { name: 'blocks-nav', size: W, steps: [{ eval: "localStorage.setItem('aiss.blocks.enabled','1'); localStorage.setItem('aiss.shellIntegration','1'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const N=String.fromCharCode(10);const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');const run=(cmd,out,code)=>{window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:sid,command:cmd}}));window.dispatchEvent(new CustomEvent('aiss-term-chunk',{detail:{sessionId:sid,text:out}}));window.dispatchEvent(new CustomEvent('aiss-shell-exit',{detail:{sessionId:sid,code}}))};run('uptime',' 19:10:02 up 12 days,  3:41,  1 user,  load average: 0.08, 0.12, 0.10',0);run('ls /srv/missing','ls: cannot access /srv/missing: No such file or directory',2);run('df -h /','/dev/sda1 50G 41G 9G 82% /',0);await new Promise(r=>setTimeout(r,200));window.dispatchEvent(new CustomEvent('aiss-block-select',{detail:{sessionId:sid,fromEnd:1}}));await new Promise(r=>setTimeout(r,300));return !!document.querySelector('.term-block.is-selected [data-testid=block-rerun]')})()" }], wait: 900 },
  { name: 'ai-fill-send', size: W, steps: [{ eval: "localStorage.setItem('aiss.blocks.enabled','1'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,600));const b=document.querySelector('[data-testid=ai-code-fill]');if(!b)return 'no-fill';b.click();await new Promise(r=>setTimeout(r,200));const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:sid,command:'ss -ltnp | grep :80'}}));window.dispatchEvent(new CustomEvent('aiss-term-chunk',{detail:{sessionId:sid,text:'LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:((httpd,pid=2231,fd=4))'}}));window.dispatchEvent(new CustomEvent('aiss-shell-exit',{detail:{sessionId:sid,code:0}}));await new Promise(r=>setTimeout(r,400));return !!document.querySelector('[data-testid=block-send-ai]')})()" }], wait: 900 },
  { name: 'cmdp-qc', size: W, steps: [{ op: 'menu', action: 'opsHome' }, { op: 'menu', action: 'commandPalette' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,300));const i=document.querySelector('.cmdp-input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'ops@10.0.3.17:2222');i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));return document.querySelector('.cmdp')?.textContent?.includes('10.0.3.17')})()" }], wait: 900, close: true },
  { name: 'blocks-hint', size: W, toasts: true, steps: [{ eval: "localStorage.removeItem('aiss.blocks.enabled'); localStorage.removeItem('aiss.blocks.hintShown'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,800));for(const c of ['uptime','df -h','free -m'])window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:'shot-real',command:c}}));await new Promise(r=>setTimeout(r,300));return localStorage.getItem('aiss.blocks.hintShown')})()" }], wait: 700 },
  { name: 'sidebar-quick', size: W, steps: [{ eval: "(async()=>{document.querySelector('.recent-connections-toggle')?.click();await new Promise(r=>setTimeout(r,200));const i=document.querySelector('[data-testid=sidebar-search]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'root@10.0.0.5:2222');i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));return document.querySelector('[data-testid=sidebar-quick]')?.textContent+' | '+!!document.querySelector('[data-testid=recent-quick-badge]')})()" }], wait: 700 },
  { name: 'recent-filter', size: W, steps: [{ eval: "(async()=>{const t=document.querySelector('.recent-connections-toggle');if(t&&t.getAttribute('aria-expanded')!=='true')t.click();await new Promise(r=>setTimeout(r,300));const i=document.querySelector('[data-testid=recent-filter]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'gw');i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));document.querySelector('[data-testid=recent-save-host]')?.focus();return document.querySelectorAll('.recent-connections-list li').length+' rows, save='+document.querySelectorAll('[data-testid=recent-save-host]').length})()" }], wait: 600 },
  { name: 'ai-steps-paused', size: W, toasts: true, steps: [{ eval: "(()=>{const i=document.querySelector('[data-testid=recent-filter]');if(!i)return true;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()" }, { eval: "localStorage.setItem('aiss.blocks.enabled','1'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,800));const b=document.querySelector('[data-testid=ai-code-steps]');if(!b)return 'no-steps';b.click();await new Promise(r=>setTimeout(r,300));const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');const cmd='systemctl status nginx --no-pager';window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:sid,command:cmd}}));await new Promise(r=>setTimeout(r,100));window.dispatchEvent(new CustomEvent('aiss-term-chunk',{detail:{sessionId:sid,text:'Unit nginx.service could not be found.'}}));window.dispatchEvent(new CustomEvent('aiss-shell-exit',{detail:{sessionId:sid,code:4}}));await new Promise(r=>setTimeout(r,500));return [...document.querySelectorAll('[data-testid=toast]')].map(x=>x.textContent).join(' || ')})()" }], wait: 800 },
  { name: 'script-progress', size: W, steps: [{ eval: "localStorage.setItem('aiss.blocks.enabled','1'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,800));const b=document.querySelector('[data-testid=ai-code-steps]');if(!b)return 'no-steps';b.click();await new Promise(r=>setTimeout(r,300));return document.querySelector('[data-testid=script-progress]')?.textContent})()" }], wait: 700 },
  { name: 'script-progress-failed', size: W, steps: [{ eval: "localStorage.setItem('aiss.blocks.enabled','1'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,800));const b=document.querySelector('[data-testid=ai-code-steps]');if(!b)return 'no-steps';b.click();await new Promise(r=>setTimeout(r,300));const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');const cmd='systemctl status nginx --no-pager';window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:sid,command:cmd}}));await new Promise(r=>setTimeout(r,100));window.dispatchEvent(new CustomEvent('aiss-term-chunk',{detail:{sessionId:sid,text:'Unit nginx.service could not be found.'}}));window.dispatchEvent(new CustomEvent('aiss-shell-exit',{detail:{sessionId:sid,code:4}}));await new Promise(r=>setTimeout(r,500));return document.querySelector('[data-testid=script-progress]')?.textContent})()" }], wait: 700 },
  { name: 'hostkey-new', size: W, steps: [{ send: ['ssh:hostKeyPrompt', { requestId: 'shot-hk1', host: '10.0.3.21', port: 22, fingerprint: 'SHA256:q3Vt9mWb0x7JkP2sYh4LcN8eRfA1uGzD6oTiE5wXyQk', reason: 'unknown', keyType: 'ssh-ed25519', expiresAt: Date.now() + 120000 }] }], wait: 700 },
  { name: 'hostkey-changed', size: W, steps: [{ send: ['ssh:hostKeyPrompt', { requestId: 'shot-hk2', host: 'db-prod-01', port: 22, fingerprint: 'SHA256:Z8kq1VnT4cR7bW2mLp9sXe3HdF6yJu0oAiGt5NwQrBc', previousFingerprint: 'SHA256:q3Vt9mWb0x7JkP2sYh4LcN8eRfA1uGzD6oTiE5wXyQk', reason: 'changed', keyType: 'ecdsa-sha2-nistp256', expiresAt: Date.now() + 120000 }] }], wait: 700 },
  { name: 'ask-failed-noblocks', size: W, steps: [{ eval: "localStorage.removeItem('aiss.blocks.enabled'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const k='aiss.smartHistory';const all=JSON.parse(localStorage.getItem(k)||'[]');const cmd=all[1]?.command;if(all[1])all[1].lastExit=1;localStorage.setItem(k,JSON.stringify(all));const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');const N=String.fromCharCode(10);window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:sid,command:cmd}}));window.dispatchEvent(new CustomEvent('aiss-term-chunk',{detail:{sessionId:sid,text:cmd+N+'bash: /opt/app: Permission denied'+N}}));window.dispatchEvent(new CustomEvent('aiss-shell-exit',{detail:{sessionId:sid,code:1}}));document.querySelector('.xterm textarea')?.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,500));document.querySelector('[data-testid=qp-ask-failed]')?.click();await new Promise(r=>setTimeout(r,900));return cmd+' '+!!sid+' '+JSON.stringify([...document.querySelectorAll('textarea')].map(t=>t.value).filter(Boolean))})()" }], wait: 900 },
  { name: 'typed-failed', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');window.dispatchEvent(new CustomEvent('aiss-shell-cmd',{detail:{sessionId:sid,command:'systemctl restart api'}}));window.dispatchEvent(new CustomEvent('aiss-shell-exit',{detail:{sessionId:sid,code:5}}));document.querySelector('.xterm textarea')?.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,500));const i=document.querySelector('[data-testid=qp-history] input');if(i){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'systemctl');i.dispatchEvent(new Event('input',{bubbles:true}))}await new Promise(r=>setTimeout(r,300));return !!sid+' '+document.querySelectorAll('[data-testid=qp-failed]').length})()" }], wait: 700 },
  { name: 'history-cwd', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const k='aiss.smartHistory';const all=JSON.parse(localStorage.getItem(k)||'[]');if(all[2])all[2].lastCwd='/var/www/app';if(all[3])all[3].lastCwd='/etc/nginx';localStorage.setItem(k,JSON.stringify(all));document.querySelector('.xterm textarea')?.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,500));return document.querySelectorAll('[data-testid=qp-run-in-cwd]').length})()" }], wait: 900 },
  // D60: cross-tab search dialog with a query typed
  { name: 'search-all', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise(r=>setTimeout(r,1500))" }, { op: 'menu', action: 'searchAllTerms' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,300));const el=document.querySelector('[data-testid=search-all-input]');if(!el)return 0;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,'demo');el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));return document.querySelectorAll('.search-all-hit').length})()" }], wait: 600 },
  // D75: SFTP subfolder search with a query run
  { name: 'sftp-tree-search', size: W, steps: [{ op: 'sftpDual' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,2400));document.querySelector('[data-testid=sftp-remote-tree-search]')?.click();await new Promise(r=>setTimeout(r,300));const el=document.querySelector('[data-testid=sftp-tree-input]');if(!el)return 0;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,'e');el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,100));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await new Promise(r=>setTimeout(r,900));return document.querySelectorAll('.search-all-hit').length})()" }], wait: 600 },
  // D65: batch panel (group chips appear when connected hosts have folders / tags)
  { name: 'batch-groups', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { eval: "new Promise(r=>setTimeout(r,1500))" }, { op: 'menu', action: 'batchExec' }], wait: 900 },
  // D7c: terminal settings with two paste-skip hosts
  { name: 'copy-on-select-pref', size: W, steps: [{ op: 'menu', action: 'terminalPrefs' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,600));const f=document.querySelector('[data-testid=copy-on-select]');f?.scrollIntoView({block:'center'});return f?1:0})()" }], wait: 600 },
  { name: 'paste-skip-hosts', size: W, steps: [{ eval: "localStorage.setItem('aiss.paste.skipHosts.v1',JSON.stringify(['demo@demo-host:22','deploy@web-01:22']))" }, { op: 'menu', action: 'terminalPrefs' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,600));const f=document.querySelector('[data-testid=paste-skip-prefs]');f?.scrollIntoView({block:'center'});return f?1:0})()" }], wait: 600 },
  { name: 'history-failed', size: W, steps: [{ eval: "localStorage.removeItem('aiss.blocks.enabled'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const k='aiss.smartHistory';const all=JSON.parse(localStorage.getItem(k)||'[]');let hit=0;if(all[1]){all[1].lastExit=1;hit=all[1].command}localStorage.setItem(k,JSON.stringify(all));document.querySelector('.xterm textarea')?.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,500));return hit+' '+!!document.querySelector('[data-testid=qp-failed]')})()" }], wait: 900 },
  { name: 'find-blocks', size: W, steps: [{ eval: "(()=>{const i=document.querySelector('[data-testid=sidebar-search]');if(!i)return true;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()" }, { eval: "localStorage.setItem('aiss.blocks.enabled','1'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,1200));const sid=document.querySelector('.terminal-pane-wrap[data-session-id]')?.getAttribute('data-session-id');const run=(cmd,out,code)=>{window.dispatchEvent(new CustomEvent('aiss-command-submitted',{detail:{sessionId:sid,command:cmd}}));window.dispatchEvent(new CustomEvent('aiss-term-chunk',{detail:{sessionId:sid,text:out}}));window.dispatchEvent(new CustomEvent('aiss-shell-exit',{detail:{sessionId:sid,code}}))};run('uptime',' 19:58:02 up 12 days, load average: 0.08',0);run('df -h /','/dev/sda1 50G 41G 9G 82% /',0);run('free -m','Mem: 7812 6120 410',0);run('lsblk','sda 8:0 0 50G disk',0);await new Promise(r=>setTimeout(r,200));window.dispatchEvent(new CustomEvent('aiss-terminal-find',{detail:{scope:'blocks'}}));await new Promise(r=>setTimeout(r,300));const i=document.querySelector('.terminal-find-bar input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'sda');i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));document.querySelector('.terminal-find-bar input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await new Promise(r=>setTimeout(r,300));return document.querySelector('[data-testid=terminal-find-count]')?.textContent+' | '+document.querySelector('[data-testid=blocks-hits]')?.textContent})()" }], wait: 800 },
  { name: 'sftp-follow-note', size: W, steps: [{ eval: "(()=>{const i=document.querySelector('[data-testid=sidebar-search]');if(!i)return true;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()" }, { eval: "sessionStorage.removeItem('aiss.screenshot.sftpFailed'); sessionStorage.setItem('aiss.screenshot.sftpFollow','1'); true" }, { op: 'sftpDual' }], wait: 2600 },
  { name: 'ai-steps', size: W, toasts: true, steps: [{ eval: "localStorage.removeItem('aiss.blocks.enabled'); window.dispatchEvent(new Event('aiss-blocks')); true" }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { eval: "(async()=>{await new Promise(r=>setTimeout(r,600));const b=document.querySelector('[data-testid=ai-code-steps]');if(!b)return 'no-steps';b.click();await new Promise(r=>setTimeout(r,300));return document.querySelector('.cmdbar-input,textarea,input')?.value||'filled?'})()" }], wait: 900 },
  { name: 'sftp-retry-all', size: W, steps: [{ eval: "sessionStorage.setItem('aiss.screenshot.sftpFailed','1'); true" }, { op: 'sftpDual' }], wait: 2600 },
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
// --narrow: re-run the picked scenarios at 1024x760 (designer review at 1024 with the right panel open)
if (${argv.includes('--narrow') ? 'true' : 'false'}) for (const s of picked) s.size = [1024, 760]
if (!picked.length) { console.error('[cov] --only matched no shots in set ' + ${JSON.stringify(shotSet || 'base')} + ': ' + ONLY.join(',') + ' (available: ' + (${JSON.stringify(shotSet)} === 'chrome' ? chrome : base).map((s) => s.name).join(',') + ')'); process.exit(2) }
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
        dfPop: !!document.querySelector('.df-pop'),
        selPop: !!document.querySelector('.ui-select-list'),
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
      await win.webContents.insertCSS('.toast-stack { visibility: hidden !important; } html.shot-toasts .toast-stack { visibility: visible !important; }')
      let leaks = 0
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
        // c51: isolate scenarios — reset popovers/modals/right panel, then Escape
        await fire(win, { op: 'reset' })
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        await sleep(300)
        await win.webContents.executeJavaScript('document.documentElement.classList.toggle("shot-toasts", ' + (s.toasts ? 'true' : 'false') + '); true', true)
        await sleep(400)
        if (s.e2e) await win.webContents.executeJavaScript('window.__e2eT0 = Date.now(); true', true)
        for (const st of s.steps) {
          if (st.eval) { const ev = await win.webContents.executeJavaScript('{' + st.eval + ';}', true).catch((e) => 'ERR ' + e); console.log('[cov] eval', ev); if (s.e2e && String(ev).startsWith('ERR ')) { console.error('[cov] EVAL FAILED', s.name, ev); leaks++ } }
          else if (st.send) win.webContents.send(st.send[0], st.send[1])
          else if (st.click) await win.webContents.executeJavaScript('document.querySelector(' + JSON.stringify(st.click) + ')?.click(); true', true)
          else await fire(win, st)
          await sleep(500)
        }
        await sleep(s.wait || 800)
        const p = await probe(win)
        const dom = await win.webContents.executeJavaScript('(document.getElementById(\"root\")?.innerHTML.length || 0) + \" \" + location.href.slice(0, 80)', true).catch((e) => 'ERR ' + e)
        console.log('[cov] dom', dom)
        console.log('[cov]', s.file, p)
        if (s.expectFile) { let got = null; try { got = existsSync(s.expectFile.path) ? readFileSync(s.expectFile.path, 'utf8') : null } catch {} console.log('[cov] expectFile', s.file, got === s.expectFile.content); if (got !== s.expectFile.content) { console.error('[cov] EXPECT FILE FAILED ' + s.file + ' got ' + JSON.stringify(got)); leaks++ } }
      if (s.expect) { const okE = await win.webContents.executeJavaScript(s.expect, true).catch((e) => 'ERR ' + e); console.log('[cov] expect', s.file, okE); if (okE !== true) { console.error('[cov] EXPECT FAILED', s.file); leaks++ } }
        // c52 SA1: repro scenarios are hard checks — a leaked popover fails the run
        if (s.name.startsWith('leak-')) { const pj = JSON.parse(p); if (pj.dfPop || pj.selPop) { console.error('[cov] LEAK', s.file, 'dfPop=' + pj.dfPop, 'selPop=' + pj.selPop); leaks++ } }
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
      if (leaks) { console.error('[cov] ' + leaks + ' popover leak(s)'); app.exit(3); return }
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
const guard = setTimeout(killTree, 420000)
child.on('exit', (code) => {
  clearTimeout(guard)
  if (SSHD) SSHD.close()
  try { rmSync(root, { recursive: true, force: true }) } catch {}
  console.log('[cov] exit', code)
  process.exit(code ?? 1)
})
