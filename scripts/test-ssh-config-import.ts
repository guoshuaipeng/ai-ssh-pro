/** OpenSSH ~/.ssh/config import mapping + preview fields. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseLocalForward,
  parseOpenSshConfig,
  expandTilde,
  expandSshConfigIncludes,
  matchSimpleGlob,
  isPathInsideRoots,
  SSH_INCLUDE_MAX_DEPTH
} from '../src/shared/ssh-config-import'
import { applyImportPolicy, buildImportPreview, publicRows } from '../src/shared/import-preview'
import { translate } from '../src/renderer/src/lib/i18n'
import { SHARED_MENUS } from '../src/shared/menus'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.44')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ssh-config-import/)

assert.equal(expandTilde('~/.ssh/id_ed25519', '/home/u'), '/home/u/.ssh/id_ed25519')
assert.equal(expandTilde('~/.ssh/id_ed25519', 'C:/Users/me'), 'C:/Users/me/.ssh/id_ed25519')

assert.deepEqual(parseLocalForward('8080 localhost:80'), { localPort: 8080, remoteHost: 'localhost', remotePort: 80 })
assert.deepEqual(parseLocalForward('127.0.0.1:9090 10.0.0.5:443'), {
  localPort: 9090,
  remoteHost: '10.0.0.5',
  remotePort: 443
})

const sample = `
Host *
  ServerAliveInterval 60

Host web db
  HostName 10.0.0.8
  User deploy
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
  IdentityFile ~/.ssh/id_rsa
  ProxyJump bastion@jump.example:22
  LocalForward 8080 127.0.0.1:80

Host only-alias
  HostName app.internal
  User root

Include ~/.ssh/extra
Match host *.lab
  User lab
`.trim()

const parsed = parseOpenSshConfig(sample, { homeDir: '/home/op', group: 'OpenSSH' })
assert.ok(parsed.drafts.length >= 3)
const web = parsed.drafts.find((d) => d.label === 'web')
assert.ok(web)
assert.equal(web?.host, '10.0.0.8')
assert.equal(web?.port, 2222)
assert.equal(web?.username, 'deploy')
assert.equal(web?.privateKeyPath, '/home/op/.ssh/id_ed25519')
assert.equal(web?.authMode, 'key')
assert.ok(web?.jumpChain?.length)
assert.equal(web?.forwards?.[0]?.localPort, 8080)
assert.ok(parsed.drafts.some((d) => d.label === 'db'))
assert.equal(parsed.includeCount, 1)
assert.equal(parsed.matchCount, 1)
assert.ok(parsed.skippedWildcard >= 1)

const model = buildImportPreview(
  parsed.drafts.map((d) => ({
    label: d.label,
    host: d.host,
    port: d.port,
    username: d.username,
    privateKeyPath: d.privateKeyPath,
    authMode: d.authMode,
    jumpChain: d.jumpChain as never,
    jumpHost: d.jumpHost,
    forwards: d.forwards,
    group: d.group
  })),
  [{ id: 'p1', host: '10.0.0.8', port: 2222, username: 'deploy' }]
)
assert.ok(model.conflictCount >= 1)
const rows = publicRows(model)
const row = rows.find((r) => r.label === 'web')
assert.equal(row?.keyName, 'id_ed25519')
assert.equal(row?.hasJump, true)
assert.ok((row?.forwardCount ?? 0) >= 1)
assert.equal(row?.conflict, true)

const applied = applyImportPolicy({
  model,
  policy: 'skip',
  profiles: [{ id: 'p1', host: '10.0.0.8', port: 2222, username: 'deploy', label: 'old' }],
  folders: [],
  newId: () => 'n' + Math.random()
})
assert.ok(applied.skipped >= 1)

const panel = readFileSync('src/renderer/src/components/ImportPreviewPanel.tsx', 'utf8')
assert.match(panel, /n2\.colAuth/)
assert.match(panel, /n2\.conflictYes/)

assert.ok(JSON.stringify(SHARED_MENUS).includes('importSshConfig'))
assert.match(readFileSync('src/main/index.ts', 'utf8'), /sessions:importSshConfig/)
assert.match(readFileSync('src/main/session-import.ts', 'utf8'), /loadAndParseSshConfigFile/)
assert.match(readFileSync('src/main/ssh-config-load.ts', 'utf8'), /expandSshConfigIncludes/)
assert.match(translate('zh-CN', 'n2.importSshConfig'), /OpenSSH/)

console.log('test-ssh-config-import ok')


// --- Include expand (bounded, cycle-safe) ---
assert.equal(matchSimpleGlob('a.conf', '*.conf'), true)
assert.equal(matchSimpleGlob('a.conf', '?.conf'), true)
assert.equal(matchSimpleGlob('ab.conf', '?.conf'), false)
assert.equal(isPathInsideRoots('/home/u/.ssh/extra', ['/home/u/.ssh']), true)
assert.equal(isPathInsideRoots('/tmp/evil', ['/home/u/.ssh']), false)

{
  const files: Record<string, string> = {
    '/home/u/.ssh/config': `Host main\n  HostName 1.2.3.4\n  User a\nInclude conf.d/*.conf\nInclude ~/.ssh/nested`,
    '/home/u/.ssh/conf.d/web.conf': `Host web\n  HostName 10.0.0.1\n  User w`,
    '/home/u/.ssh/nested': `Host nest\n  HostName 10.0.0.2\n  User n\nInclude ~/.ssh/config`,
    '/etc/evil': `Host evil\n  HostName 9.9.9.9\n  User x`
  }
  const dirs: Record<string, string[]> = {
    '/home/u/.ssh/conf.d': ['web.conf', 'readme.txt']
  }
  const expanded = expandSshConfigIncludes(files['/home/u/.ssh/config']!, {
    homeDir: '/home/u',
    entryPath: '/home/u/.ssh/config',
    readText: (p) => files[p.replace(/\\/g, '/')] ?? files[p] ?? null,
    listNames: (d) => dirs[d.replace(/\\/g, '/')] ?? dirs[d] ?? [],
    resolve: (...parts) => {
      const joined = parts.join('/').replace(/\\/g, '/')
      const segs: string[] = []
      for (const part of joined.split('/')) {
        if (!part || part === '.') continue
        if (part === '..') {
          segs.pop()
          continue
        }
        segs.push(part)
      }
      return (joined.startsWith('/') ? '/' : '') + segs.join('/')
    },
    dirname: (p) => {
      const n = p.replace(/\\/g, '/')
      const i = n.lastIndexOf('/')
      return i <= 0 ? '/' : n.slice(0, i)
    },
    isAbsolute: (p) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
  })
  assert.ok(expanded.includedFiles.some((f) => f.includes('web.conf')))
  assert.ok(expanded.includedFiles.some((f) => f.includes('nested')))
  assert.ok(expanded.skipped.some((s) => s.reason === 'cycle'))
  const parsed = parseOpenSshConfig(expanded.text, { homeDir: '/home/u', group: 'OpenSSH' })
  assert.ok(parsed.drafts.some((d) => d.label === 'web'))
  assert.ok(parsed.drafts.some((d) => d.label === 'nest'))
  assert.equal(SSH_INCLUDE_MAX_DEPTH, 3)

  // outside root skipped
  const outside = expandSshConfigIncludes('Include /etc/evil\nHost z\n  HostName 1.1.1.1\n  User z', {
    homeDir: '/home/u',
    entryPath: '/home/u/.ssh/config',
    readText: (p) => files[p] ?? null,
    listNames: () => [],
    resolve: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (p) => p.replace(/\\/g, '/').split('/').slice(0, -1).join('/') || '/',
    isAbsolute: (p) => p.startsWith('/')
  })
  assert.ok(outside.skipped.some((s) => s.reason === 'outside'))
  assert.ok(!outside.text.includes('9.9.9.9'))
}

console.log('test-ssh-config-import: ok')


const withProxy = `
Host via-nc
  HostName 10.1.2.3
  User ops
  ProxyCommand nc -X 5 -x proxy.example:1080 %h %p
`.trim()
const proxied = parseOpenSshConfig(withProxy, { homeDir: '/home/op' })
const via = proxied.drafts.find((d) => d.label === 'via-nc')
assert.ok(via)
assert.equal(via?.host, '10.1.2.3')
assert.match(via?.proxyCommand || '', /nc -X/)
assert.ok(proxied.notes.some((n) => /ProxyCommand/i.test(n)))
assert.match(readFileSync('src/renderer/src/components/ConnectionConfigModal.tsx', 'utf8'), /conn-proxycommand-hint/)
assert.match(translate('en', 'm2.proxyCommandHint'), /ProxyJump/i)
console.log('test-ssh-config-import: ProxyCommand note ok')
