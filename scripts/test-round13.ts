/** v0.3.13: demo host, AI explain / NL → command, entry-point rule (F4), i18n, changelog. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { demoCommandOutput, demoExecOutput, DEMO_FILES, isDemoSessionId, demoProfileLabel } from '../src/shared/demo-host'
import { RESOURCE_PROBE_CMD, parseResourceSnapshot } from '../src/shared/resource-monitor'
import { PROCESS_LIST_CMD, SERVICE_LIST_CMD, parseProcessList, parseServiceList } from '../src/shared/server-tools'
import { KEYMAP, keysFor, matchKeymap, isShellReservedKey } from '../src/shared/keymap'
import { SHARED_MENUS } from '../src/shared/menus'
import { CHANGELOG, changelogFor } from '../src/shared/changelog'
import { buildPaletteEntries, filterPaletteEntries, PALETTE_HIDDEN } from '../src/renderer/src/lib/palette'
import { looksLikeError, noteSubmitted, rememberError, lastErrorFor, lastErrorSessionId, stripAnsi } from '../src/renderer/src/lib/ai-events'
import { normalizeAssist, runAiAssist } from '../src/main/ai-assist'
import { assessCommandRisk } from '../src/shared/command-risk'

let n = 0
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg)
  n++
}

// G1 demo host: simulated shell + fixtures in the same formats as the real probes
ok(isDemoSessionId('demo:abc') && !isDemoSessionId('abc'), 'demo session ids')
ok(demoProfileLabel('zh-CN') === '演示主机 (demo)' && demoProfileLabel('en') === 'Demo host (demo)', 'demo label')
const ls = demoCommandOutput('ls')
ok(ls.code === 0 && DEMO_FILES.every((f) => ls.output.includes(f.name)), 'ls lists demo files')
ok(demoCommandOutput('cat /etc/shadow').code === 1, 'permission denied exit 1')
ok(demoCommandOutput('cat /nope').output.includes('No such file'), 'missing file error')
ok(demoCommandOutput('systemctl status nginx').code === 3, 'failed nginx status → exit 3')
ok(demoCommandOutput('foobar').code === 127, 'unknown command → 127')
ok(/read-only|not executed/i.test(demoCommandOutput('systemctl restart nginx').output), 'mutations are not executed')
const snap = parseResourceSnapshot(demoExecOutput(RESOURCE_PROBE_CMD, 1).stdout)
ok(snap.load && snap.cores === 4 && snap.cpuPercent !== null && snap.mem && snap.disks.length === 2 && snap.uptimeSec, 'monitor parses demo data')
ok(parseProcessList(demoExecOutput(PROCESS_LIST_CMD).stdout).length >= 4, 'toolbox processes')
ok(parseServiceList(demoExecOutput(SERVICE_LIST_CMD).stdout).length >= 3, 'toolbox services')
ok(assessCommandRisk('rm -rf /') !== null, 'dangerous command still intercepted (same check as real hosts)')

// A2 shortcut: registered once, global (works while the terminal is focused), not a shell key
ok(keysFor('aiCommand') === 'Ctrl+Shift+Space', 'Ctrl+Shift+Space → AI mode')
ok(new Set(KEYMAP.filter((k) => k.scope === 'global' || k.scope === 'nonTerminal' || k.scope === 'display').map((k) => k.keys)).size === KEYMAP.filter((k) => k.scope === 'global' || k.scope === 'nonTerminal' || k.scope === 'display').length, 'no duplicate bindings')
ok(!isShellReservedKey({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false } as KeyboardEvent), 'not reserved for the shell')
ok(matchKeymap({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false } as KeyboardEvent, true) === 'aiCommand', 'matches inside terminal')

// F4: every menu action (except clipboard/palette) is findable in the palette by its label in both languages
for (const locale of ['zh-CN', 'en']) {
  const entries = buildPaletteEntries(SHARED_MENUS, locale)
  for (const m of SHARED_MENUS) {
    for (const it of m.items) {
      if (it.type !== 'item' || PALETTE_HIDDEN.has(it.id)) continue
      for (const label of [it.label.zh, it.label.en]) {
        const found = filterPaletteEntries(entries, label.replace(/…$/, '')).some((e) => e.id === it.id)
        ok(found, `palette(${locale}) finds ${it.id} by "${label}"`)
      }
    }
  }
}
const ids = new Set(SHARED_MENUS.flatMap((m) => m.items.flatMap((it) => (it.type === 'item' ? [it.id] : []))))
for (const id of ['aiExplainError', 'aiCommand', 'tour', 'demoHost'] as const) ok(ids.has(id), `${id} registered in MENUS`)
ok(filterPaletteEntries(buildPaletteEntries(SHARED_MENUS, 'en'), 'explain').some((e) => e.id === 'aiExplainError'), 'palette: "explain"')
ok(filterPaletteEntries(buildPaletteEntries(SHARED_MENUS, 'zh-CN'), '演示').some((e) => e.id === 'demoHost'), 'palette: 演示')

// A1 error detection
ok(stripAnsi('\x1b[31mred\x1b[0m') === 'red', 'strip ansi')
ok(looksLikeError('cat: /nope: No such file or directory\r\n'), 'detects No such file')
ok(looksLikeError('Permission denied (publickey).'), 'detects denied')
ok(!looksLikeError('total 8\r\ndrwxr-xr-x 2 demo demo 4096 app\r\n'), 'normal output is not an error')
noteSubmitted('s1', 'grep -r error /var/log')
ok(!looksLikeError('grep -r error /var/log\r\n', 's1'), 'echo of the submitted command is ignored')
rememberError('s1', 'bash: foo: command not found')
ok(lastErrorFor('s1') === 'bash: foo: command not found' && lastErrorSessionId() === 's1', 'last error remembered')

// AI assist normalisation + not-configured + HTTP round trip
const ex = normalizeAssist('explainError', { cause: 'File missing', fixes: [{ command: 'ls /', note: 'check' }, { command: '' }], notes: 'n' })
ok(ex.ok && ex.kind === 'explainError' && ex.fixes.length === 1 && ex.fixes[0]!.command === 'ls /', 'explain normalised (empty fixes dropped)')
const nl = normalizeAssist('nlCommand', { command: 'ss -ltnp | grep :80', explanation: 'x', risk: 'weird' })
ok(nl.ok && nl.kind === 'nlCommand' && nl.risk === 'caution', 'unknown risk → caution')
const baseSettings = JSON.parse('{}')
const nc = await runAiAssist({ requestId: 'r0', kind: 'nlCommand', text: 'x', locale: 'en' }, baseSettings)
ok(!nc.ok && nc.code === 'not-configured', 'not-configured without key/model')

const srv = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const j = JSON.parse(body)
    const user = String(j.messages?.[1]?.content ?? '')
    const content = user.includes('Terminal output')
      ? JSON.stringify({ cause: 'The file does not exist.', fixes: [{ command: 'ls -la /', note: 'list root' }], notes: 'Check the path.' })
      : JSON.stringify({ command: 'ss -ltnp | grep :80', explanation: 'Shows the process on port 80', risk: 'safe' })
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content } }] }))
  })
})
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
const port = (srv.address() as AddressInfo).port
const fake = { apiKey: 'k', baseURL: `http://127.0.0.1:${port}`, model: 'm' }
const settings = JSON.parse(JSON.stringify({ ...fake, providers: [{ id: 'p', name: 'p', ...fake }], activeProviderId: 'p' }))
const r1 = await runAiAssist({ requestId: 'r1', kind: 'explainError', text: 'cat: /nope: No such file or directory', locale: 'en' }, settings)
ok(r1.ok && r1.kind === 'explainError' && r1.fixes[0]?.command === 'ls -la /', `explainError round trip ${JSON.stringify(r1)}`)
const r2 = await runAiAssist({ requestId: 'r2', kind: 'nlCommand', text: 'find the process on port 80', locale: 'en' }, settings)
ok(r2.ok && r2.kind === 'nlCommand' && r2.command.includes(':80'), `nlCommand round trip ${JSON.stringify(r2)}`)
srv.close()

// i18n: new copy in both languages; English without CJK
const src = readFileSync(new URL('../src/renderer/src/lib/i18n.tsx', import.meta.url), 'utf8')
const zhPart = src.slice(src.indexOf('const zhCN = {'), src.indexOf('} as const'))
const enPart = src.slice(src.indexOf('const en: Record<MessageKey, string> = {'), src.indexOf('const catalogs'))
const keyRe = /\n\s*'((?:a1|a2|g1|g2|ux08|ux09|ux10)\.[^']+)':\s*("(?:[^"\\]|\\.)*")/g
const zhKeys = new Map([...zhPart.matchAll(keyRe)].map((m) => [m[1]!, JSON.parse(m[2]!) as string]))
const enKeys = new Map([...enPart.matchAll(keyRe)].map((m) => [m[1]!, JSON.parse(m[2]!) as string]))
ok(zhKeys.size >= 60, `new keys present (${zhKeys.size})`)
for (const [k] of zhKeys) ok(enKeys.has(k), `${k} has English`)
for (const [k, v] of enKeys) ok(!/[\u4e00-\u9fff]/.test(v), `${k} English has no CJK`)
ok(enKeys.get('ux09.title') === 'Pick a host to open {feature}' && enKeys.get('ux10.broadcasting') === 'Broadcasting · {n}', 'design copy (en)')

// changelog drives What's new + release notes
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
ok((CHANGELOG['0.3.13'] ?? []).length >= 4, '0.3.13 changelog entries')
for (const e of CHANGELOG['0.3.13'] ?? []) if (e.action) ok(ids.has(e.action), `changelog action ${e.action} exists`)
ok(changelogFor(pkg.version).length >= 1, 'changelog for package version')
ok(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').includes(`## v${pkg.version}`), 'CHANGELOG.md has package version')
ok(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').includes('## v0.3.13'), 'CHANGELOG.md has v0.3.13')

console.log(`test-round13 ok: ${n} assertions`)
