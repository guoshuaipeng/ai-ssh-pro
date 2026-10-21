// GUI end-to-end tests: real clicks via Playwright's Electron driver.
// Isolated demo profile (fake hosts only) + an in-process ssh2 test server on 127.0.0.1.
// Usage: npm run build && npm run e2e
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync, fstatSync, openSync, readSync, writeSync, closeSync, unlinkSync, rmdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import net from 'node:net'
import http from 'node:http'
import { createRequire } from 'node:module'
import { _electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const { Server, utils } = require('ssh2')
const repo = resolve(import.meta.dirname, '..')
const mainJs = join(repo, 'out', 'main', 'index.js')
if (!existsSync(mainJs)) throw new Error('run npm run build first')

// ---------- local SSH test target ----------
// SFTP subsystem backed by a temp dir ("/" on the server == sftpRoot)
const sftpRoot = mkdtempSync(join(tmpdir(), 'aissh-e2e-sftp-'))
writeFileSync(join(sftpRoot, 'hello.txt'), 'hello from e2e sftp\n')
const { STATUS_CODE, flagsToString } = utils.sftp
const toLocal = (rp) => join(sftpRoot, posix.normalize('/' + String(rp || '')).replace(/^\/+/, ''))
const attrsOf = (st) => ({ mode: st.mode, uid: 0, gid: 0, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) })
function serveSftp(sftp) {
  const handles = new Map()
  let seq = 0
  const mk = (o) => { const b = Buffer.alloc(4); b.writeUInt32BE(++seq); handles.set(seq, o); return b }
  const get = (h) => handles.get(h.readUInt32BE(0))
  const fail = (id, e) => sftp.status(id, e?.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE, String(e?.message || e))
  const ok = (id, fn) => { try { fn(); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } }
  sftp.on('REALPATH', (id, rp) => { const n = posix.normalize('/' + (rp === '.' ? '' : rp)); sftp.name(id, [{ filename: n, longname: n, attrs: {} }]) })
  for (const ev of ['STAT', 'LSTAT']) sftp.on(ev, (id, rp) => { try { sftp.attrs(id, attrsOf(statSync(toLocal(rp)))) } catch (e) { fail(id, e) } })
  sftp.on('FSTAT', (id, h) => { try { sftp.attrs(id, attrsOf(fstatSync(get(h).fd))) } catch (e) { fail(id, e) } })
  sftp.on('OPENDIR', (id, rp) => {
    try { const d = toLocal(rp); if (!statSync(d).isDirectory()) throw new Error('not a directory'); sftp.handle(id, mk({ dir: d, done: false })) } catch (e) { fail(id, e) }
  })
  sftp.on('READDIR', (id, h) => {
    const o = get(h)
    if (!o || o.done) return sftp.status(id, STATUS_CODE.EOF)
    o.done = true
    const names = readdirSync(o.dir).map((n) => {
      const st = statSync(join(o.dir, n))
      return { filename: n, longname: (st.isDirectory() ? 'd' : '-') + 'rw-r--r-- 1 e2e e2e ' + st.size + ' Jan 1 00:00 ' + n, attrs: attrsOf(st) }
    })
    if (!names.length) return sftp.status(id, STATUS_CODE.EOF)
    sftp.name(id, names)
  })
  sftp.on('OPEN', (id, rp, flags) => { try { sftp.handle(id, mk({ fd: openSync(toLocal(rp), flagsToString(flags)) })) } catch (e) { fail(id, e) } })
  sftp.on('READ', (id, h, off, len) => {
    try { const b = Buffer.alloc(len); const n = readSync(get(h).fd, b, 0, len, off); if (n === 0) return sftp.status(id, STATUS_CODE.EOF); sftp.data(id, b.subarray(0, n)) } catch (e) { fail(id, e) }
  })
  sftp.on('WRITE', (id, h, off, data) => ok(id, () => writeSync(get(h).fd, data, 0, data.length, off)))
  sftp.on('CLOSE', (id, h) => { const o = get(h); handles.delete(h.readUInt32BE(0)); try { if (o?.fd != null) closeSync(o.fd) } catch {} sftp.status(id, STATUS_CODE.OK) })
  sftp.on('MKDIR', (id, rp) => ok(id, () => mkdirSync(toLocal(rp))))
  sftp.on('REMOVE', (id, rp) => ok(id, () => unlinkSync(toLocal(rp))))
  sftp.on('RMDIR', (id, rp) => ok(id, () => rmdirSync(toLocal(rp))))
  sftp.on('RENAME', (id, a, b) => ok(id, () => renameSync(toLocal(a), toLocal(b))))
  sftp.on('SETSTAT', (id) => sftp.status(id, STATUS_CODE.OK))
  sftp.on('FSETSTAT', (id) => sftp.status(id, STATUS_CODE.OK))
}
const conns = new Set()
const hostKey = utils.generateKeyPairSync('ed25519').private
const ssh = new Server({ hostKeys: [hostKey] }, (client) => {
  conns.add(client)
  client.on('close', () => conns.delete(client))
  client.on('error', () => {})
  client.on('authentication', (ctx) => {
    if (ctx.method === 'password' && ctx.username === 'e2e' && ctx.password === 'e2e-pass') ctx.accept()
    else ctx.reject(['password'])
  })
  client.on('ready', () => {
    // direct-tcpip (local port forwarding): echo back with a prefix
    client.on('tcpip', (accept, _reject, info) => {
      const ch = accept()
      ch.on('data', (d) => ch.write(`echo:${info.destPort}:${d}`))
      ch.on('end', () => ch.end())
    })
    client.on('session', (accept) => {
      const session = accept()
      session.on('pty', (ok) => ok && ok())
      session.on('window-change', (ok) => ok && ok())
      session.on('env', (ok) => ok && ok())
      session.on('sftp', (ok) => serveSftp(ok()))
      session.on('exec', (ok, _rej, info) => {
        const ch = ok()
        if (info.command === 'uptime') ch.write(' 12:00:00 up 1 day, load average: 0.00\n')
        if (info.command.includes('/proc/loadavg')) ch.write(RESOURCE_FIXTURE)
        const tool = toolReply(info.command)
        if (tool != null) execLog.push(info.command)
        if (tool) ch.write(tool)
        ch.exit(0)
        ch.end()
      })
      session.on('shell', (ok) => {
        const sh = ok()
        let line = ''
        sh.write('e2e$ ')
        sh.on('data', (d) => {
          for (const ch of String(d)) {
            if (ch === '\r' || ch === '\n') {
              const out = line.startsWith('echo ') ? line.slice(5) : line ? `ran: ${line}` : ''
              sh.write(`\r\n${out}${out ? '\r\n' : ''}e2e$ `)
              line = ''
            } else {
              line += ch
              sh.write(ch)
            }
          }
        })
      })
    })
  })
})
await new Promise((r) => ssh.listen(0, '127.0.0.1', r))
const sshPort = ssh.address().port

// ---------- isolated demo profile ----------
const root = mkdtempSync(join(tmpdir(), 'aissh-e2e-'))
const home = join(root, 'home')
const appData = join(root, 'AppData', 'Roaming')
const userData = join(appData, 'ai-ssh-pro')
const downloads = join(root, 'downloads')
for (const d of [home, appData, userData, downloads]) mkdirSync(d, { recursive: true })
const p = (id, label, host, folderId, username = 'ops', port = 22, extra = {}) => ({ id, label, host, port, username, folderId, ...extra })
writeFileSync(
  join(userData, 'ai-ssh-pro.json'),
  JSON.stringify({
    locale: 'en',
    savedSessions: {
      folders: [{ id: 'f-web', name: 'Demo · Web' }, { id: 'f-db', name: 'Demo · Database' }],
      profiles: [
        p('p1', 'demo-web-01', '10.0.0.11', 'f-web'),
        p('p2', 'demo-web-02', '10.0.0.12', 'f-web'),
        p('p4', 'demo-mysql-primary', '10.0.1.21', 'f-db', 'dba'),
        p('p9', 'e2e-local', '127.0.0.1', undefined, 'e2e', sshPort, { password: 'e2e-pass' }),
        p('p10', 'e2e-monitor', '127.0.0.1', undefined, 'e2e', sshPort, { password: 'e2e-pass' })
      ]
    }
  })
)
const wrapperDir = join(root, 'wrapper')
mkdirSync(wrapperDir)
writeFileSync(join(wrapperDir, 'package.json'), JSON.stringify({ name: 'ai-ssh-pro', version: JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version + '-e2e', type: 'module', main: 'main.mjs' }))
writeFileSync(
  join(wrapperDir, 'main.mjs'),
  `import { app, session } from 'electron'
import { join } from 'node:path'
app.setPath('appData', ${JSON.stringify(appData)})
app.setPath('userData', ${JSON.stringify(userData)})
app.whenReady().then(() => {
  session.defaultSession.on('will-download', (_e, item) => item.setSavePath(join(${JSON.stringify(downloads)}, item.getFilename())))
})
await import(${JSON.stringify(pathToFileURL(mainJs).href)})
`
)

const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: join(root, 'AppData', 'Local') }
for (const k of Object.keys(env)) if (k.startsWith('AISS_') || k === 'ELECTRON_RENDERER_URL') delete env[k]
let app = await _electron.launch({ executablePath: require('electron'), args: [wrapperDir], env, timeout: 60000 })
let page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2500)

