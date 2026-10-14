// GUI end-to-end tests: real clicks via Playwright's Electron driver.
// Isolated demo profile (fake hosts only) + an in-process ssh2 test server on 127.0.0.1.
// Usage: npm run build && npm run e2e
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync, fstatSync, openSync, readSync, writeSync, closeSync, unlinkSync, rmdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import net from 'node:net'
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
        p('p9', 'e2e-local', '127.0.0.1', undefined, 'e2e', sshPort, { password: 'e2e-pass' })
      ]
    }
  })
)
const wrapperDir = join(root, 'wrapper')
mkdirSync(wrapperDir)
writeFileSync(join(wrapperDir, 'package.json'), JSON.stringify({ name: 'ai-ssh-pro', version: '0.0.0-e2e', type: 'module', main: 'main.mjs' }))
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
const app = await _electron.launch({ executablePath: require('electron'), args: [wrapperDir], env, timeout: 60000 })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2500)

const results = []
const artifacts = join(repo, 'e2e-artifacts')
async function step(name, fn) {
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  OK   ${name} (${Date.now() - t0}ms)`)
  } catch (e) {
    results.push({ name, ok: false })
    console.log(`  FAIL ${name}: ${String(e?.message || e).split('\n')[0]}`)
    mkdirSync(artifacts, { recursive: true })
    await page.screenshot({ path: join(artifacts, name.replace(/\W+/g, '_') + '.png') }).catch(() => {})
  }
}
const expectVisible = (loc, timeout = 8000) => loc.first().waitFor({ state: 'visible', timeout })
const expectHidden = (loc, timeout = 8000) => loc.first().waitFor({ state: 'hidden', timeout })
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const tree = page.locator('.session-folder-block')
const search = page.getByPlaceholder(/Search sessions/)
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
const xtermHas = (s) => page.waitForFunction((x) => [...document.querySelectorAll('.xterm-rows')].some((r) => (r.textContent || '').includes(x)), s, { timeout: 8000 })

console.log('== e2e (Playwright + Electron, isolated demo profile, ssh2 test server :' + sshPort + ') ==')

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
  await page.getByRole('button', { name: 'Session', exact: true }).click()
  await page.getByText('Snippets', { exact: true }).first().click()
  await expectVisible(page.getByText('Command snippets'))
  await expectVisible(page.getByText('No snippets yet', { exact: false }))
  await page.getByLabel('Title').fill('Tail log')
  await page.getByLabel('Command', { exact: true }).fill('tail -n {{lines}} /var/log/syslog')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expectVisible(page.getByText('Saved (1)'))
  await page.getByPlaceholder(/Search snippets/).fill('nomatch')
  await expectVisible(page.getByText('No matching snippets'))
  await page.getByPlaceholder(/Search snippets/).fill('tail')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.waitForTimeout(1500)
  const f = join(downloads, 'ai-ssh-pro-snippets.json')
  assert(existsSync(f), 'export file not written')
  assert(JSON.parse(readFileSync(f, 'utf8')).snippets[0].title === 'Tail log', 'export content')
  await cjkScan('snippets panel')
})

await step('tab right-click menu: rename / close-others entry', async () => {
  const tab = page.locator('.tab-bar .tab').last()
  await tab.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const input = page.locator('.tab-rename-input')
  await input.fill('My snippets')
  await input.press('Enter')
  await expectVisible(page.locator('.tab-bar .tab').filter({ hasText: 'My snippets' }))
  await page.locator('.tab-bar .tab').filter({ hasText: 'My snippets' }).click({ button: 'right' })
  await expectVisible(page.getByRole('menuitem', { name: 'Close other tabs' }))
  await page.keyboard.press('Escape')
  await expectHidden(page.locator('.tab-context-menu'))
})

await step('SSH connect to local test server (host key prompt, shell echo, latency)', async () => {
  await page.getByText('e2e-local', { exact: true }).first().dblclick()
  const trust = page.getByRole('button', { name: 'Trust and continue' })
  await trust.waitFor({ state: 'visible', timeout: 15000 })
  await cjkScan('host key dialog')
  await trust.click()
  await expectVisible(page.locator('.session-command-bar'), 15000)
  const input = page.locator('.session-command-bar input, .session-command-bar textarea').first()
  await input.fill('echo e2e-hello-42')
  await input.press('Enter')
  await xtermHas('e2e-hello-42')
  await expectVisible(page.locator('.session-latency').filter({ hasText: /ms/ }), 20000)
  await cjkScan('connected session')
})

await step('batch execute + export .txt', async () => {
  await page.getByText('Batch', { exact: true }).first().click()
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
  await cjkScan('batch modal')
  await page.keyboard.press('Escape')
  await expectHidden(page.locator('.batch-exec'))
})

await step('custom tab name survives auto-reconnect after network reset', async () => {
  const sshTab = page.locator('.tab-bar .tab').filter({ hasText: 'e2e-local' }).first()
  await sshTab.dblclick()
  const input = page.locator('.tab-rename-input')
  await input.fill('Renamed SSH')
  await input.press('Enter')
  await expectVisible(page.locator('.tab-bar .tab').filter({ hasText: 'Renamed SSH' }))
  await page.locator('.tab-bar .tab').filter({ hasText: 'Renamed SSH' }).click()
  for (const c of conns) c._sock?.resetAndDestroy?.()
  await expectVisible(page.locator('.session-autoretry'), 15000)
  await expectVisible(page.locator('.session-command-bar'), 25000)
  const titles = await page.locator('.tab-bar .tab').allTextContents()
  assert(titles.some((t) => t.includes('Renamed SSH')), 'custom title lost: ' + titles.join(' | '))
  const input2 = page.locator('.session-command-bar input, .session-command-bar textarea').first()
  await input2.fill('echo after-reconnect')
  await input2.press('Enter')
  await xtermHas('after-reconnect')
})

await step('Ctrl+1 / Ctrl+Tab switch tabs', async () => {
  await page.keyboard.press('Control+1')
  await expectVisible(page.locator('.tab-bar .tab.active').filter({ hasText: 'My snippets' }))
  await page.keyboard.press('Control+Tab')
  await expectVisible(page.locator('.tab-bar .tab.active').filter({ hasText: 'Renamed SSH' }))
})

await step('dangerous command needs confirmation (cancel blocks it)', async () => {
  const input = page.locator('.session-command-bar input, .session-command-bar textarea').first()
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
  const localUp = join(root, 'upload-me.txt')
  writeFileSync(localUp, 'uploaded by e2e\n')
  const localDown = join(downloads, 'hello-downloaded.txt')
  await app.evaluate(({ dialog }, a) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [a.up] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: a.down })
  }, { up: localUp, down: localDown })
  await page.getByRole('button', { name: 'Session', exact: true }).click()
  await page.getByText('File transfer', { exact: true }).first().click()
  const row = (name) => page.locator('tr').filter({ has: page.locator('.sftp-name-btn', { hasText: name }) })
  await expectVisible(row('hello.txt'), 15000)
  await cjkScan('SFTP panel')
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await expectVisible(row('upload-me.txt'), 15000)
  assert(readFileSync(join(sftpRoot, 'upload-me.txt'), 'utf8') === 'uploaded by e2e\n', 'uploaded content on server')
  await row('hello.txt').getByRole('button', { name: 'Download', exact: true }).click()
  for (let i = 0; i < 40 && !existsSync(localDown); i++) await page.waitForTimeout(250)
  await page.waitForTimeout(300)
  assert(existsSync(localDown) && readFileSync(localDown, 'utf8') === 'hello from e2e sftp\n', 'downloaded content')
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  await page.locator('.dialog-text-input').fill('made-by-e2e')
  await page.getByTestId('dialog-ok').click()
  await expectVisible(row('made-by-e2e'), 15000)
  assert(statSync(join(sftpRoot, 'made-by-e2e')).isDirectory(), 'mkdir on server')
})

await step('session tags: edit via in-app dialog, chip, #tag search, persisted', async () => {
  if (!(await tree.getByText('demo-web-01').first().isVisible())) await page.getByText('Demo · Web', { exact: true }).first().click()
  await page.getByText('demo-web-01', { exact: true }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit tags…' }).click()
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

const menu = async (top, item) => {
  await page.getByRole('button', { name: top, exact: true }).click()
  await page.getByText(item, { exact: true }).first().click()
}

await step('port forwarding panel: add (auto local port), traffic through SSH, stop', async () => {
  await menu('Session', 'Port forwarding…')
  await expectVisible(page.locator('.pf-panel'))
  await page.getByLabel('Remote port').fill('7777')
  await page.getByRole('button', { name: 'Add forward', exact: true }).click()
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
  await page.getByRole('button', { name: 'Add forward', exact: true }).click()
  await expectVisible(page.locator('.pf-error').filter({ hasText: 'already in use' }))
  await row.getByRole('button', { name: 'Stop', exact: true }).click()
  await expectVisible(page.getByText('No active forwards'))
  const closed = await new Promise((res) => {
    const sock = net.connect(port, '127.0.0.1', () => { sock.destroy(); res(false) })
    sock.on('error', () => res(true))
  })
  assert(closed, 'local port still open after stop')
  await page.keyboard.press('Escape')
  await expectHidden(page.locator('.pf-panel'))
})

await step('command bar explains commands offline (flags, pipes, risk)', async () => {
  await page.locator('.tab-bar .tab').filter({ hasText: 'Renamed SSH' }).first().click()
  const input = page.locator('.session-command-bar input, .session-command-bar textarea').first()
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

await step('main window title is AI-SSH-Pro and the window is visible', async () => {
  const wins = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ title: w.getTitle(), visible: w.isVisible() })))
  assert(wins.length >= 1 && wins[0].title === 'AI-SSH-Pro' && wins[0].visible, 'window: ' + JSON.stringify(wins))
  assert((await page.title()) === 'AI-SSH-Pro', 'document title')
})

await step('English UI: remote editor has no CJK text', async () => {
  await page.locator('.tab-bar .tab').filter({ hasText: 'File transfer' }).first().click()
  const r = page.locator('tr').filter({ has: page.locator('.sftp-name-btn', { hasText: 'hello.txt' }) })
  await r.getByRole('button', { name: 'Edit', exact: true }).click()
  await expectVisible(page.getByText('hello from e2e sftp', { exact: false }), 15000)
  await page.waitForTimeout(500)
  await cjkScan('remote editor')
  await page.keyboard.press('Escape')
})

for (const [top, item, label] of [
  ['Session', 'New connection', 'connection config'],
  ['Session', 'AI settings', 'AI config form'],
  ['Session', 'Host inventory', 'host inventory'],
  ['Session', 'MCP setup guide…', 'MCP guide'],
  ['View', 'Terminal appearance', 'terminal prefs'],
  ['View', 'UI theme', 'UI theme']
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

await app.close().catch(() => {})
ssh.close()
try { rmSync(root, { recursive: true, force: true }) } catch {}
try { rmSync(sftpRoot, { recursive: true, force: true }) } catch {}
const failed = results.filter((r) => !r.ok).length
console.log(`== e2e result: ${results.length - failed} passed, ${failed} failed ==`)
process.exit(failed ? 1 : 0)