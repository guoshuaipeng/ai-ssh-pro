import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseMode, toOctal, toRwx, permBits } from '../src/shared/sftp-perm'
import { shouldCollapsePaste, buildPasteBlock, composeWithBlocks } from '../src/shared/paste-block'
import { normalizePrompts } from '../src/shared/ai-prompts'
const rd = (p: string) => readFileSync(p, 'utf8')
// D93
assert.equal(parseMode('755', 0), 0o755)
assert.equal(parseMode('0644', 0), 0o644)
assert.equal(parseMode('u+x', 0o644), 0o744)
assert.equal(parseMode('+x', 0o644), 0o755)
assert.equal(parseMode('go-w,u=rwx', 0o666), 0o744)
assert.equal(parseMode('rm -rf', 0o644), null)
assert.equal(parseMode('999', 0o644), null)
assert.equal(toRwx(0o755), 'rwxr-xr-x'); assert.equal(toOctal(0o7), '007')
assert.equal(permBits(0o100644), 0o644); assert.equal(permBits(undefined), null)
const sp = rd('src/renderer/src/components/SftpPanel.tsx')
const fn = sp.slice(sp.indexOf('const chmodEntry'), sp.indexOf('const mkdir = async'))
assert.ok(fn.indexOf('allowRemoteWrite()') > -1 && fn.indexOf('allowRemoteWrite()') < fn.indexOf('askText'), 'guard before prompt')
assert.ok(fn.indexOf('confirmDialog') < fn.indexOf('sftp.chmod'), 'confirm before chmod')
assert.match(sp, /id: 'chmod'[\s\S]{0,120}disabled: readOnly \|\| remoteWritesBlocked/)
assert.match(rd('src/main/index.ts'), /sftp:chmod[\s\S]{0,200}mode > 0o7777/)
assert.doesNotMatch(rd('src/main/sftp-manager.ts').slice(rd('src/main/sftp-manager.ts').indexOf('export async function chmod')).slice(0, 500), /exec\(/)
// D94
assert.equal(shouldCollapsePaste('a\n'.repeat(12)), true)
assert.equal(shouldCollapsePaste('short'), false)
const b = buildPasteBlock('line\n'.repeat(20))
assert.ok(composeWithBlocks('q', [b]).includes('q'))
// D95
assert.ok(normalizePrompts(Array(20).fill('x')).length <= 8)
assert.match(rd('src/renderer/src/components/AIPanel.tsx'), /ai-my-prompt-del[\s\S]{0,400}|confirmDialog/)
for (const k of ['d93.menu', 'd93.confirmTitle', 'd94.title']) assert.equal(rd('src/renderer/src/lib/i18n.tsx').split(`'${k}'`).length - 1, 2, k)
console.log('test-cycle37 ok')