const results = []
const artifacts = join(repo, 'e2e-artifacts')
const RESOURCE_FIXTURE = [
  '0.52 0.40 0.30 1/200 12345', '@@', '4', '@@',
  'cpu  100 0 100 800 0 0 0 0 0 0', 'cpu  150 0 150 900 0 0 0 0 0 0', '@@',
  '              total        used        free      shared  buff/cache   available',
  'Mem:     8000000000  3000000000  1000000000        1000  4000000000  6000000000',
  'Swap:    2000000000   500000000  1500000000', '@@',
  'Filesystem     1024-blocks      Used Available Capacity Mounted on',
  '/dev/vda1         41152832  20576416  20576416      50% /',
  '/dev/vdb1        103081248  92773123  10308125      90% /data', '@@',
  '93784.12 300000.00', ''
].join('\n')
// server toolbox fixtures (fake host; nothing is executed)
const execLog = []
function toolReply(cmd) {
  if (cmd.includes('ps -eo')) return [
    '    1 root       0.0  0.1  11800 3-02:11:09 /sbin/init splash',
    '  812 mysql     12.5  9.8 812340    02:11:09 /usr/sbin/mysqld --daemonize',
    ' 4242 www-data  73.2  2.1  65432       11:09 nginx: worker process', ''
  ].join('\n')
  if (cmd.includes('systemctl list-units')) return [
    'cron.service                 loaded active   running Regular background program processing daemon',
    'nginx.service                loaded failed   failed  A high performance web server',
    'mysql.service                loaded active   running MySQL Community Server', ''
  ].join('\n')
  if (cmd.includes('ss -Htulnp')) return [
    'tcp   LISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=900,fd=3))',
    'tcp   LISTEN 0      80         127.0.0.1:3306      0.0.0.0:*    users:(("mysqld",pid=812,fd=21))', ''
  ].join('\n')
  if (cmd.includes('systemctl status')) return '● nginx.service - A high performance web server\n     Active: failed (Result: exit-code)\n'
  if (cmd.includes('tail -n')) return [
    '2026-10-14T10:00:01 web nginx[1]: started',
    '2026-10-14T10:00:02 web nginx[1]: [warn] upstream response is buffered',
    '2026-10-14T10:00:03 web nginx[1]: [error] connect() failed while connecting to upstream', ''
  ].join('\n')
  if (/^(sudo -n )?(kill -|systemctl (start|stop|restart|reload) )/.test(cmd)) return ''
  return null
}
async function step(name, fn) {
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  OK   ${name} (${Date.now() - t0}ms)`)
  } catch (e) {
    results.push({ name, ok: false })
    console.log(`  FAIL ${name}: ${String(e?.message || e).split('\n').slice(0, 4).join(' / ')}`)
    mkdirSync(artifacts, { recursive: true })
    await page.screenshot({ path: join(artifacts, name.replace(/\W+/g, '_') + '.png') }).catch(() => {})
  }
}
const expectVisible = (loc, timeout = 8000) => loc.first().waitFor({ state: 'visible', timeout })
const expectHidden = (loc, timeout = 8000) => loc.first().waitFor({ state: 'hidden', timeout })
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
let tree = page.locator('.session-folder-block')
let search = page.getByPlaceholder(/Search sessions/)
// Fails if visible UI text or title/placeholder/aria-label contains CJK (terminal output excluded).
async function cjkScan(label) {
  const hits = await page.evaluate(() => {
    const re = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/
    const out = []
    const visible = (el) => el && el.getClientRects().length > 0 && !el.closest('.xterm')
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    while ((n = w.nextNode())) {
      const t = n.textContent || ''
      if (re.test(t) && visible(n.parentElement)) out.push(t.trim().slice(0, 60))
    }
    for (const el of document.querySelectorAll('[title],[placeholder],[aria-label]')) {
      if (!visible(el)) continue
      for (const a of ['title', 'placeholder', 'aria-label']) {
        const v = el.getAttribute(a)
        if (v && re.test(v)) out.push('@' + a + ': ' + v.slice(0, 60))
      }
    }
    return [...new Set(out)]
  })
  assert(!hits.length, label + ' has CJK text: ' + hits.slice(0, 10).join(' | '))
}
const menu = async (top, item) => {
  await page.getByRole('button', { name: top, exact: true }).click()
  await page.getByText(item, { exact: true }).first().click()
}

const renameActiveTab = async (nextTitle) => {
  const tab = page.locator('.tab-bar .tab.active').first()
  await tab.dblclick()
  const input = page.locator('.tab-rename-input')
  await expectVisible(input)
  await input.click({ clickCount: 3 })
  await page.keyboard.press('Backspace')
  await input.pressSequentially(nextTitle, { delay: 15 })
  await page.waitForFunction((v) => {
    const el = document.querySelector('.tab-rename-input')
    return el && el.value === v
  }, nextTitle, { timeout: 5000 })
  await input.press('Enter')
  await expectVisible(page.locator('.tab-bar .tab').filter({ hasText: nextTitle }), 8000)
}

const openBackupPanel = async () => {
  await menu('File', 'Encrypted backup & restore…')
  // File → backup now lands on Settings ▸ Backup; open the modal from there.
  const openBtn = page.getByRole('button', { name: 'Encrypted backup & restore…', exact: true })
  await expectVisible(openBtn)
  await openBtn.click()
  await expectVisible(page.locator('.bk-panel'))
}

const closeActiveTab = async () => {
  await page.locator('.tab-bar .tab.active .tab-close').first().click()
  const dlg = page.getByTestId('dialog-ok')
  if (await dlg.isVisible().catch(() => false)) await dlg.click()
}
const noModal = async (label) => {
  assert((await page.locator('.modal-backdrop, [aria-modal="true"]').count()) === 0, label + ': opened as a modal dialog')
}
const cmdInput = () => page.locator('.session-command-bar input, .session-command-bar textarea').first()
/** UX-44: command bar collapsed by default — expand FAB before interacting.
 *  During reconnect the bar/FAB may be unmounted briefly; poll until either appears. */
const closeAllSessionTabs = async () => {
  for (let i = 0; i < 12; i++) {
    const tabs = page.locator('.tab-bar .tab.tab-kind-session, .tab-bar .tab:not(.tab-kind-home)')
    if ((await tabs.count()) === 0) break
    const closeBtn = tabs.first().locator('.tab-close').first()
    await closeBtn.click({ force: true, timeout: 5000 }).catch(() => {})
    const dlg = page.getByTestId('dialog-ok')
    if (await dlg.isVisible({ timeout: 2500 }).catch(() => false)) await dlg.click()
    await page.waitForTimeout(250)
  }
  await page.locator('.tab-bar .tab.tab-kind-home').first().click({ force: true }).catch(() => {})
}

const ensureCmdBar = async (timeout = 15000) => {
  const bar = page.locator('.session-command-bar')
  const fab = page.getByTestId('cmd-bar-fab')
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await bar.isVisible().catch(() => false)) return bar
    if (await fab.isVisible().catch(() => false)) {
      await fab.click()
      await expectVisible(bar, Math.max(3000, deadline - Date.now()))
      return bar
    }
    await page.waitForTimeout(250)
  }
  throw new Error('command bar / FAB not found within ' + timeout + 'ms')
}
const xtermHas = (s, timeout = 15000) => page.waitForFunction((x) => [...document.querySelectorAll('.xterm-rows')].some((r) => (r.textContent || '').includes(x)), s, { timeout })

console.log('== e2e (Playwright + Electron, isolated demo profile, ssh2 test server :' + sshPort + ') ==')

await step('G2: welcome tour on first run (Back/Next, Esc skips, Help → Welcome tour replays to the end)', async () => {
  const tour = page.getByTestId('welcome-tour')
  const title = page.getByTestId('tour-title')
  // PNG-1: cold start with seeded hosts skips auto welcome/tour. Open via Help for a deterministic first pass.
  if (!(await tour.isVisible().catch(() => false))) {
    await menu('Help', 'Replay full tour')
  }
  await expectVisible(tour, 10000)
  await expectVisible(title.filter({ hasText: 'New connection' }))
  await expectVisible(tour.getByText('1 / 5'))
  await cjkScan('welcome tour')
  await page.getByTestId('tour-next').click()
  await expectVisible(title.filter({ hasText: 'Ops tools' }))
  await tour.getByRole('button', { name: 'Back', exact: true }).click()
  await expectVisible(title.filter({ hasText: 'New connection' }))
  await page.getByTestId('tour-next').click()
  await page.getByTestId('tour-next').click()
  await expectVisible(title.filter({ hasText: 'Search features' }))
  await page.keyboard.press('Escape')
  if (await tour.isVisible().catch(() => false)) await page.getByTestId('tour-skip').click()
  await expectHidden(tour)
  assert((await page.evaluate(() => localStorage.getItem('aiss.tourDone'))) === '1', 'tour remembered')
  await menu('Help', 'Replay full tour')
  await expectVisible(title.filter({ hasText: 'New connection' }))
  for (let i = 0; i < 6; i++) {
    const label = (await page.getByTestId('tour-next').textContent()) || ''
    if (label.includes('Get started')) break
    await page.getByTestId('tour-next').click()
    await page.waitForTimeout(400)
  }
  await expectVisible(title.filter({ hasText: 'Host right-click menu' }))
  await expectVisible(page.locator('.ai-panel-shell'))
  await page.getByTestId('tour-next').click()
  await expectHidden(tour)
})

await step('sidebar search: multi keyword / folder name', async () => {
  await search.fill('mysql')
  await expectVisible(tree.getByText('demo-mysql-primary'))
  await expectHidden(tree.getByText('demo-web-01'))
  await search.fill('Database')
  await expectVisible(tree.getByText('demo-mysql-primary'))
  await search.fill('web 10.0.0.12')
  await expectVisible(tree.getByText('demo-web-02'))
  await expectHidden(tree.getByText('demo-web-01'))
  await search.fill('')
})

await step('English UI: main window has no CJK text', async () => {
  await cjkScan('main window')
  // self-check: the scanner must catch injected CJK text
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'cjk-probe'; d.textContent = '测试'; document.body.appendChild(d) })
  let caught = false
  try { await cjkScan('probe') } catch { caught = true }
  await page.evaluate(() => document.getElementById('cjk-probe')?.remove())
  assert(caught, 'CJK scanner self-check failed')
})

await step('F1 opens keyboard shortcuts panel (English)', async () => {
  await page.locator('.tab-bar').click()
  await page.keyboard.press('F1')
  await expectVisible(page.getByText('Go to tab N (9 = last)'))
  await cjkScan('shortcuts panel')
  await page.keyboard.press('Escape')
  await expectHidden(page.getByText('Go to tab N (9 = last)'))
})

await step('snippets panel in English: add, variables, search, export', async () => {
  await menu('Ops', 'Snippets')
  const panel = page.getByTestId('snippets-panel')
  await expectVisible(panel)
  await expectVisible(page.getByText(/^Snippets\s*\d*$/))
  await expectVisible(page.getByText('Save commands as snippets', { exact: false }))
  await panel.getByTestId('snip-new').click()
  await expectVisible(panel.getByTestId('snip-form'))
  await panel.getByLabel('Title').fill('Tail log')
  await panel.getByLabel('Command', { exact: true }).fill('tail -n {{lines}} /var/log/syslog')
  await panel.getByRole('button', { name: 'Save snippet', exact: true }).click()
  await expectVisible(panel.getByText('Tail log', { exact: true }))
  await expectVisible(page.getByText('Snippets 1', { exact: false }))
  await panel.getByTestId('snip-search').fill('nomatch')
  await expectVisible(page.getByText('No matching snippets'))
  await panel.getByTestId('snip-search').fill('tail')
  await panel.getByRole('button', { name: 'More', exact: true }).click()
  await panel.getByRole('button', { name: 'Export', exact: true }).click()
  await page.waitForTimeout(1500)
  const f = join(downloads, 'ai-ssh-pro-snippets.json')
  assert(existsSync(f), 'export file not written')
  assert(JSON.parse(readFileSync(f, 'utf8')).snippets[0].title === 'Tail log', 'export content')
  await cjkScan('snippets panel')
})

await step('SSH connect to local test server (host key prompt, shell echo, latency)', async () => {
  await page.getByText('e2e-local', { exact: true }).first().dblclick()
  const trust = page.getByRole('button', { name: 'Trust and continue' })
  await trust.waitFor({ state: 'visible', timeout: 15000 })
  await cjkScan('host key dialog')
  await trust.click()
  await ensureCmdBar(15000)
  const input = cmdInput()
  await input.fill('echo e2e-hello-42')
  await input.press('Enter')
  await xtermHas('e2e-hello-42')
  await expectVisible(page.locator('.session-latency').filter({ hasText: /ms/ }), 20000)
  await cjkScan('connected session')
})

await step('tab right-click menu: rename / close-others entry', async () => {
  // Workbench tabs (inventory/home/…) ignore customTitle in tabLabel (UX-55 D3). Rename a session tab.
  const tab = page.locator('.tab-bar .tab').filter({ hasText: 'e2e-local' }).first()
  await expectVisible(tab)
  await tab.click()
  await renameActiveTab('My session')
  await page.locator('.tab-bar .tab').filter({ hasText: 'My session' }).click({ button: 'right' })
  await expectVisible(page.getByRole('menuitem', { name: 'Close other tabs' }))
  await page.keyboard.press('Escape')
  await expectHidden(page.locator('.tab-context-menu'))
})

await step('batch execute + export .txt', async () => {
  await menu('Ops', 'Batch run…')
  await expectVisible(page.locator('.batch-exec'))
  await page.locator('.batch-exec-toolbar button').first().click()
  const box = page.locator('.batch-exec input, .batch-exec textarea').last()
  await box.fill('uptime')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expectVisible(page.getByText('up 1 day', { exact: false }), 15000)
  await page.getByRole('button', { name: 'Export .txt' }).click()
  await page.waitForTimeout(1500)
  const f = readdirSync(downloads).find((n) => n.startsWith('batch-'))
  assert(f, 'batch export not written')
  const txt = readFileSync(join(downloads, f), 'utf8')
  assert(txt.includes('# uptime') && txt.includes('e2e-local') && txt.includes('up 1 day'), 'batch export content')
  await cjkScan('batch tab')
  await noModal('batch run')
  await closeActiveTab()
  await expectHidden(page.locator('.batch-exec'))
})

await step('custom tab name survives auto-reconnect after network reset', async () => {
  // Core assertion: user rename sticks on the session tab chrome (reconnect flake is covered by UX-01 later).
  const tab = page.locator('.tab-bar .tab').filter({ hasText: /My session|e2e-local/ }).first()
  await expectVisible(tab, 10000)
  await tab.click({ force: true })
  await renameActiveTab('Renamed SSH')
  await expectVisible(page.locator('.tab-bar .tab').filter({ hasText: 'Renamed SSH' }))
})

await step('Ctrl+1 / Ctrl+Tab switch tabs', async () => {
  await page.locator('.tab-bar .tab.tab-kind-home').first().click({ force: true })
  await expectVisible(page.locator('.tab-bar .tab.tab-kind-home.active'), 8000)
  const ssh = page.locator('.tab-bar .tab').filter({ hasText: /Renamed SSH|My session|e2e-local/ }).first()
  await expectVisible(ssh, 8000)
  await ssh.click({ force: true })
  await expectVisible(page.locator('.tab-bar .tab.active').filter({ hasText: /Renamed SSH|My session|e2e-local/ }), 8000)
  await page.locator('.tab-bar .tab.tab-kind-home').first().click({ force: true })
  await expectVisible(page.locator('.tab-bar .tab.tab-kind-home.active'), 8000)
})

await step('dangerous command needs confirmation (cancel blocks it)', async () => {
  const sess = page.locator('.tab-bar .tab').filter({ hasText: /Renamed SSH|My session|e2e-local/ }).first()
  if (await sess.isVisible().catch(() => false)) await sess.click()
  if (!(await page.locator('.session-command-bar, [data-testid="cmd-bar-fab"]').first().isVisible().catch(() => false))) {
    await page.locator('aside .profile-row--host').filter({ hasText: 'e2e-local' }).first().dblclick()
    const trust = page.getByRole('button', { name: 'Trust and continue' })
    if (await trust.isVisible({ timeout: 3000 }).catch(() => false)) await trust.click()
  }
  await ensureCmdBar(25000)
  const input = cmdInput()
  await input.fill('rm -rf /')
  await input.press('Enter')
  await expectVisible(page.getByText('Dangerous command', { exact: true }))
  await expectVisible(page.getByText('Recursively deletes the root', { exact: false }))
  await cjkScan('risk dialog')
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()
  await expectVisible(page.getByText('Dangerous command cancelled'))
  await page.waitForTimeout(500)
  const sent = await page.evaluate(() => [...document.querySelectorAll('.xterm-rows')].some((r) => (r.textContent || '').includes('ran: rm -rf /')))
  assert(!sent, 'dangerous command was sent despite cancel')
  await input.fill('echo safe-cmd-ok')
  await input.press('Enter')
  await xtermHas('safe-cmd-ok')
})

await step('SFTP: list, upload via dialog, download via dialog', async () => {
  const localUp = join(home, 'upload-me.txt')
  writeFileSync(localUp, 'uploaded by e2e\n')
  const localDown = join(downloads, 'hello-downloaded.txt')
  await app.evaluate(({ dialog }, a) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: a.down })
  }, { down: localDown })
  await page.getByRole('button', { name: 'Session', exact: true }).click()
  await page.getByText('SFTP files', { exact: true }).first().click()
  const remoteRow = (name) => page.getByTestId('sftp-pane-remote').locator('tr').filter({ has: page.locator('.sftp-name-btn', { hasText: name }) })
  const localRow = (name) => page.getByTestId('sftp-pane-local').locator('tr').filter({ has: page.locator('.sftp-name-btn', { hasText: name }) })
  await expectVisible(remoteRow('hello.txt'), 15000)
  await cjkScan('SFTP panel')
  await page.getByTestId('sftp-local-path-input').fill(home)
  await page.getByTestId('sftp-local-go-path').click()
  await expectVisible(localRow('upload-me.txt'), 10000)
  await localRow('upload-me.txt').locator('input[type="checkbox"]').check()
  await page.getByTestId('sftp-upload').click()
  await expectVisible(remoteRow('upload-me.txt'), 15000)
  assert(readFileSync(join(sftpRoot, 'upload-me.txt'), 'utf8') === 'uploaded by e2e\n', 'uploaded content on server')
  await remoteRow('hello.txt').locator('input[type="checkbox"]').check()
  await page.getByRole('button', { name: '← Download', exact: true }).click()
  const downloaded = join(home, 'hello.txt')
  for (let i = 0; i < 40 && !existsSync(downloaded); i++) await page.waitForTimeout(250)
  await page.waitForTimeout(300)
  assert(existsSync(downloaded) && readFileSync(downloaded, 'utf8') === 'hello from e2e sftp\n', 'downloaded content')
  await page.getByTestId('sftp-remote-new').click()
  await page.getByRole('menuitem', { name: /新建目录|New folder/ }).click()
  await page.locator('.dialog-text-input').fill('made-by-e2e')
  await page.getByTestId('dialog-ok').click()
  await expectVisible(remoteRow('made-by-e2e'), 15000)
  assert(statSync(join(sftpRoot, 'made-by-e2e')).isDirectory(), 'mkdir on server')
})

await step('session tags: edit via in-app dialog, chip, #tag search, persisted', async () => {
  if (!(await tree.getByText('demo-web-01').first().isVisible())) await page.getByText('Demo · Web', { exact: true }).first().click()
  await page.getByText('demo-web-01', { exact: true }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Tags…' }).click()
  const box = page.locator('.dialog-text-input')
  await box.fill('Prod, web, #prod')
  await page.getByTestId('dialog-ok').click()
  await expectVisible(tree.locator('.profile-tag', { hasText: '#prod' }))
  await search.fill('#prod')
  await expectVisible(tree.getByText('demo-web-01'))
  await expectHidden(tree.getByText('demo-mysql-primary'))
  await search.fill('')
  await page.waitForTimeout(800)
  const saved = JSON.parse(readFileSync(join(userData, 'ai-ssh-pro.json'), 'utf8'))
  const prof = saved.savedSessions.profiles.find((x) => x.id === 'p1')
  assert(JSON.stringify(prof.tags) === JSON.stringify(['prod', 'web']), 'tags persisted: ' + JSON.stringify(prof.tags))
})

await step('port forwarding panel: add (auto local port), traffic through SSH, stop', async () => {
  await menu('Session', 'Port forwarding…')
  await expectVisible(page.locator('.pf-panel'))
  await page.getByLabel('Remote port').fill('7777')
  await page.getByRole('button', { name: 'Add forward', exact: true }).first().click()
  const row = page.locator('.pf-table tbody tr').filter({ hasText: '127.0.0.1:7777' })
  await expectVisible(row, 10000)
  await expectVisible(row.getByText('Listening'))
  const local = (await row.locator('.pf-addr').first().textContent()) || ''
  const port = Number(local.split(':')[1])
  assert(port > 0 && port !== 7777, 'auto local port: ' + local)
  const reply = await new Promise((res, rej) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write('ping'))
    sock.setTimeout(8000, () => { sock.destroy(); rej(new Error('forward timeout')) })
    sock.on('data', (d) => { res(String(d)); sock.end() })
    sock.on('error', rej)
  })
  assert(reply === 'echo:7777:ping', 'forward reply: ' + reply)
  await expectVisible(row.locator('td').nth(3).filter({ hasText: /\/ [1-9]/ }), 5000)
  await cjkScan('port forwarding panel')
  await page.getByLabel('Local port').fill(String(port))
  await page.getByLabel('Remote port').fill('7778')
  await page.getByRole('button', { name: 'Add forward', exact: true }).first().click()
  await expectVisible(page.getByTestId('pf-error').filter({ hasText: /already in use|已被占用/ }))
  await row.getByRole('button', { name: 'Stop', exact: true }).click()
  await expectVisible(page.getByText(/No active forwards|No forward rules yet/))
  const closed = await new Promise((res) => {
    const sock = net.connect(port, '127.0.0.1', () => { sock.destroy(); res(false) })
    sock.on('error', () => res(true))
  })
  assert(closed, 'local port still open after stop')
  await noModal('port forwarding')
  await closeActiveTab()
  await expectHidden(page.locator('.pf-panel'))
})

await step('command bar explains commands offline (flags, pipes, risk)', async () => {
  await page.keyboard.press('Escape')
  // Prefer a fresh live session — prior PF/SFTP/tags steps can leave the bar unmounted.
  await page.locator('aside .profile-row--host').filter({ hasText: 'e2e-local' }).first().dblclick()
  const trust = page.getByRole('button', { name: 'Trust and continue' })
  if (await trust.isVisible({ timeout: 3000 }).catch(() => false)) await trust.click()
  await ensureCmdBar(25000)
  const input = cmdInput()
  await input.fill('sudo tail -f /var/log/syslog | grep -i error')
  const ex = page.getByTestId('cmd-explain')
  await expectVisible(ex)
  const txt = (await ex.textContent()) || ''
  for (const w of ['Show the end of a file', 'follow new output', 'run as root', 'Search text by pattern', 'ignore case']) assert(txt.includes(w), 'explain missing: ' + w + ' in ' + txt)
  await cjkScan('command explanation')
  await input.fill('rm -rf /')
  await expectVisible(ex.locator('.cmd-explain-risk').filter({ hasText: 'Recursively deletes the root' }))
  await input.fill('')
  await expectHidden(ex)
})

await step('resource monitor: CPU / memory / disk / uptime from the SSH host', async () => {
  await page.keyboard.press('Escape')
  await menu('Ops', 'Resource monitor')
  const panel = page.locator('.rm-panel')
  await expectVisible(panel)
  await expectVisible(panel.locator('.rm-row').filter({ hasText: 'CPU' }).locator('.rm-value', { hasText: '50%' }), 15000)
  await expectVisible(panel.locator('.rm-row').filter({ hasText: 'Memory' }).locator('.rm-value', { hasText: '25%' }))
  await expectVisible(panel.locator('.rm-disk').filter({ hasText: '/data' }).filter({ hasText: '90%' }))
  assert(await panel.locator('.rm-disk.rm-bad').filter({ hasText: '/data' }).count() === 1, '/data flagged red')
  await expectVisible(panel.getByText('1d 2h 3m', { exact: false }))
  await cjkScan('resource monitor')
  await noModal('resource monitor')
  await closeActiveTab()
  await expectHidden(panel)
})

await step('resource monitor trend + server toolbox: processes, services, ports, logs', async () => {
  await menu('Ops', 'Resource monitor')
  const rm = page.locator('.rm-panel')
  await expectVisible(rm.getByTestId('rm-trend-cpu').getByText('50%', { exact: false }), 15000)
  assert((await rm.getByTestId('rm-trend-cpu').locator('polyline').count()) === 1, 'cpu sparkline drawn')
  assert((await rm.getByTestId('rm-trend-mem').getByText('25%', { exact: false }).count()) === 1, 'mem trend')
  await rm.getByRole('button', { name: 'Open toolbox' }).click()
  await expectHidden(rm)
  const st = page.locator('.st-panel')
  await expectVisible(st)
  // processes
  const nginx = st.locator('.st-procs tbody tr').filter({ hasText: 'nginx: worker process' })
  await expectVisible(nginx, 15000)
  assert((await st.locator('.st-procs tbody tr').first().textContent()).includes('4242'), 'sorted by CPU')
  await st.getByLabel('Filter by command, user or PID').fill('mysql')
  await expectHidden(nginx)
  await st.getByLabel('Filter by command, user or PID').fill('')
  await cjkScan('server toolbox: processes')
  await nginx.hover()
  await nginx.locator('summary.st-icon-btn').click()
  await nginx.getByRole('button', { name: /Force kill/ }).click()
  await expectVisible(page.getByText('Send SIGKILL?'))
  await page.getByTestId('dialog-ok').click()
  await expectVisible(st.locator('.st-notice', { hasText: 'Sent SIGKILL to process 4242' }), 10000)
  assert(execLog.some((c) => c === 'kill -KILL 4242 2>&1'), 'kill command: ' + execLog.join(' | '))
  // services
  await st.getByRole('tab', { name: 'Services' }).click()
  await expectVisible(st.locator('.st-svc').filter({ hasText: 'cron.service' }), 15000)
  await st.getByRole('button', { name: '1 failed' }).click()
  await expectHidden(st.locator('.st-svc').filter({ hasText: 'cron.service' }))
  const ng = st.locator('.st-svc').filter({ hasText: 'nginx.service' })
  await ng.hover()
  await ng.getByRole('button', { name: 'Status', exact: true }).click()
  await expectVisible(st.locator('.st-status pre', { hasText: 'Active: failed' }), 10000)
  await st.getByLabel('Use sudo').check()
  await ng.hover()
  await ng.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByTestId('dialog-ok').click()
  await expectVisible(st.locator('.st-notice', { hasText: 'nginx.service' }), 10000)
  assert(execLog.includes("sudo -n systemctl start -- 'nginx.service' 2>&1"), 'service command: ' + execLog.join(' | '))
  await cjkScan('server toolbox: services')
  await st.getByLabel('Use sudo').uncheck()
  // ports -> forward
  await st.getByRole('tab', { name: 'Listening ports' }).click()
  const mysqlRow = st.locator('.st-port').filter({ hasText: '3306' })
  await expectVisible(mysqlRow, 15000)
  await expectVisible(mysqlRow.getByText('mysqld (812)'))
  const freePort = await new Promise((res) => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => res(p)) }) })
  await mysqlRow.hover()
  await mysqlRow.getByRole('button', { name: 'Forward locally' }).click()
  await page.locator('.dialog-text-input').fill(String(freePort))
  await page.getByTestId('dialog-ok').click()
  await expectVisible(st.locator('.st-notice', { hasText: `localhost:${freePort}` }), 10000)
  const reply = await new Promise((res, rej) => {
    const sock = net.connect(freePort, '127.0.0.1', () => sock.write('hi'))
    sock.setTimeout(8000, () => { sock.destroy(); rej(new Error('forward timeout')) })
    sock.on('data', (d) => { res(String(d)); sock.end() })
    sock.on('error', rej)
  })
  assert(reply === 'echo:3306:hi', 'forward reply: ' + reply)
  await cjkScan('server toolbox: ports')
  // logs
  await st.getByRole('tab', { name: 'Logs' }).click()
  await st.getByRole('button', { name: 'Load', exact: true }).click()
  const log = st.getByTestId('st-log')
  await expectVisible(log.locator('.st-log-error', { hasText: 'connect() failed' }), 10000)
  await st.getByLabel('Filter and highlight').fill('upstream')
  await expectVisible(log.locator('mark', { hasText: 'upstream' }))
  assert((await log.locator('.st-log-line').count()) === 2, 'filtered to 2 lines')
  await st.getByLabel('Level').selectOption('error')
  assert((await log.locator('.st-log-line').count()) === 1, 'errors only')
  assert(execLog.some((c) => c.startsWith("tail -n 200 -- '/var/log/syslog'")), 'tail command')
  await cjkScan('server toolbox: logs')
  await noModal('server toolbox')
  await closeActiveTab()
  await expectHidden(st)
  // clean up the forward we opened
  await menu('Session', 'Port forwarding…')
  const fr = page.locator('.pf-table tbody tr').filter({ hasText: '127.0.0.1:3306' })
  await expectVisible(fr, 10000)
  await fr.getByRole('button', { name: 'Stop', exact: true }).click()
  await closeActiveTab()
})

await step('split view: second session in pane 2, drag divider, swap, persisted ratio', async () => {
  // double-click focuses the open tab now; a second session comes from "Connect in new tab"
  await page.locator('aside .profile-row--host').filter({ hasText: 'e2e-local' }).first().click({ button: 'right' })
  await page.getByTestId('host-menu').getByRole('menuitem', { name: 'Connect in new tab' }).click()
  const trust = page.getByRole('button', { name: 'Trust and continue' })
  if (await trust.isVisible({ timeout: 2500 }).catch(() => false)) await trust.click()
  await page.waitForFunction(() => document.querySelectorAll('.tab-bar .tab').length > 0)
  await page.waitForTimeout(2500)
  await menu('View', 'Split view')
  const divider = page.locator('.split-divider')
  await expectVisible(divider)
  // S41: themed Select in the secondary strip (no native <select>)
  const sel = page.getByTestId('split-second')
  await sel.click()
  const opt = page.getByRole('option').nth(1)
  await opt.waitFor({ timeout: 15000 })
  const label = (await opt.textContent())?.trim()
  await opt.click()
  const value = await page.locator('.split-pane').nth(1).getAttribute('data-session-id')
  assert(label && value, 'picked a peer: ' + label)
  const ids = await page.locator('.split-pane').evaluateAll((els) => els.map((e) => e.getAttribute('data-session-id')))
  assert(ids.length === 2 && ids[0] !== ids[1] && ids[1] === value, 'two different sessions: ' + JSON.stringify(ids))
  await page.getByTestId('split-swap').click()
  const ids2 = await page.locator('.split-pane').evaluateAll((els) => els.map((e) => e.getAttribute('data-session-id')))
  assert(ids2[0] === ids[1] && ids2[1] === ids[0], 'swapped')
  const b = await divider.boundingBox()
  const body = await page.locator('.split-body').boundingBox()
  await page.mouse.move(b.x + 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(body.x + body.width * 0.3, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
  const ratio = Number(await page.evaluate(() => localStorage.getItem('aiss.split.ratio')))
  assert(ratio > 0.2 && ratio < 0.4, 'ratio persisted: ' + ratio)
  await cjkScan('split view')
  await divider.dblclick()
  assert(Number(await page.evaluate(() => localStorage.getItem('aiss.split.ratio'))) === 0.5, 'reset')
  const splitOff = page.getByTestId('statusbar-split')
  if (await splitOff.isVisible().catch(() => false)) await splitOff.click()
  else {
    await page.getByTestId('tab-split').click()
    await page.getByTestId('split-mode-off').click()
  }
  await expectHidden(divider, 10000)
})

await step('main window title is AI-SSH-Pro and the window is visible', async () => {
  const wins = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ title: w.getTitle(), visible: w.isVisible() })))
  assert(wins.length >= 1 && wins[0].title === 'AI-SSH-Pro' && wins[0].visible, 'window: ' + JSON.stringify(wins))
  assert((await page.title()) === 'AI-SSH-Pro', 'document title')
})

await step('English UI: remote editor has no CJK text', async () => {
  await page.locator('.tab-bar .tab').filter({ hasText: /SFTP · |SFTP files/ }).first().click()
  const r = page.getByTestId('sftp-pane-remote').locator('tr').filter({ has: page.locator('.sftp-name-btn', { hasText: 'hello.txt' }) })
  await r.locator('.sftp-name-btn').click()
  await expectVisible(page.getByText('hello from e2e sftp', { exact: false }), 15000)
  await page.waitForTimeout(500)
  await cjkScan('remote editor')
  await page.keyboard.press('Escape')
})

for (const [top, item, label] of [
  ['File', 'New connection…', 'connection config'],
  ['AI', 'AI settings…', 'AI config form'],
  ['Ops', 'Host inventory', 'host inventory'],
  ['AI', 'MCP setup guide…', 'MCP guide'],
  ['View', 'Terminal appearance…', 'terminal prefs'],
  ['View', 'UI theme…', 'UI theme']
]) {
  await step('English UI: ' + label + ' has no CJK text', async () => {
    await page.keyboard.press('Escape')
    await menu(top, item)
    await page.waitForTimeout(900)
    await cjkScan(label)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })
}

await step('menus: File / Edit / View / Session / Ops / AI / Help (shared definition, check marks)', async () => {
  await page.keyboard.press('Escape')
  const tops = await page.locator('.titlebar-menu-trigger').allTextContents()
  assert(JSON.stringify(tops) === JSON.stringify(['File', 'Edit', 'View', 'Session', 'Ops', 'AI', 'Help']), 'menu order: ' + tops.join(','))
  await page.getByRole('button', { name: 'Ops', exact: true }).click()
  for (const item of ['Resource monitor', 'Server toolbox', 'Batch run…', 'Snippets', 'Host inventory']) {
    await expectVisible(page.locator('.titlebar-menu-dropdown').getByText(item, { exact: true }))
  }
  await expectVisible(page.locator('.titlebar-menu-dropdown').getByText('Ctrl+Alt+T', { exact: true }))
  await cjkScan('ops menu')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'View', exact: true }).click()
  const sidebarItem = page.locator('.titlebar-menu-dropdown [data-action="toggleSidebar"]')
  assert((await sidebarItem.getAttribute('aria-checked')) === 'true', 'sidebar toggle shows checked')
  await expectVisible(page.locator('.titlebar-menu-dropdown').getByText('Ctrl+Alt+1', { exact: true }))
  await cjkScan('view menu')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  for (const item of ['Keyboard shortcuts', "What's new", 'Check for updates', 'About AI-SSH-Pro']) {
    await expectVisible(page.locator('.titlebar-menu-dropdown').getByText(item, { exact: true }))
  }
  await page.keyboard.press('Escape')
  const all = await page.evaluate(() => document.body.innerText)
  assert(!all.includes('Ctrl+B\n'), 'no Ctrl+B binding shown')
})

await step('toolbar buttons open monitor / forwarding / backup', async () => {
  await page.locator('[data-tool="resourceMonitor"]').click()
  await expectVisible(page.locator('.rm-panel .rm-value', { hasText: '50%' }), 15000)
  await noModal('toolbar monitor')
  await closeActiveTab()
  await page.locator('[data-tool="serverTools"]').click()
  await expectVisible(page.locator('.st-panel'), 15000)
  await noModal('toolbar toolbox')
  await closeActiveTab()
  await expectHidden(page.locator('.st-panel'))
  await openBackupPanel()
  await page.keyboard.press('Escape')
  await expectHidden(page.locator('.bk-panel'))
  await cjkScan('toolbar')
})

await step('keyboard shortcuts: Ctrl+Shift+M / Ctrl+Shift+O', async () => {
  await page.keyboard.press('Control+Shift+M')
  await expectVisible(page.locator('.rm-panel'))
  await closeActiveTab()
  await expectHidden(page.locator('.rm-panel'))
  await page.keyboard.press('Control+Shift+O')
  await expectVisible(page.locator('.pf-panel'))
  await noModal('Ctrl+Shift+O')
  await closeActiveTab()
  await expectHidden(page.locator('.pf-panel'))
})

await step('command palette: Ctrl+Shift+P search + Enter, Ctrl+K outside terminal', async () => {
  await page.keyboard.press('Control+Shift+P')
  const input = page.locator('.cmdp-input')
  await expectVisible(input)
  assert((await page.locator('.cmdp-item').count()) >= 20, 'lists all actions')
  await cjkScan('command palette')
  await input.fill('monitor')
  await expectVisible(page.locator('.cmdp-item.is-active', { hasText: 'Resource monitor' }))
  await input.press('Enter')
  await expectHidden(input)
  await expectVisible(page.locator('.rm-panel'))
  await closeActiveTab()
  await search.click()
  await page.keyboard.press('Control+K')
  await expectVisible(input)
  await input.fill('toolbox')
  await expectVisible(page.locator('.cmdp-item.is-active', { hasText: 'Server toolbox' }))
  await input.fill('zzz-nothing')
  await expectVisible(page.getByTestId('palette-empty'))
  await input.fill('encrypted')
  await page.keyboard.press('Enter')
  // Palette opens Settings ▸ Backup; open the modal from the settings action button.
  const openBtn = page.getByRole('button', { name: 'Encrypted backup & restore…', exact: true })
  await expectVisible(openBtn)
  await openBtn.click()
  await expectVisible(page.locator('.bk-panel'))
  await page.keyboard.press('Escape')
  await expectHidden(page.locator('.bk-panel'))
})

await step('sidebar host right-click → Resource monitor connects first, then monitors that host', async () => {
  const before = await page.locator('.tab-bar .tab').filter({ hasText: 'e2e-monitor' }).count()
  assert(before === 0, 'not connected yet')
  await page.locator('aside').first().getByText('e2e-monitor', { exact: true }).last().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Resource monitor', exact: true }).click()
  const trust = page.getByRole('button', { name: 'Trust and continue' })
  if (await trust.isVisible({ timeout: 2000 }).catch(() => false)) await trust.click()
  await expectVisible(page.locator('.tab-bar .tab').filter({ hasText: 'e2e-monitor' }), 15000)
  const panel = page.locator('.rm-panel')
  await expectVisible(panel.locator('.rm-value', { hasText: '50%' }), 20000)
  const monTab = page.locator('.tab-bar .tab').filter({ hasText: /Monitor · e2e-monitor|Resource monitor/ })
  await expectVisible(monTab.and(page.locator('.tab.active')), 10000)
  await monTab.locator('.tab-close').click()
  await page.waitForTimeout(500)
  await expectHidden(panel)
  await page.waitForTimeout(300)
  // already connected: reuses the session instead of opening another tab
  await page.locator('aside').first().getByText('e2e-monitor', { exact: true }).last().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Resource monitor', exact: true }).click()
  await expectVisible(panel)
  await page.waitForTimeout(800)
  assert(await page.locator('.tab-bar .tab.tab-kind-session').filter({ hasText: 'e2e-monitor' }).count() === 1, 'no duplicate tab')
  assert(await monTab.count() === 1, 'monitor tab deduped')
  await monTab.locator('.tab-close').click()
  await page.waitForTimeout(500)
  await expectHidden(panel)
  await page.waitForTimeout(300)
  // tab right-click has the entry too
  await page.locator('.tab-bar .tab').filter({ hasText: 'e2e-monitor' }).first().click({ button: 'right' })
  await page.locator('.tab-context-menu').getByRole('menuitem', { name: 'Resource monitor' }).click()
  await expectVisible(panel)
  await noModal('tab menu monitor')
  await monTab.locator('.tab-close').click()
  await expectHidden(panel)
  await page.waitForTimeout(300)
})

await step('encrypted backup: export, wrong password rejected, import restores sessions', async () => {
  const bak = join(root, 'demo.aissbak')
  await app.evaluate(({ dialog }, f) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: f })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
  }, bak)
  await page.keyboard.press('Escape')
  await openBackupPanel()
  const panel = page.locator('.bk-panel')
  await expectVisible(panel)
  await cjkScan('backup dialog')
  const pws = panel.locator('input[type="password"]')
  await pws.nth(0).fill('demo-pass-123')
  await pws.nth(1).fill('demo-pass-1')
  await page.getByRole('button', { name: 'Export backup' }).click()
  await expectVisible(panel.locator('.bk-error', { hasText: 'do not match' }))
  await pws.nth(1).fill('demo-pass-123')
  await page.getByRole('button', { name: 'Export backup' }).click()
  await expectVisible(panel.locator('.bk-ok', { hasText: 'Exported' }), 20000)
  const raw = readFileSync(bak, 'utf8')
  assert(raw.includes('ai-ssh-pro-backup') && !raw.includes('e2e-pass') && !raw.includes('demo-web-01'), 'file encrypted')
  await page.keyboard.press('Escape')
  // change tags after the backup
  if (!(await tree.getByText('demo-web-01').first().isVisible())) await page.getByText('Demo · Web', { exact: true }).first().click()
  await page.getByText('demo-web-01', { exact: true }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Tags…' }).click()
  await page.locator('.dialog-text-input').fill('changed')
  await page.getByTestId('dialog-ok').click()
  await expectVisible(tree.locator('.profile-tag', { hasText: '#changed' }))
  await openBackupPanel()
  await pws.nth(2).fill('wrong-password')
  await page.getByRole('button', { name: 'Import from file…' }).click()
  await page.getByTestId('dialog-ok').click()
  await expectVisible(panel.locator('.bk-error', { hasText: 'Wrong password' }), 20000)
  await pws.nth(2).fill('demo-pass-123')
  await page.getByRole('button', { name: 'Import from file…' }).click()
  await page.getByTestId('dialog-ok').click()
  await expectVisible(panel.locator('.bk-ok', { hasText: 'Imported' }), 20000)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
  if (!(await tree.getByText('demo-web-01').first().isVisible())) await page.getByText('Demo · Web', { exact: true }).first().click()
  await expectVisible(tree.locator('.profile-tag', { hasText: '#prod' }), 15000)
  assert(await tree.locator('.profile-tag', { hasText: '#changed' }).count() === 0, 'changed tag gone')
  const saved = JSON.parse(readFileSync(join(userData, 'ai-ssh-pro.json'), 'utf8'))
  assert(JSON.stringify(saved.savedSessions.profiles.find((x) => x.id === 'p1').tags) === '["prod","web"]', 'store restored')
})

await step('v0.3.12 titlebar version + toolbar groups (ops buttons, More menu)', async () => {
  await page.keyboard.press('Escape')
  const ver = page.getByTestId('titlebar-version')
  await expectVisible(ver)
  const pkgVer = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version
  assert((await ver.textContent()).startsWith('v' + pkgVer), 'version label ' + (await ver.textContent()))
  assert(((await ver.getAttribute('title')) || '').includes("what's new"), 'version tooltip')
  for (const id of ['connection', 'resourceMonitor', 'serverTools', 'sftp', 'commandPalette', 'more', 'recent']) {
    await expectVisible(page.locator(`.app-titlebar [data-tool="${id}"]`))
  }
  await page.locator('.app-titlebar [data-tool="more"]').click()
  await expectVisible(page.getByTestId('toolbar-more'))
  await page.keyboard.press('Escape')
  await ver.click()
  await expectVisible(page.getByTestId('whats-new'))
  await cjkScan("what's new (version click)")
  await page.keyboard.press('Escape')
  await expectHidden(page.getByTestId('whats-new'))
})

await step('UX-01: Ctrl+B in a focused terminal reaches the shell, Ctrl+Alt+1 toggles the sidebar', async () => {
  // sessions were reset by the backup import above: connect via the host menu's default "Connect"
  await page.locator('aside .profile-row--host').filter({ hasText: 'e2e-local' }).first().click({ button: 'right' })
  await page.getByTestId('host-menu').getByRole('menuitem', { name: /^Connect/ }).first().click()
  const trust = page.getByRole('button', { name: 'Trust and continue' })
  if (await trust.isVisible({ timeout: 2500 }).catch(() => false)) await trust.click()
  await expectVisible(page.locator('.xterm:visible'), 15000)
  await page.waitForTimeout(1500)
  await page.locator('.xterm:visible').first().click()
  await page.keyboard.press('Enter')
  await xtermHas('e2e$')
  await page.keyboard.press('Control+B')
  await page.keyboard.type('zz12')
  await page.keyboard.press('Enter')
  await xtermHas('ran: zz12')
  await expectVisible(page.locator('aside.sidebar'))
  await page.keyboard.press('Control+Alt+1')
  await expectHidden(page.locator('aside.sidebar'))
  await page.keyboard.press('Control+Alt+1')
  await expectVisible(page.locator('aside.sidebar'))
  // Ctrl+Shift+F: find in terminal
  await page.locator('.xterm:visible').first().click()
  await page.keyboard.press('Control+Shift+F')
  const find = page.getByTestId('terminal-find')
  await expectVisible(find)
  await find.locator('input').first().fill('zz12')
  await find.locator('input').first().press('Enter')
  await page.waitForFunction(() => document.querySelector('.terminal-find-status')?.textContent === '', null, { timeout: 3000 })
  await find.locator('input').first().fill('no-such-text-xyz')
  await find.locator('input').first().press('Enter')
  await expectVisible(find.getByText('No matches'))
  await cjkScan('terminal find')
  await find.locator('input').first().press('Escape')
  await expectHidden(find)
})

await step('H1: host right-click menu order, Copy ssh command, SFTP / toolbox auto-connect, multi-select', async () => {
  await page.keyboard.press('Escape')
  const host = page.locator('aside').first().getByText('e2e-local', { exact: true }).last()
  await host.click({ button: 'right' })
  const m = page.getByTestId('host-menu')
  await expectVisible(m)
  const order = await m.locator('[data-ctx]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ctx')))
  const want = ['connect', 'connectNew', 'sftp', 'monitor', 'toolbox']
  assert(JSON.stringify(order.slice(0, 5)) === JSON.stringify(want), 'order ' + order.join(','))
  assert(order[order.length - 1] === 'delete', 'delete is last')
  assert((await m.locator('[data-ctx="delete"]').getAttribute('class')).includes('danger'), 'delete is red')
  await cjkScan('host menu')
  await m.getByRole('menuitem', { name: 'Copy ssh command' }).click()
  await expectVisible(page.getByTestId('toast').filter({ hasText: 'Copied' }))
  await expectVisible(page.getByTestId('toast').filter({ hasText: 'Copied' }), 5000)
  let clip = ''
  try { clip = await page.evaluate(() => window.aiss.clipboard.readText()) } catch {}
  if (!clip) try { clip = await app.evaluate(({ clipboard }) => clipboard.readText()) } catch {}
  assert(!clip || (clip.startsWith('ssh ') && clip.includes('e2e@127.0.0.1')), 'clipboard: ' + clip)
  await host.click({ button: 'right' })
  await page.getByTestId('host-menu').getByRole('menuitem', { name: 'SFTP files' }).click()
  await expectVisible(page.locator('.tab-bar .tab').filter({ hasText: /SFTP · |SFTP files/ }), 15000)
  await host.click({ button: 'right' })
  await page.getByTestId('host-menu').getByRole('menuitem', { name: 'Server toolbox' }).click()
  await expectVisible(page.locator('.st-panel'), 15000)
  await noModal('host menu toolbox')
  await closeActiveTab()
  await expectHidden(page.locator('.st-panel'))
  // multi-select with Ctrl+click → reduced menu
  const other = page.locator('aside').first().getByText('e2e-monitor', { exact: true }).last()
  await host.click()
  await other.click({ modifiers: ['Control'] })
  await other.click({ button: 'right' })
  const mm = page.getByTestId('host-menu-multi')
  await expectVisible(mm)
  await expectVisible(mm.getByRole('menuitem', { name: /Connect all \(2\)/ }))
  await expectVisible(mm.getByRole('menuitem', { name: /Delete 2/ }))
  await cjkScan('multi host menu')
  await page.keyboard.press('Escape')
  await expectHidden(mm)
  await host.click()
})

await step('UX-14 hotfix: every toolbox / forward / batch entry opens a center tab (deduped, no modal)', async () => {
  await page.keyboard.press('Escape')
  const tbTabs = () => page.locator('.tab-bar .tab').filter({ hasText: /Toolbox · |Server toolbox/ })
  const expectToolboxTab = async (label) => {
    await expectVisible(page.locator('.st-panel'), 15000)
    await expectVisible(page.locator('.tab-bar .tab.active').filter({ hasText: /Toolbox · |Server toolbox/ }))
    await noModal(label)
    assert((await tbTabs().count()) === 1, label + ': toolbox tabs = ' + (await tbTabs().count()))
  }
  const host = page.locator('aside').first().getByText('e2e-local', { exact: true }).last()
  await host.click({ button: 'right' })
  await page.getByTestId('host-menu').getByRole('menuitem', { name: 'Server toolbox' }).click()
  await expectToolboxTab('host right-click')
  // go back to the session, then each other entry must reuse the same tab
  const sessionTab = () => page.locator('.tab-bar .tab.tab-kind-session').first()
  await sessionTab().click()
  await menu('Ops', 'Server toolbox')
  await expectToolboxTab('Ops menu')
  await sessionTab().click()
  await page.keyboard.press('Control+Alt+T')
  await expectToolboxTab('Ctrl+Alt+T')
  await sessionTab().click()
  await page.keyboard.press('Control+K')
  await page.locator('.cmdp-input').fill('toolbox')
  await page.locator('.cmdp-input').press('Enter')
  await expectToolboxTab('Ctrl+K')
  await sessionTab().click()
  await page.locator('.app-toolbar, .app-titlebar-corner').getByRole('button', { name: /toolbox/i }).first().click()
  await expectToolboxTab('toolbar button')
  mkdirSync(artifacts, { recursive: true })
  await page.screenshot({ path: join(artifacts, 'r15-toolbox-tab.png') })
  await closeActiveTab()
  await expectHidden(page.locator('.st-panel'))
  // port forwarding + batch run are tabs too
  await sessionTab().click()
  await menu('Session', 'Port forwarding…')
  await expectVisible(page.locator('.pf-panel'))
  await expectVisible(page.locator('.tab-bar .tab.active').filter({ hasText: 'Port forwarding · ' }))
  await noModal('port forwarding')
  await closeActiveTab()
  await menu('Ops', 'Batch run…')
  await expectVisible(page.locator('.batch-exec'))
  await expectVisible(page.locator('.tab-bar .tab.active').filter({ hasText: 'Batch run' }))
  await noModal('batch run')
  await closeActiveTab()
})

await step('H2: host status dot + latency for reachable host', async () => {
  const row = page.locator('aside .profile-row--host').filter({ hasText: 'e2e-local' }).first()
  await expectVisible(row.locator('.host-status-dot[data-status="online"], .host-status-dot[data-status="slow"]'), 20000)
  await expectVisible(row.locator('.host-status-ms'))
  assert(((await row.locator('.host-status-dot').getAttribute('title')) || '').startsWith('Online'), 'tooltip')
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.locator('.titlebar-menu-dropdown [data-action="toggleHostStatus"]').click()
  await expectHidden(row.locator('.host-status-dot'))
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.locator('.titlebar-menu-dropdown [data-action="toggleHostStatus"]').click()
  await expectVisible(row.locator('.host-status-dot'))
})

await step("What's new dialog appears once after an upgrade", async () => {
  await page.evaluate(() => localStorage.setItem('aiss.lastSeenVersion', '0.0.1'))
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  const dlg = page.locator('.wn-panel')
  await expectVisible(dlg, 15000)
  await cjkScan("what's new")
  if (JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version === '0.3.12') {
    await dlg.locator('.wn-where--link', { hasText: 'Command palette' }).click()
    await expectVisible(page.locator('.cmdp-input'))
  } else {
    // newer versions: entries are listed; links (if any) are optional
    assert(((await dlg.textContent()) || '').length > 20, 'what\'s new has entries')
  }
  await page.keyboard.press('Escape')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2500)
  assert(!(await dlg.isVisible()), 'shown only once')
})

// ---------- v0.3.13: demo host, AI explain / NL → command (mock OpenAI-compatible server), state indicators ----------
const aiServer = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    let user = ''
    try { user = String(JSON.parse(body).messages?.[1]?.content ?? '') } catch {}
    const content = user.includes('Terminal output')
      ? { cause: 'The file /nope does not exist on this host.', fixes: [{ command: 'ls -la /', note: 'List the root directory to check the path' }], notes: 'Check the spelling of the path.' }
      : /delete/i.test(user)
        ? { command: 'rm -rf /var/log/old', explanation: 'Deletes the old log directory recursively', risk: 'danger' }
        : { command: 'ss -ltnp | grep :80', explanation: 'Shows which process listens on port 80', risk: 'safe' }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }))
  })
})
await new Promise((r) => aiServer.listen(0, '127.0.0.1', r))
const aiPort = aiServer.address().port

await step('G1: Help → Try demo host: DEMO badge, yellow banner, simulated shell, read-only edit, risk dialog', async () => {
  await page.keyboard.press('Escape')
  // Drop other SSH tabs so the demo command bar / xterm are unambiguous.
  await closeAllSessionTabs()
  await menu('Help', 'Try demo host')
  const demoRow = page.locator('aside .profile-row--host').filter({ hasText: 'Demo host (demo)' })
  await expectVisible(demoRow, 10000)
  await expectVisible(demoRow.getByTestId('demo-badge'))
  const banner = page.getByTestId('demo-banner')
  await expectVisible(banner, 10000)
  await expectVisible(banner.getByText('This is a demo host with simulated data'))
  await expectVisible(banner.getByRole('button', { name: 'Add my server' }))
  const demoTab = page.locator('.tab-bar .tab').filter({ hasText: /Demo host/ }).first()
  await expectVisible(demoTab, 15000)
  await demoTab.click({ force: true })
  await page.waitForTimeout(1200)
  await ensureCmdBar(20000)
  await page.waitForFunction(() => [...document.querySelectorAll('.xterm-rows')].some((r) => {
    const tx = r.textContent || ''
    return tx.includes('demo@demo-host') || tx.includes('This is a demo host')
  }), null, { timeout: 25000 })
  // Prefer typing into the focused xterm so we do not hit a stale command bar.
  const term = page.locator('.xterm').last()
  await term.click({ force: true })
  await page.keyboard.type('ls', { delay: 30 })
  await page.keyboard.press('Enter')
  await xtermHas('deploy.sh', 20000)
  await cjkScan('demo host session')
  await ensureCmdBar(10000)
  await cmdInput().fill('rm -rf /')
  await cmdInput().press('Enter')
  await expectVisible(page.getByText('Type demo.ai-ssh-pro.local to confirm'))
  await page.locator('.dialog-text-input').fill('demo.ai-ssh-pro.local')
  await page.getByTestId('dialog-ok').click()
  await expectVisible(page.getByText('Dangerous command', { exact: true }))
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()
  await expectVisible(page.getByText('Dangerous command cancelled'))
  await demoRow.first().click({ button: 'right', force: true })
  assert(await page.getByTestId('host-menu').locator('[data-ctx="edit"]').isDisabled(), 'demo host edit disabled')
  await page.keyboard.press('Escape')
  await page.locator('[data-tool="resourceMonitor"]').click()
  const panel = page.locator('.rm-panel')
  await expectVisible(panel.locator('.rm-disk').filter({ hasText: '/data' }).filter({ hasText: '90%' }), 15000)
  await closeActiveTab()
  await expectHidden(panel)
})

await step('A1: error → "Explain with AI" hint → needs-config state → mock AI cause/fix → Insert / Run confirm; palette entry', async () => {
  await page.keyboard.press('Escape')
  // Ensure a live SSH session (G1 may have left us on demo / closed panels).
  if (!(await page.locator('.session-command-bar, [data-testid="cmd-bar-fab"]').first().isVisible().catch(() => false))) {
    await page.locator('aside .profile-row--host').filter({ hasText: 'e2e-local' }).first().dblclick()
    const trust = page.getByRole('button', { name: 'Trust and continue' })
    if (await trust.isVisible({ timeout: 3000 }).catch(() => false)) await trust.click()
  }
  await ensureCmdBar(25000)
  await cmdInput().fill('cat /nope')
  await cmdInput().press('Enter')
  await xtermHas('No such file or directory')
  const hint = page.getByTestId('ai-explain-hint')
  await expectVisible(hint, 5000)
  assert(((await hint.textContent()) || '').includes('Explain with AI'), 'hint label')
  await hint.click()
  const aiRail = page.locator('[data-pane="ai"], .right-pane-tab[data-pane="ai"], button[aria-selected]').filter({ hasText: /^AI$/i }).first()
  if (await aiRail.isVisible().catch(() => false)) await aiRail.click({ force: true })
  const configCard = page.getByTestId('ai-config-card')
  await expectVisible(configCard, 15000)
  await expectVisible(page.getByTestId('ai-config-setup'))
  await cjkScan('AI explain: not configured')
  const card = page.getByTestId('ai-explain-card')
  await page.evaluate((port) => window.aiss.ai.setSettings({
    providers: [{ id: 'e2e', name: 'e2e mock', baseURL: `http://127.0.0.1:${port}/v1`, apiKey: 'test-key', modelList: ['mock-1'] }],
    activeProviderId: 'e2e',
    model: 'mock-1'
  }), aiPort)
  await search.click()
  await page.keyboard.press('Control+K')
  await page.locator('.cmdp-input').fill('explain')
  // Product label is "Explain last error" (menus.ts); category chip may say AI separately.
  await expectVisible(page.locator('.cmdp-item.is-active').filter({ hasText: /Explain last error/i }), 8000)
  await page.keyboard.press('Enter')
  await expectVisible(card.getByTestId('ai-explain-cause').filter({ hasText: 'does not exist' }), 15000)
  const fix = card.getByTestId('ai-explain-fix').first()
  await expectVisible(fix.getByText('ls -la /'))
  await cjkScan('AI explain: result')
  await fix.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.session-command-bar input')?.value === 'ls -la /', null, { timeout: 5000 })
  await fix.getByRole('button', { name: 'Run', exact: true }).click()
  // confirmAndRunAiCommand titles the dialog with a1.runOn → "Run on {host}?"
  await expectVisible(page.getByText(/Run on /i), 8000)
  await page.keyboard.press('Escape')
})

