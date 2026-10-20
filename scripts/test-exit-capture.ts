import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { delimiter } from 'node:path'
import { ExitMarkerParser, EXIT_OSC, exitMarkerEligible, stripEchoedMarker, wrapWithExitMarker } from '../src/shared/exit-marker'
import { execStatusFrom, exitWaitMs, normalizeExecRecord } from '../src/shared/ai-exec-replay'
import { classifyCommandFailure } from '../src/main/core-a-command-failure'

// eligibility
assert.equal(exitMarkerEligible('df -h'), true)
assert.equal(exitMarkerEligible('systemctl status nginx | head'), true)
for (const c of ['vim /etc/hosts', 'top', 'sleep 9 &', 'cat <<EOF', 'ls \\', 'ls |', 'a && ', 'ssh web-02', 'sudo -i', 'exit', 'tmux attach', 'bash', 'sh -l', 'mysql -uroot', 'python3', 'a\nb', ''])
  assert.equal(exitMarkerEligible(c), false, c)
for (const c of ['sh -c "exit 7"', 'bash deploy.sh', 'python3 -V', 'node -v'])
  assert.equal(exitMarkerEligible(c), true, c)
if (false)
  assert.equal(exitMarkerEligible(c), false, c)

// wrap
const w = wrapWithExitMarker('false;', 'ab12cd34')
assert.equal(w.marked, true)
assert.equal(w.wire, "false; printf '\\033]777;aiss-exit;%s;%d\\007' ab12cd34 $?")
assert.equal(wrapWithExitMarker('top', 'ab12cd34').marked, false)
assert.equal(wrapWithExitMarker('ls', 'bad nonce!').marked, false)

// parser: stripped from output, split across chunks, ST terminator, junk ignored
{
  const p = new ExitMarkerParser()
  const a = p.feed('line1\r\n\x1b]777;ais')
  assert.deepEqual(a, { clean: 'line1\r\n', exits: [] })
  const b = p.feed('s-exit;ab12cd34;1\x07$ ')
  assert.deepEqual(b, { clean: '$ ', exits: [{ nonce: 'ab12cd34', code: 1 }] })
  const c = p.feed(`x${EXIT_OSC}zz99zz99;0\x1b\\y`)
  assert.deepEqual(c, { clean: 'xy', exits: [{ nonce: 'zz99zz99', code: 0 }] })
  const d = p.feed('plain \x1b]0;title\x07 text')
  assert.equal(d.clean, 'plain \x1b]0;title\x07 text')
  const e = p.feed('\x1b')
  assert.deepEqual(e, { clean: '', exits: [] })
  assert.equal(p.feed('[0m').clean, '\x1b[0m')
}

// echoed suffix removed from what the AI / replay sees (also when the terminal wrapped it)
assert.equal(stripEchoedMarker(`$ df -h; printf '\\033]777;aiss-exit;%s;%d\\007' ab12cd34 $?\nFilesystem`), '$ df -h\nFilesystem')
assert.equal(stripEchoedMarker(`$ df -h; pri\r\nntf '\\033]777;aiss-exit;%s;%d\\007' ab12cd34 $?`), '$ df -h')

// real shells: the wire form reports the right exit code and leaves stdout intact
const shells = [process.env.AISS_TEST_SH, 'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/sh.exe', '/bin/bash', '/bin/sh', '/bin/dash', '/usr/bin/zsh'].filter((s): s is string => Boolean(s && existsSync(s)))
let ran = 0
for (const sh of shells) {
  for (const [cmd, code] of [['echo hi', 0], ['false', 1], ['(exit 7)', 7], ['echo a | grep b', 1]] as const) {
    const { wire } = wrapWithExitMarker(cmd, 'ab12cd34')
    const bin = sh.includes('Git/') ? 'C:/Program Files/Git/usr/bin' + delimiter : ''
    const r = spawnSync(sh, ['-c', wire], { encoding: 'utf8', env: { ...process.env, PATH: bin + (process.env.PATH ?? '') } })
    const out = new ExitMarkerParser().feed(r.stdout)
    assert.deepEqual(out.exits, [{ nonce: 'ab12cd34', code }], `${sh}: ${cmd}`)
    if (cmd === 'echo hi') assert.equal(out.clean.trim(), 'hi')
    ran++
  }
}
console.log(`real-shell checks: ${ran} (${shells.join(', ') || 'none found'})`)

// judgement uses the captured code
assert.equal(execStatusFrom({ writeOk: true, exitCode: 0 }), 'ok')
assert.equal(execStatusFrom({ writeOk: true, exitCode: 1 }), 'failed')
assert.equal(classifyCommandFailure('false', { exitCode: 1, writeOk: true })?.kind, 'nonzero')
assert.equal(classifyCommandFailure('true', { exitCode: 0, writeOk: true }), null)
assert.equal(normalizeExecRecord({ status: 'sent', at: 1, noExit: 'timeout' })?.noExit, 'timeout')
assert.equal(normalizeExecRecord({ status: 'ok', at: 1, noExit: 'timeout' })?.noExit, undefined)
assert.equal(exitWaitMs(undefined), 10_000)
assert.equal(exitWaitMs('100'), 10_000)
assert.equal(exitWaitMs('999999'), 60_000)

// wiring
const mgr = readFileSync('src/main/ssh-manager.ts', 'utf8')
assert.equal((mgr.match(/consumeExitMarkers\(sessionId, outDec\.write\(buf\)\)/g) || []).length, 2)
assert.ok(mgr.includes('confirmedCommandOutcome(sessionId: string, command: string)'))
const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
assert.ok(agent.includes('ssh.writeAiCommand(targetSessionId, oneLineCmd, captureExit)'))
assert.ok(agent.includes("settings.aiExitCapture !== false"))
const store = readFileSync('src/main/app-store.ts', 'utf8')
assert.ok(store.includes("anyMerged.aiExitCapture === false"))
const ui = readFileSync('src/renderer/src/components/SafetyTierSettings.tsx', 'utf8')
assert.ok(ui.includes('data-testid="ai-exit-capture"'))
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['exec.noExit.timeout', 'exec.noExit.ineligible', 'exec.noExit.disabled', 'policy.exitCapture', 'policy.exitCaptureHint']) assert.equal(i18n.split(`'${k}':`).length - 1, 2, k)
console.log('test-exit-capture: ok')
