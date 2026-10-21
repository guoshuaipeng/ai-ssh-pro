import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import {
  AI_ACTIONS, actionsPrompt, applyMonitorAction, buildProfileFromAction, cardReducer, getAction,
  initialValues, missingFields, redactForAi, sanitizeProposal, type CardState
} from '../src/shared/ai-actions'
import { cleanIpcError, proposalFromReply } from '../src/shared/ai-actions'
import { BATCH_RISK_MIN, parseTargets, pickHistoryForAction, resolveTargets, sftpPathOk } from '../src/shared/ai-actions'
import { auditDetailForAction, buildSnippetFromAction, findProfileForAction, forwardRequestFromAction } from '../src/shared/ai-actions'
import { parseAiAssistantReply } from '../src/shared/ipc'
import { DEFAULT_ALERT_RULES } from '../src/shared/alert-rules'

let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }

// registry
ok(AI_ACTIONS.map((a) => a.name).join() === 'connection.add,monitor.configure,sftp.open,snippet.create,forward.create,connection.open,history.fill', 'registry order (c53+c54)')
for (const a of AI_ACTIONS) ok(a.fields.every((f) => f.labelKey.startsWith('aa.')), `${a.name} fields use aa.* i18n`)

// sanitize: secrets from the model are dropped, unknown keys/actions ignored
const p = sanitizeProposal({ name: 'connection.add', params: { host: ' 10.0.0.5 ', username: 'deploy', password: 'hunter2', privateKeyPath: '/k', passphrase: 'x', evil: 1, auth: 'bogus', port: 'abc' } })
ok(p && p.params.host === '10.0.0.5' && p.params.username === 'deploy', 'keeps known fields, trimmed')
ok(p && !('password' in p.params) && !('privateKeyPath' in p.params) && !('passphrase' in p.params), 'secret params never accepted from AI')
ok(p && !('evil' in p.params) && !('auth' in p.params) && !('port' in p.params), 'unknown keys, bad enum, bad number dropped')
ok(sanitizeProposal({ name: 'rm.rf', params: {} }) === null, 'unknown action rejected')
ok(sanitizeProposal('x') === null && sanitizeProposal(null) === null, 'garbage rejected')