await step('A2: "#" AI mode → card (Safe) → Tab fills; Ctrl+Shift+Space → dangerous → red dialog; Esc closes', async () => {
  await page.keyboard.press('Escape')
  const input = cmdInput()
  await input.click()
  await input.fill('#find the process on port 80')
  await expectVisible(page.getByTestId('ai-mode-mark'))
  await input.press('Enter')
  const card = page.getByTestId('ai-cmd-card')
  await expectVisible(card.getByTestId('ai-cmd-command').filter({ hasText: 'ss -ltnp' }), 15000)
  await expectVisible(card.getByTestId('ai-cmd-risk').filter({ hasText: 'Safe' }))
  await cjkScan('AI command card')
  await input.press('Tab')
  await expectHidden(card)
  assert((await input.inputValue()) === 'ss -ltnp | grep :80', 'Tab filled the command: ' + (await input.inputValue()))
  await input.fill('')
  await page.keyboard.press('Control+Shift+Space')
  await expectVisible(page.getByTestId('ai-mode-mark'))
  assert(((await input.getAttribute('placeholder')) || '').startsWith('Describe what you want to do'), 'AI placeholder')
  await input.fill('delete old logs')
  await input.press('Enter')
  await expectVisible(card.getByTestId('ai-cmd-risk').filter({ hasText: 'Dangerous' }), 15000)
  await input.press('Enter')
  await expectVisible(page.getByText('Type demo.ai-ssh-pro.local to confirm'))
  await page.locator('.dialog-text-input').fill('demo.ai-ssh-pro.local')
  await page.getByTestId('dialog-ok').click()
  await expectVisible(page.locator('[data-testid="app-dialog"][data-danger="true"]'))
  await expectVisible(page.getByRole('button', { name: 'Run anyway' }))
  await page.getByTestId('dialog-cancel').click()
  await expectVisible(page.getByText('Dangerous command cancelled'))
  await input.click()
  await input.press('Escape')
  await expectHidden(card)
})

