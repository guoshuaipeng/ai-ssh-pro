import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { explainCommand, splitShellSegments } from '../src/shared/command-explain'
import { validateForwardSpec, listForwards, stopForward } from '../src/main/forward-manager'

// --- command explanation ---
assert.deepEqual(splitShellSegments("ps aux | grep 'a|b' && echo ok; ls || true"), ['ps aux', "grep 'a|b'", 'echo ok', 'ls', 'true'])
const e = explainCommand('sudo tail -fn 100 /var/log/syslog | grep -i error', 'en')!
assert.equal(e.segments.length, 2)
assert.equal(e.segments[0]!.program, 'tail')
assert.ok(e.segments[0]!.prefixes[0]!.includes('run as root'))
assert.deepEqual(e.segments[0]!.flags.map((f) => f.flag), ['-f', '-n'])
assert.equal(e.segments[1]!.flags[0]!.text, 'ignore case')
assert.equal(e.risk, null)
const z = explainCommand('ls -la', 'zh-CN')!
assert.equal(z.segments[0]!.text, '列出目录内容')
assert.equal(explainCommand('rm -rf /', 'en')!.risk, 'risk.rmRoot')
assert.equal(explainCommand('/usr/bin/df -h', 'en')!.segments[0]!.known, true)
assert.equal(explainCommand('FOO=1 frobnicate --x', 'en')!.segments[0]!.known, false)
assert.equal(explainCommand('mkfs.ext4 /dev/sdb1', 'en')!.segments[0]!.text, 'Create a filesystem (format)')
assert.equal(explainCommand('   ', 'en'), null)
assert.deepEqual(explainCommand('kill -9 123', 'en')!.segments[0]!.flags.map((f) => f.flag), ['-9'])

// --- port forward spec validation ---
assert.deepEqual(validateForwardSpec({ localPort: 0, remotePort: 80 }), { localPort: 0, remoteHost: '127.0.0.1', remotePort: 80 })
assert.deepEqual(validateForwardSpec({ localPort: '8080', remoteHost: ' db.internal ', remotePort: '5432' }), { localPort: 8080, remoteHost: 'db.internal', remotePort: 5432 })
for (const bad of [{ localPort: -1, remotePort: 80 }, { localPort: 70000, remotePort: 80 }, { localPort: 1, remotePort: 0 }, { localPort: 1, remotePort: 1.5 }, { localPort: 1, remotePort: 22, remoteHost: 'a b' }]) {
  assert.throws(() => validateForwardSpec(bad))
}
assert.deepEqual(listForwards(), [])
assert.equal(stopForward('nope'), false)

// --- static guard: no Chinese UI strings left in renderer components (comments are fine) ---
const RE = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/
const dir = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'components')
const SKIP = new Set(['AiDebugWindowApp.tsx'])
const ALLOW = new Set(['简体中文', '中文'])
const hits: string[] = []
for (const f of readdirSync(dir).filter((n) => n.endsWith('.tsx') && !SKIP.has(n))) {
  const sf = ts.createSourceFile(f, readFileSync(join(dir, f), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (n: ts.Node) => {
    let text: string | null = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) text = n.text
    else if (ts.isTemplateExpression(n)) text = n.getText()
    if (text && RE.test(text) && !ALLOW.has(text.trim())) {
      hits.push(`${f}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${text.trim().slice(0, 40)}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
assert.equal(hits.length, 0, 'Chinese UI strings outside i18n:\n' + hits.join('\n'))
console.log('round9 ok')
