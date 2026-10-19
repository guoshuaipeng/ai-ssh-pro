/** M20 (0.6.58): main process enforces host protection on AI writes; streams stay in their conversation. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aiEffectiveLevel,
  aiWriteVerdict,
  capSafetyModeForProtection,
  protectionFromSafetyContext,
  stricterProtection
} from '../src/shared/ai-write-guard'
import { clearSessionProtection, getSessionProtection, setSessionProtection } from '../src/main/ai-protection-registry'
import { changelogFor } from '../src/shared/changelog'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// ---- (1) pure guard ----
assert.equal(aiEffectiveLevel(null), 'normal')
assert.equal(aiEffectiveLevel({ level: 'production' }), 'production')
assert.equal(aiEffectiveLevel({ level: 'production', elevated: true }), 'normal', 'elevation lifts production')
assert.equal(aiEffectiveLevel({ level: 'readonly', elevated: true }), 'readonly', 'read-only stays read-only for the AI')

// read-only: blocked even after a person agreed
assert.deepEqual(aiWriteVerdict({ level: 'readonly' }, { approved: true }), { allow: false, reason: 'readonly' })
assert.deepEqual(aiWriteVerdict({ level: 'readonly' }, { approved: false, kind: 'read' }), { allow: false, reason: 'readonly' })
// production: never auto for changes; approved passes; auto read passes
assert.deepEqual(aiWriteVerdict({ level: 'production' }, { approved: false, kind: 'write' }), { allow: false, reason: 'production-auto' })
assert.deepEqual(aiWriteVerdict({ level: 'production' }, { approved: false, kind: 'high' }), { allow: false, reason: 'production-auto' })
assert.deepEqual(aiWriteVerdict({ level: 'production' }, { approved: true, kind: 'write' }), { allow: true })
assert.deepEqual(aiWriteVerdict({ level: 'production' }, { approved: false, kind: 'read' }), { allow: true })
assert.deepEqual(aiWriteVerdict({ level: 'normal' }, { approved: false, kind: 'write' }), { allow: true })

assert.equal(capSafetyModeForProtection('auto', { level: 'production' }, 'write'), 'agree')
assert.equal(capSafetyModeForProtection('auto', { level: 'production' }, 'read'), 'auto')
assert.equal(capSafetyModeForProtection('auto', { level: 'production', elevated: true }, 'write'), 'auto')
assert.equal(capSafetyModeForProtection('agree', { level: 'readonly' }, 'read'), 'suggest')
assert.equal(capSafetyModeForProtection('auto', { level: 'normal' }, 'write'), 'auto')

// ---- (2) full level, legacy boolean still understood, stricter merge ----
assert.deepEqual(protectionFromSafetyContext({ production: true }), { level: 'production', elevated: false })
assert.deepEqual(protectionFromSafetyContext({ protection: 'readonly', production: false }), { level: 'readonly', elevated: false })
assert.deepEqual(protectionFromSafetyContext({ protection: 'production', elevated: true }), { level: 'production', elevated: true })
assert.equal(protectionFromSafetyContext({}), null)
assert.equal(stricterProtection({ level: 'production' }, { level: 'readonly' }).level, 'readonly')
assert.equal(stricterProtection(null, { level: 'production', elevated: true }).elevated, true)
assert.equal(stricterProtection({ level: 'production', elevated: true }, { level: 'production' }).elevated, false)
assert.deepEqual(stricterProtection(null, null), { level: 'normal', elevated: false })

clearSessionProtection()
setSessionProtection('s1', { level: 'readonly' })
assert.deepEqual(getSessionProtection('s1'), { level: 'readonly', elevated: false })
setSessionProtection('s1', null)
assert.equal(getSessionProtection('s1'), null)
setSessionProtection('s2', { level: 'bogus' as never })
assert.equal(getSessionProtection('s2'), null)

// main-process wiring: verdict right before the only ssh.write in the agent
const agent = norm('src/main/ai-interactive-agent.ts')
const w = agent.indexOf('lastWriteOk = ssh.write(targetSessionId')
const g = agent.lastIndexOf('aiWriteVerdict(liveProtection', w)
assert.ok(w > 0 && g > 0 && w - g < 2500, 'write verdict sits right before ssh.write')
assert.ok(agent.slice(g, w).includes('getSessionProtection(targetSessionId)') || agent.slice(g - 400, w).includes('getSessionProtection(targetSessionId)'), 'live registry read at write time')
assert.equal(agent.split('ssh.write(').length - 1, 1, 'one write site in the agent')
assert.ok(agent.includes('capSafetyModeForProtection(decision.mode, hostProtection, decision.kind)'))
assert.ok(agent.includes("production: aiEffectiveLevel(hostProtection) !== 'normal'"))
assert.ok(agent.includes("safetyMode === undefined && aiEffectiveLevel(hostProtection) === 'readonly'"), 'legacy (no tier) path is covered too')
const main = norm('src/main/index.ts')
assert.ok(main.includes("ipcMain.on('ai:protection:set'") && main.includes('setSessionProtection('))
assert.ok(norm('src/preload/index.ts').includes("ipcRenderer.send('ai:protection:set'"))
const ipc = norm('src/shared/ipc.ts')
assert.match(ipc, /protection\?: 'normal' \| 'production' \| 'readonly'/)

const app = norm('src/renderer/src/App.tsx')
assert.equal(app.includes("protection === 'production'}"), false, 'no boolean-only protection for the AI panel')
assert.ok(app.includes('protection={activeSessionId ? guardForSession(activeSessionId).level'))
assert.ok(app.includes('elevated={activeSessionId ? guardForSession(activeSessionId).elevated'))
assert.ok(app.includes('window.aiss.ai.setSessionProtection') && app.includes('push(t.sessionId, { level: g.level, elevated: g.elevated })'))
// guardForSession = demo default (effectiveLevel) + per-tab temp read-only + elevation window
const guard = app.slice(app.indexOf('const guardForSession = useCallback'), app.indexOf('const guardForSession = useCallback') + 600)
assert.ok(guard.includes('stricterLevel(effectiveLevel(profile)') && guard.includes('sessionRo[profile.id]') && guard.includes('isElevated(profile?.id, elevateMap)'))
assert.equal(norm('src/shared/protection.ts').includes("if (profile?.demo) return 'production'"), true)

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('protection,\n          elevated,'), 'full protection travels in safetyContext')
const run = panel.slice(panel.indexOf('const runSuggestedCommand'), panel.indexOf('const confirmStep'))
assert.ok(run.indexOf("=== 'readonly'") > 0 && run.indexOf("=== 'readonly'") < run.indexOf('dispatchInjectTerminal'), 'renderer run path refuses read-only too')

// dispatchInjectTerminal → term.paste → term.onData → writeInput → onUserData → handleTermInput (gated)
const pane = norm('src/renderer/src/components/TerminalPane.tsx')
assert.ok(pane.includes('api.term.paste(payload)'))
assert.match(pane, /term\.onData\(\(data\) => \{\s*if \(mirrorOnlyRef\.current\) return\s*writeInput\(data\)/)
const wiAt = pane.indexOf('const writeInput = (data: string) =>')
const wi = pane.slice(wiAt, pane.indexOf('attachTerminalClipboardKeys(term', wiAt))
assert.ok(wi.indexOf('onUserDataRef.current(data)') < wi.indexOf('window.aiss.ssh.write'), 'onUserData wins over the raw write')
assert.ok(app.includes('onUserData={(data) => handleTermInput(t.sessionId, data)}'))
const hti = app.slice(app.indexOf('const handleTermInput = useCallback'), app.indexOf('const restoreProtection'))
assert.ok(hti.includes('readonlyActive(guardForSession(origin).level, guardForSession(origin).elevated)') && hti.includes('gateTerminalChunk'))

// ---- (3) stream scoped per conversation ----
const submit = panel.slice(panel.indexOf('const submitToAi = useCallback'), panel.indexOf('const send = useCallback'))
assert.ok(submit.includes('turnRef.current = turn') && submit.includes('const applyTurn = ') && submit.includes('const onScreen = () => persistKeyRef.current === turn.key'))
const stream = submit.slice(submit.indexOf('window.aiss.ai.onStream'))
assert.equal(/\bsetLines\(/.test(stream), false, 'stream updates go through applyTurn')
assert.equal(/\bsetPendingConfirm\(/.test(stream), false, 'confirm dock follows the turn')
assert.equal(submit.includes('persistHistory('), false, 'history persists under the turn key')
assert.ok(submit.includes('persistTurn(turn.lines)'))
assert.ok(panel.includes('data-testid="ai-turn-elsewhere"') && panel.includes('data-testid="ai-turn-switch-back"'))
assert.ok(app.includes('onSwitchToConversation={(key) =>'))
const i18n = norm('src/renderer/src/lib/i18n.tsx')
for (const k of ['ai.turnElsewhere', 'ai.turnSwitchBack', 'ai.readonlyBlocked']) assert.equal(i18n.split(`'${k}':`).length - 1, 2, k)

// release
const pkg = JSON.parse(norm('package.json')) as { version: string; scripts: Record<string, string> }
assert.ok(pkg.version.localeCompare('0.6.58', undefined, { numeric: true }) >= 0)
assert.match(pkg.scripts['test:parts'], /test-m20-ai-protection/)
const changelog = norm('CHANGELOG.md')
assert.ok(changelog.slice(changelog.indexOf('## v0.6.58'), changelog.indexOf('## v0.6.57')).includes('M20'))
assert.ok(changelogFor('0.6.58').length >= 1)

console.log('test-m20-ai-protection ok')