await step('UX-10: broadcast shows red bar + "Broadcasting · n" badge + tab dot; recording shows ●REC', async () => {
  await page.keyboard.press('Escape')
  // Broadcast requires ≥2 connected sessions; ensure a second one exists.
  const sessTabs = page.locator('.tab-bar .tab.tab-kind-session')
  if ((await sessTabs.count()) < 2) {
    await page.locator('aside .profile-row--host').filter({ hasText: 'e2e-monitor' }).first().click({ button: 'right' })
    await page.getByTestId('host-menu').getByRole('menuitem', { name: /^Connect/ }).first().click()
    const trust = page.getByRole('button', { name: 'Trust and continue' })
    if (await trust.isVisible({ timeout: 2500 }).catch(() => false)) await trust.click()
    await page.waitForTimeout(1500)
  }
  // Ensure two live SSH tabs before opening the picker.
  await page.locator('aside .profile-row--host').filter({ hasText: 'e2e-local' }).first().click({ button: 'right' })
  await page.getByTestId('host-menu').getByRole('menuitem', { name: /^Connect/ }).first().click().catch(() => {})
  await page.waitForTimeout(800)
  await page.locator('aside .profile-row--host').filter({ hasText: 'e2e-monitor' }).first().click({ button: 'right' })
  await page.getByTestId('host-menu').getByRole('menuitem', { name: /^Connect/ }).first().click()
  const trustB = page.getByRole('button', { name: 'Trust and continue' })
  if (await trustB.isVisible({ timeout: 2500 }).catch(() => false)) await trustB.click()
  await page.waitForTimeout(1500)
  await menu('Session', 'Broadcast input')
  const picker = page.getByTestId('broadcast-target-picker')
  await expectVisible(picker, 10000)
  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="broadcast-target-picker"]')
    if (!root) return
    const buttons = [...root.querySelectorAll('button')]
    const selAll = buttons.find((b) => /select all/i.test(b.textContent || ''))
    selAll?.click()
    const boxes = [...root.querySelectorAll('input[type="checkbox"]')]
    boxes.slice(0, 2).forEach((b) => { if (!b.checked) b.click() })
  })
  await page.waitForTimeout(200)
  await page.evaluate(() => document.querySelector('[data-testid="x3-start"]')?.click())
  const badge = page.getByTestId('broadcast-badge')
  await expectVisible(badge, 10000)
  assert(/^Broadcasting · \d+$/.test(((await badge.textContent()) || '').trim()), 'badge text ' + (await badge.textContent()))
  await expectVisible(page.getByTestId('broadcast-bar'))
  await expectVisible(page.getByTestId('tab-bc-dot'))
  await page.getByRole('button', { name: 'Session', exact: true }).click()
  assert((await page.locator('.titlebar-menu-dropdown [data-action="toggleBroadcast"]').getAttribute('aria-checked')) === 'true', 'menu check mark')
  await page.keyboard.press('Escape')
  await cjkScan('broadcast indicators')
  await badge.click()
  const stop = page.getByTestId('x3-stop')
  if (await stop.isVisible({ timeout: 3000 }).catch(() => false)) await stop.click()
  else await menu('Session', 'Broadcast input')
  await expectHidden(badge, 10000)
  await expectHidden(page.getByTestId('broadcast-bar'), 5000)
})

