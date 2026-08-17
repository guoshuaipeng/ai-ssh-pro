/**
 * Offline smoke tests for pure logic (no Electron window required).
 * Run: npx tsx scripts/smoke-test.ts
 */
import { createHash } from 'node:crypto'
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportSessionsToJson, exportSessionsToOpenSsh } from '../src/main/session-export.ts'
import { importSessionFilesFromPaths } from '../src/main/session-import.ts'
import { filterProfiles } from '../src/renderer/src/lib/session-filter.ts'
import { parseAiAssistantReply, TERMINAL_PREFS_DEFAULTS } from '../src/shared/ipc.ts'
import { joinRemotePath } from '../src/main/sftp-manager.ts'
import { getXtermTheme } from '../src/renderer/src/lib/terminal-themes.ts'

let passed = 0
let failed = 0

function assert(cond: boolean, name: string, detail?: string): void {
  if (cond) {
    passed++
    console.log(`  OK  ${name}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n== session-export ==')
{
  const state = {
    folders: [{ id: 'f1', name: 'Prod' }],
    profiles: [
      {
        id: 'p1',
        label: 'web1',
        host: '10.0.0.1',
        port: 22,
        username: 'root',
        password: 'secret',
        passphrase: 'pp',
        folderId: 'f1',
        jumpHost: { host: 'bastion', username: 'jump', password: 'jpass', port: 22 }
      }
    ]
  }
  const json = exportSessionsToJson(state)
  const parsed = JSON.parse(json) as {
    profiles: Array<Record<string, unknown>>
  }
  assert(!('password' in parsed.profiles[0]!), 'JSON export strips password')
  assert(!('passphrase' in parsed.profiles[0]!), 'JSON export strips passphrase')
  const jump = parsed.profiles[0]!.jumpHost as Record<string, unknown>
  assert(Boolean(jump && jump.host === 'bastion'), 'JSON export keeps jump host')
  assert(Boolean(jump && !('password' in jump)), 'JSON export strips jump password')

  const openssh = exportSessionsToOpenSsh(state)
  assert(openssh.includes('Host '), 'OpenSSH export has Host')
  assert(openssh.includes('HostName 10.0.0.1'), 'OpenSSH export has HostName')
  assert(!openssh.toLowerCase().includes('secret'), 'OpenSSH export has no password')
}

console.log('\n== session-filter ==')
{
  const profiles = [
    { id: '1', label: 'API', host: 'api.example.com', port: 22, username: 'deploy' },
    { id: '2', label: 'DB', host: 'db.local', port: 22, username: 'root' }
  ]
  assert(filterProfiles(profiles, 'api').length === 1, 'filter by label/host')
  assert(filterProfiles(profiles, 'ROOT').length === 1, 'filter case-insensitive user')
  assert(filterProfiles(profiles, '').length === 2, 'empty query returns all')
}

console.log('\n== fingerprint helper (inline) ==')
{
  const key = Buffer.from('smoke-test-host-key-bytes')
  const fp = `SHA256:${createHash('sha256').update(key).digest('base64')}`
  assert(fp.startsWith('SHA256:'), 'fingerprint prefix')
  assert(fp.length > 20, 'fingerprint length')
}

console.log('\n== sftp path join ==')
{
  assert(joinRemotePath('/', 'a', 'b') === '/a/b', 'join remote path')
  assert(joinRemotePath('/var/', '/log') === '/var/log', 'join cleans slashes')
}

console.log('\n== terminal themes ==')
{
  for (const id of ['github-dark', 'solarized-dark', 'monokai'] as const) {
    const t = getXtermTheme(id)
    assert(Boolean(t.background && t.foreground), `theme ${id} has colors`)
  }
  assert(TERMINAL_PREFS_DEFAULTS.fontSize >= 10, 'default fontSize sane')
}

console.log('\n== parseAiAssistantReply ==')
{
  const ok = parseAiAssistantReply(
    '```json\n{"description":"done","action":"end","riskLevel":"low","completed":true}\n```'
  )
  assert(ok?.action === 'end' && ok.riskLevel === 'low', 'parse fenced JSON reply')
  const cmd = parseAiAssistantReply(
    '{"description":"run","action":"command","command":"uptime","riskLevel":"low"}'
  )
  assert(cmd?.action === 'command' && cmd.command === 'uptime', 'parse command reply')
  assert(parseAiAssistantReply('not json') === null, 'reject garbage')
}

console.log('\n== session-import (OpenSSH + PuTTY) ==')
const dir = mkdtempSync(join(tmpdir(), 'aiss-smoke-'))
const sshConfig = join(dir, 'config')
writeFileSync(
  sshConfig,
  `Host myserver\n  HostName 192.168.1.10\n  User ubuntu\n  Port 2222\n`,
  'utf8'
)
const puttyReg = join(dir, 'putty.reg')
writeFileSync(
  puttyReg,
  `Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\my%20box]\r\n"HostName"="putty.example.com"\r\n"PortNumber"=dword:00000016\r\n"UserName"="puttyuser"\r\n"Protocol"="ssh"\r\n`,
  'utf8'
)

const res = await importSessionFilesFromPaths([sshConfig, puttyReg])
assert(res.items.length >= 1, 'import returns items', `count=${res.items.length}`)
const ssh = res.items.find((i) => i.host === '192.168.1.10')
assert(Boolean(ssh && ssh.username === 'ubuntu' && ssh.port === 2222), 'OpenSSH config parsed')
const putty = res.items.find((i) => i.host === 'putty.example.com')
assert(Boolean(putty && putty.username === 'puttyuser'), 'PuTTY reg parsed', JSON.stringify(res.items))

try {
  unlinkSync(sshConfig)
  unlinkSync(puttyReg)
} catch {
  /* ignore */
}

console.log(`\n== result: ${passed} passed, ${failed} failed ==\n`)
process.exit(failed > 0 ? 1 : 0)
