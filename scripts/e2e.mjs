// GUI end-to-end tests: real clicks via Playwright's Electron driver.
// Isolated demo profile (fake hosts only) + an in-process ssh2 test server on 127.0.0.1.
// Usage: npm run build && npm run e2e
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { _electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const { Server, utils } = require('ssh2')
const repo = resolve(import.meta.dirname, '..')
const mainJs = join(repo, 'out', 'main', 'index.js')
if (!existsSync(mainJs)) throw new Error('run npm run build first')

// ---------- local SSH test target ----------
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
    client.on('session', (accept) => {
      const session = accept()
      session.on('pty', (ok) => ok && ok())
      session.on('window-change', (ok) => ok && ok())
      session.on('env', (ok) => ok && ok())
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

await step('F1 opens keyboard shortcuts panel (English)', async () => {
  await page.locator('.tab-bar').click()
  await page.keyboard.press('F1')
  await expectVisible(page.getByText('Go to tab N (9 = last)'))
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
  await page.getByRole('button', { name: '信任并继续' }).click({ timeout: 15000 })
  await expectVisible(page.locator('.session-command-bar'), 15000)
  const input = page.locator('.session-command-bar input, .session-command-bar textarea').first()
  await input.fill('echo e2e-hello-42')
  await input.press('Enter')
  await xtermHas('e2e-hello-42')
  await expectVisible(page.locator('.session-latency').filter({ hasText: /ms/ }), 20000)
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

await app.close().catch(() => {})
ssh.close()
try { rmSync(root, { recursive: true, force: true }) } catch {}
const failed = results.filter((r) => !r.ok).length
console.log(`== e2e result: ${results.length - failed} passed, ${failed} failed ==`)
process.exit(failed ? 1 : 0)