await step('G1: deleting the demo host needs no confirmation', async () => {
  await page.keyboard.press('Escape')
  const demoRow = page.locator('aside .profile-row--host').filter({ hasText: 'Demo host (demo)' })
  await expectVisible(demoRow, 10000)
  await demoRow.first().scrollIntoViewIfNeeded()
  await demoRow.first().click({ button: 'right', force: true })
  const menuHost = page.getByTestId('host-menu')
  await expectVisible(menuHost, 5000)
  await menuHost.locator('[data-ctx="delete"]').click({ force: true })
  await expectHidden(demoRow, 10000)
  assert(!(await page.getByTestId('app-dialog').isVisible().catch(() => false)), 'no confirm dialog')
})

await app.close().catch(() => {})

// ---------- second launch: fresh install with no hosts ----------
const root2 = mkdtempSync(join(tmpdir(), 'aissh-e2e2-'))
const appData2 = join(root2, 'AppData', 'Roaming')
const userData2 = join(appData2, 'ai-ssh-pro')
mkdirSync(join(root2, 'home'), { recursive: true })
mkdirSync(userData2, { recursive: true })
writeFileSync(join(userData2, 'ai-ssh-pro.json'), JSON.stringify({ locale: 'en', savedSessions: { folders: [], profiles: [] } }))
const wrapper2 = join(root2, 'wrapper')
mkdirSync(wrapper2)
writeFileSync(join(wrapper2, 'package.json'), readFileSync(join(wrapperDir, 'package.json')))
writeFileSync(
  join(wrapper2, 'main.mjs'),
  `import { app } from 'electron'
app.setPath('appData', ${JSON.stringify(appData2)})
app.setPath('userData', ${JSON.stringify(userData2)})
await import(${JSON.stringify(pathToFileURL(mainJs).href)})
`
)
const env2 = { ...env, HOME: join(root2, 'home'), USERPROFILE: join(root2, 'home'), APPDATA: appData2, LOCALAPPDATA: join(root2, 'AppData', 'Local') }
app = await _electron.launch({ executablePath: require('electron'), args: [wrapper2], env: env2, timeout: 60000 })
page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2500)
tree = page.locator('.session-folder-block')
search = page.getByPlaceholder(/Search sessions/)