// prompt never advertises secret params
const prompt = actionsPrompt()
ok(prompt.includes('connection.add') && prompt.includes('monitor.configure'), 'prompt lists actions')
ok(!/privateKeyPath|[{,] password\b/.test(prompt), 'prompt hides secret params')

// parse from model reply
const reply = parseAiAssistantReply(JSON.stringify({ description: 'ok', action: 'end', completed: true, riskLevel: 'low', appAction: { name: 'monitor.configure', params: { metric: 'cpu', threshold: 85 } } }))
ok(reply?.appAction?.name === 'monitor.configure' && reply.appAction.params.threshold === '85', 'reply carries sanitized appAction')
ok(parseAiAssistantReply(JSON.stringify({ description: 'ok', action: 'end', riskLevel: 'low' }))?.appAction === undefined, 'no appAction by default')

// redaction of context sent to AI
const red = redactForAi('password: hunter2\n密码：abc123\nsshpass -p s3cr3t ssh x\nAuthorization: Bearer abc.def\nkey sk-abcdefghijklmnop\n-----BEGIN OPENSSH PRIVATE KEY-----\nAAA\n-----END OPENSSH PRIVATE KEY-----')
ok(!/hunter2|abc123|s3cr3t|abc\.def|abcdefghijklmnop|AAA/.test(red), 'secrets redacted from context')
ok(red.includes('[redacted') && red.includes('ssh x'), 'non-secret text kept')

// missing params -> ask
const conn = getAction('connection.add')!
const v0 = initialValues(conn, { host: '10.0.0.5' })
ok(v0.port === '22' && v0.auth === 'key' && v0.password === '', 'defaults filled, secrets empty')
ok(missingFields(conn, v0).map((f) => f.key).join() === 'username', 'missing username is asked')
let st: CardState = { phase: 'editing', values: v0, showMissing: false }
st = cardReducer(conn, st, { type: 'confirm' })
ok(st.phase === 'editing' && st.showMissing, 'confirm with missing fields asks instead of running')
st = cardReducer(conn, st, { type: 'edit', key: 'username', value: 'deploy' })
st = cardReducer(conn, st, { type: 'confirm' })
ok(st.phase === 'running', 'complete form runs')
// repeated clicks while running are ignored
const again = cardReducer(conn, st, { type: 'confirm' })
ok(again === st, 'second confirm while running is a no-op')
ok(cardReducer(conn, st, { type: 'cancel' }) === st, 'cannot cancel while running')
st = cardReducer(conn, st, { type: 'finish', ok: true })
ok(st.phase === 'done' && cardReducer(conn, st, { type: 'confirm' }) === st, 'done is final (no double execution)')
// cancel
let c: CardState = { phase: 'editing', values: v0, showMissing: false }
c = cardReducer(conn, c, { type: 'cancel' })
ok(c.phase === 'cancelled' && cardReducer(conn, c, { type: 'confirm' }) === c && cardReducer(conn, c, { type: 'edit', key: 'host', value: 'x' }) === c, 'cancel is final')
// number range
ok(missingFields(conn, { ...v0, username: 'u', port: '70000' }).some((f) => f.key === 'port'), 'port out of range asked')
// password field only for password auth
ok(missingFields(conn, { ...v0, username: 'u', auth: 'password' }).length === 0, 'password optional (user may enter at connect)')

// executors
let id = 0
const a = buildProfileFromAction({ host: 'h', username: 'u', port: '2222', auth: 'password', password: 'pw', label: '' }, [], () => 'id' + ++id)
ok(a.profiles.length === 1 && a.profile.label === 'u@h' && a.profile.port === 2222 && a.profile.password === 'pw' && !a.updated, 'new profile')
const b = buildProfileFromAction({ host: 'h', username: 'u', port: '2222', auth: 'key', label: 'web' }, a.profiles, () => 'zz')
ok(b.updated && b.profiles.length === 1 && b.profile.id === 'id1' && b.profile.label === 'web', 'same target updates instead of duplicating')

const base = { rules: DEFAULT_ALERT_RULES.map((r) => ({ ...r })), notify: { systemNotify: true, markRed: true, sound: false, notifyOnRecover: false }, mutedUntil: null, packRules: [] }
const m = applyMonitorAction(base, { metric: 'cpu', threshold: '75', sustainMin: '3', enabled: 'on' })
const cpu = m.rules.find((r) => r.id === 'cpu')!
ok(cpu.threshold === 75 && cpu.sustainMin === 3 && cpu.enabled && cpu.customized, 'monitor rule updated')
ok(m.rules.length === base.rules.length && base.rules.find((r) => r.id === 'cpu')!.threshold !== 75, 'pure: input untouched')
const off = applyMonitorAction(base, { metric: 'disk', threshold: '90', sustainMin: '0', enabled: 'off' })
ok(off.rules.find((r) => r.id === 'disk')!.enabled === false, 'disable a rule')

// wiring
const card = readFileSync('src/renderer/src/components/AiActionCard.tsx', 'utf8')
ok(card.includes('busy.current') && card.includes("type={f.type === 'secret' ? 'password'"), 'card guards double click and masks secrets')
const stream = readFileSync('src/main/ai-stream.ts', 'utf8')
ok(stream.includes('actionsPrompt()') && stream.includes('redactForAi('), 'main adds action prompt and redacts context')
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
ok(panel.includes('<AiActionCard') && panel.includes('onAppAction'), 'AI panel renders the card')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('buildProfileFromAction(') && app.includes('applyMonitorAction('), 'App executors wired')
// c54: sftp.open / snippet.create / forward.create / audit
const profs = [{ id: 'a', label: 'web-01', host: '10.0.0.1', port: 22, username: 'root' }, { id: 'b', label: 'db-main', host: '10.0.0.2', port: 22, username: 'pg' }] as never
ok(findProfileForAction(profs, 'WEB-01')?.id === 'a' && findProfileForAction(profs, '10.0.0.2')?.id === 'b' && findProfileForAction(profs, 'pg@10.0.0.2')?.id === 'b', 'target resolves by name/host/user@host')
ok(findProfileForAction(profs, 'nope') === undefined && findProfileForAction(profs, ' ') === undefined, 'unknown target -> undefined')
const sn = buildSnippetFromAction({ title: ' 磁盘 ', command: 'df -h', category: '' }, [], () => 'id1')
ok(sn.list.length === 1 && sn.snippet.title === '磁盘' && sn.snippet.body === 'df -h' && !('category' in sn.snippet), 'snippet built, empty category dropped')
const fr = forwardRequestFromAction({ localPort: '8080', remoteHost: '', remotePort: '80' }, 's1')
ok(fr.sessionId === 's1' && fr.localPort === 8080 && fr.remoteHost === '127.0.0.1' && fr.remotePort === 80, 'forward request defaults remote host')
ok(missingFields(getAction('forward.create')!, { localPort: '8080' }).some((f) => f.key === 'remotePort'), 'forward needs remote port')
const ad = auditDetailForAction('connection.add', { host: 'h', username: 'u', password: 'S3cret' })
ok(ad.includes('host=h') && !ad.includes('S3cret'), 'audit detail never includes secrets')
ok(['sftp.open', 'snippet.create', 'forward.create'].every((x) => !!getAction(x)), 'c54 actions registered')
ok(app.includes("type: 'ai.action'") && app.includes('auditDetailForAction('), 'App audits every confirmed action')
const shots = readFileSync('scripts/screenshot-key-screens.mjs', 'utf8')
ok(shots.includes("name: 'e2e-ai-conn'") && shots.includes('EXPECT FAILED'), 'E2E confirm-click scenario is a hard check')
const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
ok(agent.includes('actionsPrompt()') && agent.includes('proposalFromReply(raw as Record<string, unknown>)') && agent.includes('redactForAi(t.content)'), 'interactive agent: prompt + sanitized appAction + redacted context')
// c55: batch open + second confirm, history fill, sftp path
ok(parseTargets('a, b，c  a;d').join() === 'a,b,c,d', 'targets split on , ， ; space and dedupe')
const rt = resolveTargets(profs, 'web-01, 10.0.0.2, ghost')
ok(rt.found.length === 2 && rt.missing.join() === 'ghost', 'resolveTargets reports unknown targets')
const od = getAction('connection.open')!
ok(BATCH_RISK_MIN === 3 && !od.risk!({ targets: 'a,b' }) && od.risk!({ targets: 'a,b,c' }), 'batch of 3+ is high risk')
let cs: CardState = { phase: 'editing', values: { targets: 'a,b,c' }, showMissing: false }
cs = cardReducer(od, cs, { type: 'confirm' })
ok(cs.phase === 'editing' && cs.armed === true, 'first confirm on high-risk only arms')
ok(cardReducer(od, cs, { type: 'disarm' }).armed === false, 'disarm resets')
ok(cardReducer(od, cs, { type: 'edit', key: 'targets', value: 'a,b,c,d' }).armed === false, 'editing disarms (must re-confirm twice)')
ok(cardReducer(od, cs, { type: 'confirm' }).phase === 'running', 'second confirm runs')
let low: CardState = { phase: 'editing', values: { targets: 'a' }, showMissing: false }
ok(cardReducer(od, low, { type: 'confirm' }).phase === 'running', 'single open runs on first confirm')
const hist = [
  { command: 'systemctl restart nginx', hostKey: 'h2', count: 9, lastUsed: 300 },
  { command: 'sudo systemctl restart nginx', hostKey: 'h1', count: 1, lastUsed: 100 },
  { command: 'nginx -t', hostKey: 'h1', count: 5, lastUsed: 200 }
]
ok(pickHistoryForAction(hist, 'restart nginx', 'h1') === 'sudo systemctl restart nginx', 'history: all words + same host first')
ok(pickHistoryForAction(hist, 'nginx', 'hX') === 'systemctl restart nginx', 'history: most recent otherwise')
ok(pickHistoryForAction(hist, 'apache', 'h1') === undefined && pickHistoryForAction(hist, ' ', 'h1') === undefined, 'history: no match -> undefined')
ok(sftpPathOk('') && sftpPathOk('/var/log') && sftpPathOk('~/app') && !sftpPathOk('var/log') && !sftpPathOk('/a\nb'), 'sftp path validation')
const card55 = readFileSync('src/renderer/src/components/AiActionCard.tsx', 'utf8')
ok(card55.includes('ai-action-armed') && card55.includes("type: 'disarm'"), 'card shows armed state and auto-disarms')
ok(app.includes('runAppActionRef.current') && app.includes('requestSftpGoto(') && app.includes('fillCommandBar(activeSessionId, cmd)'), 'App wires c55 executors')
ok(shots.includes("name: 'ai-action-open-armed'") && shots.includes('[1024, 760]'), 'armed scenario + 1024 variants')
// c55: shapes seen in the real-model eval + IPC error cleanup + E2E coverage
ok(proposalFromReply({ action: 'sftp.open', params: { target: 'web-01', path: '/var/log' } })?.name === 'sftp.open', 'accepts {action:<name>, params}')
ok(proposalFromReply({ action: 'rm.everything', params: {} }) === null && proposalFromReply({ action: 'end' }) === null, 'unknown action name is ignored')
ok(!('password' in (proposalFromReply({ action: 'connection.add', params: { host: 'h', username: 'u', password: 'x' } })?.params ?? {})), 'fallback shape still strips secrets')
const pr = parseAiAssistantReply('{"action":"history.fill","completed":false,"params":{"query":"nginx"}}')
ok(pr?.appAction?.name === 'history.fill' && pr.completed === true, 'parser: action-name shape -> card, no description needed')
ok(parseAiAssistantReply('{"action":"command","command":"ls"}') === null, 'parser: still needs description for normal steps')
ok(cleanIpcError(new Error("Error invoking remote method 'workspace:forwards:add': Error: 会话未连接")) === '会话未连接', 'IPC error prefix stripped')
const e2eNames = ['e2e-ai-conn', 'e2e-monitor', 'e2e-snippet-dbl', 'e2e-open-batch', 'e2e-sftp', 'e2e-hist', 'e2e-forward', 'e2e-err-nosession-fwd', 'e2e-err-nosession-hist', 'e2e-err-missing', 'e2e-err-notfound', 'e2e-err-cancel-click', 'e2e-err-armed-cancel']
ok(e2eNames.every((x) => shots.includes(`name: '${x}'`)) && shots.includes("argv.includes('--probe-fail')"), 'E2E: every action + error paths + probe-fail switch')
ok(AI_ACTIONS.every((a) => shots.includes(`aiAction', name: '${a.name}'`)), 'E2E: every registered action has a scenario')
const bar = readFileSync('src/renderer/src/components/SessionCommandBar.tsx', 'utf8')
ok(bar.indexOf('const homeRef = useRef') < bar.indexOf('if (!open) {'), 'command bar hooks run before the collapsed early return (#310)')
// c56: harness isolation - eval steps block-scoped, audit checks scoped to the scenario, one data dir per theme
ok(shots.includes("'{' + st.eval + ';}'") && shots.includes('window.__e2eT0 = Date.now()') && shots.includes('e.at>=window.__e2eT0') && shots.includes("argv.includes('--isolate-themes')"), 'E2E isolation in place')
ok(shots.includes('[cov] EVAL FAILED'), 'a throwing eval step fails an E2E run')
ok(!/aud\('[^']+','(allowed|blocked)'\)(?!===)/.test(shots), 'every audit check compares an exact count')
ok(shots.includes("name: 'term-cmd-explain'") && readFileSync('src/renderer/src/features.css', 'utf8').includes('floating tip needs its own surface'), 'cmd explain tip has an opaque surface + check')
ok(/PRIORITY: requests about this app/.test(actionsPrompt()), 'prompt states app-action priority')
console.log(`test-ai-actions: ${n} passed`)
