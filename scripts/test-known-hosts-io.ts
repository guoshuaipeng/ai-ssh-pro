/** OpenSSH known_hosts parse + import preview; UI wiring for known hosts manager. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  HASHED_HOSTS_NEVER_IMPORTED,
  defaultImportSelection,
  isLikelyPrivateKeyName,
  isSafeKnownHostLookupName,
  keygenFQueryName,
  parseOpenSshKnownHosts,
  parseSshKeygenFOutput,
  planKnownHostsImport,
  splitKnownHostNames
} from '../src/shared/known-hosts-io'
import { translate } from '../src/renderer/src/lib/i18n'
import { SHARED_MENUS } from '../src/shared/menus'
import { DEFAULT_RECONNECT_POLICY } from '../src/shared/reconnect-policy'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.55')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-known-hosts-io/)

assert.deepEqual(splitKnownHostNames('example.com'), [{ host: 'example.com', port: 22 }])
assert.deepEqual(splitKnownHostNames('[bastion.example]:2222'), [{ host: 'bastion.example', port: 2222 }])
assert.deepEqual(splitKnownHostNames('a.example,b.example'), [
  { host: 'a.example', port: 22 },
  { host: 'b.example', port: 22 }
])

const sample = [
  '# comment',
  'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl',
  '[10.0.0.2]:2222 ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC7exampleHostKeyMaterialBase64PadXX',
  '|1|abc|def ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIhashed',
  '@cert-authority *.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIcert'
].join('\n')

const parsed = parseOpenSshKnownHosts(sample)
assert.equal(parsed.entries.length, 2)
assert.equal(parsed.entries[0]?.host, 'github.com')
assert.equal(parsed.entries[1]?.port, 2222)
assert.ok(parsed.skipped.some((s) => s.kind === 'hashed'))
assert.equal(HASHED_HOSTS_NEVER_IMPORTED, true)
assert.ok(parsed.skipped.some((s) => s.kind === 'marker'))

const existing = [
  {
    hostPort: 'github.com:22',
    fingerprint: 'SHA256:old',
    hostKeyBase64: 'DIFFERENT'
  }
]
const plan = planKnownHostsImport(parsed.entries, existing)
assert.equal(plan.find((r) => r.hostPort === 'github.com:22')?.action, 'update')
assert.equal(plan.find((r) => r.hostPort === '10.0.0.2:2222')?.action, 'add')
const sel = defaultImportSelection(plan)
assert.ok(sel.length >= 2)
assert.equal(plan.some((r) => r.host.includes('|') || r.hostPort.includes('|1|')), false)

assert.equal(isLikelyPrivateKeyName('id_ed25519'), true)
assert.equal(isLikelyPrivateKeyName('id_ed25519.pub'), false)
assert.equal(isLikelyPrivateKeyName('known_hosts'), false)
assert.equal(isLikelyPrivateKeyName('config'), false)
assert.equal(isLikelyPrivateKeyName('mykey.pem'), true)

const fileItems = JSON.stringify(SHARED_MENUS).includes('knownHosts')
assert.equal(fileItems, true)

const modal = readFileSync('src/renderer/src/components/KnownHostsModal.tsx', 'utf8')
assert.match(modal, /kh-import-preview/)
assert.match(modal, /applyImport/)
assert.match(modal, /kh-tab-keys/)
assert.match(modal, /openSshDir/)

const main = readFileSync('src/main/index.ts', 'utf8')
assert.match(main, /knownHosts:pickImport/)
assert.match(main, /buildImportPreview/)
assert.match(main, /knownHosts:listLocalKeys/)

const preload = readFileSync('src/preload/index.ts', 'utf8')
assert.match(preload, /knownHosts:\s*\{/)

assert.match(translate('zh-CN', 'kh.previewSafe'), /勾选|写入/)
assert.match(translate('en', 'kh.previewSafe'), /Unchecked|preview/i)
assert.match(translate('zh-CN', 'kh.openFromSettings'), /主机密钥/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /KnownHostsModal/)
assert.match(app, /action === 'knownHosts'/)

const settings = readFileSync('src/renderer/src/components/SettingsPanel.tsx', 'utf8')
assert.match(settings, /settings-known-hosts/)


assert.match(modal, /kh-use-key/)
assert.match(modal, /onUseKey/)
assert.match(modal, /kh-hashed-skip/)
assert.match(modal, /kh-copy-fp/)

const appUse = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(appUse, /onUseKey=\{/)
assert.match(appUse, /setPrivateKeyPath\(path\)/)
assert.match(appUse, /setConnAuth\('key'\)/)
assert.match(appUse, /setConnFocus\('cert'\)/)

const khMain = readFileSync('src/main/known-hosts.ts', 'utf8')
assert.match(khMain, /skippedHashedSamples/)

assert.match(translate('zh-CN', 'kh.hashedBody'), /不会导入|HashKnownHosts/)
assert.match(translate('en', 'kh.useKey'), /Use for connection/i)
assert.match(translate('zh-CN', 'kh.useKeyDone', { name: 'id_ed25519' }), /id_ed25519/)

console.log('test-known-hosts-io ok')


assert.equal(isSafeKnownHostLookupName('evil;rm'), false)
assert.equal(isSafeKnownHostLookupName('github.com'), true)
assert.equal(keygenFQueryName('GitHub.com', 22), 'github.com')
assert.equal(keygenFQueryName('bastion', 2222), '[bastion]:2222')

const keygenOut = `# Host github.com found: line 1 
|1|abc|def ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
# Host other.example found: line 2
other.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIotherkeymaterialpadxxxxYYYY
`
const fMatches = parseSshKeygenFOutput(keygenOut, 'github.com', 22)
assert.equal(fMatches.length, 1)
assert.equal(fMatches[0]?.host, 'github.com')
assert.equal(fMatches[0]?.hashed, true)
assert.equal(parseSshKeygenFOutput(keygenOut, 'evil.com', 22).length, 0)

const modalLookup = readFileSync('src/renderer/src/components/KnownHostsModal.tsx', 'utf8')
assert.match(modalLookup, /kh-lookup/)
assert.match(modalLookup, /lookupHost/)
const hk = readFileSync('src/renderer/src/components/HostKeyConfirmModal.tsx', 'utf8')
assert.match(hk, /hk-lookup-run/)
assert.match(readFileSync('src/main/index.ts', 'utf8'), /knownHosts:lookupHost/)
assert.match(translate('zh-CN', 'kh.lookupLead'), /ssh-keygen/)
assert.match(translate('en', 'kh.hashedBody'), /Look up by host|ssh-keygen/i)

console.log('test-known-hosts-io: lookup ok')


const zhMsg = (key: Parameters<typeof translate>[1]) => translate('zh-CN', key)
const enMsg = (key: Parameters<typeof translate>[1]) => translate('en', key)

const lookupSrc = readFileSync('src/main/known-hosts-lookup.ts', 'utf8')
assert.match(lookupSrc, /export const KEYGEN_F_CACHE_TTL_MS = 60_000/)
assert.match(lookupSrc, /export function invalidateKnownHostLookupCache/)
assert.match(lookupSrc, /lookupCache/)
assert.match(lookupSrc, /mtimeMs/)
assert.match(lookupSrc, /cached:\s*true/)

const mainSrc = readFileSync('src/main/index.ts', 'utf8')
assert.match(mainSrc, /invalidateKnownHostLookupCache/)
assert.match(mainSrc, /localFs:pickCertificate/)

assert.match(readFileSync('src/preload/index.ts', 'utf8'), /pickCertificate/)
assert.match(readFileSync('src/renderer/src/components/ConnectionConfigModal.tsx', 'utf8'), /conn-browse-cert/)

assert.equal(DEFAULT_RECONNECT_POLICY.keepAliveSec, 60)
assert.match(readFileSync('src/renderer/src/components/ReconnectPolicySection.tsx', 'utf8'), /l9-ka-off-nudge/)

assert.match(zhMsg('localShell.unavailable'), /node-pty|本机/)
assert.match(enMsg('localShell.unavailable'), /node-pty/i)
assert.match(zhMsg('l9.kaOffNudge'), /keep-alive|关闭/)
assert.match(enMsg('conn.browseCert'), /Browse/i)

assert.match(readFileSync('src/renderer/src/App.tsx', 'utf8'), /localShell:\s*!localShellAvailable/)
assert.match(readFileSync('src/main/local-shell.ts', 'utf8'), /main-i18n/)

console.log('known-hosts lookup cache + cert/local/keepalive UX wiring: ok')