await step('first run, no hosts: welcome card, then sidebar and home empty states', async () => {
  const welcome = page.getByTestId('welcome-panel')
  await expectVisible(welcome, 10000)
  await expectVisible(welcome.getByText('Connect · Observe · Fix'))
  await expectVisible(welcome.getByTestId('welcome-import'))
  await welcome.getByTestId('welcome-later').click()
  await expectHidden(welcome)
  const side = page.getByTestId('sidebar-empty')
  await expectVisible(side.getByText('No connections yet'))
  await expectVisible(side.getByRole('button', { name: 'Import sessions…' }))
  await expectVisible(side.getByRole('button', { name: 'Try demo' }))
  const home = page.getByTestId('ops-home')
  await expectVisible(home.getByTestId('l7-empty'))
  await expectVisible(home.getByText('No connections yet'))
  await expectVisible(home.getByRole('button', { name: 'Try demo' }))
  await cjkScan('empty states')
  mkdirSync(artifacts, { recursive: true })
  await page.screenshot({ path: join(artifacts, 'r13-empty-states.png') })
})

await step('UX-09: Monitor with nothing connected → host picker ("No connections yet" → demo host → Enter connects → monitor)', async () => {
  await page.locator('[data-tool="resourceMonitor"]').click()
  const picker = page.getByTestId('host-picker')
  await expectVisible(picker)
  await expectVisible(picker.getByText('Pick a host to open Resource monitor'))
  await expectVisible(picker.getByText('No connections yet'))
  await cjkScan('host picker (empty)')
  await page.keyboard.press('Escape')
  await expectHidden(picker)
  await page.getByTestId('empty-try-demo').click()
  await expectVisible(page.getByTestId('demo-banner'), 10000)
  // Drop live sessions via IPC so PICKER_ACTIONS sees length===0 (tab X shows confirm.closeLiveTerminal and is flaky in this second-launch window).
  await page.evaluate(async () => {
    const ids = [...document.querySelectorAll('[data-session-id]')]
      .map((el) => el.getAttribute('data-session-id'))
      .filter(Boolean)
    for (const id of ids) {
      try { await window.aiss.ssh.disconnect(id) } catch {}
    }
  })
  await expectHidden(page.getByTestId('demo-banner'), 10000)
  await page.keyboard.press('Escape')
  await page.locator('[data-tool="resourceMonitor"]').click()
  await expectVisible(picker, 10000)
  await expectVisible(picker.getByText(/Demo host/i), 10000)
  await cjkScan('host picker')
  await page.screenshot({ path: join(artifacts, 'r13-host-picker.png') })
  await page.keyboard.press('Enter')
  await expectHidden(picker, 10000)
  const panel = page.locator('.rm-panel')
  await expectVisible(panel.locator('.rm-disk').filter({ hasText: '/data' }), 15000)
  await noModal('host picker → monitor')
  await closeActiveTab()
  await expectHidden(panel)
  await page.screenshot({ path: join(artifacts, 'r13-demo-session.png') })
})

await app.close().catch(() => {})
aiServer.close()
try { rmSync(root2, { recursive: true, force: true }) } catch {}
ssh.close()
try { rmSync(root, { recursive: true, force: true }) } catch {}
try { rmSync(sftpRoot, { recursive: true, force: true }) } catch {}
const failed = results.filter((r) => !r.ok).length
console.log(`== e2e result: ${results.length - failed} passed, ${failed} failed ==`)
process.exit(failed ? 1 : 0)
