import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import {
  AI_ACTIONS, actionsPrompt, applyMonitorAction, buildProfileFromAction, cardReducer, getAction,
  initialValues, missingFields, redactForAi, sanitizeProposal, type CardState
} from '../src/shared/ai-actions'
import { auditDetailForAction, buildSnippetFromAction, findProfileForAction, forwardRequestFromAction } from '../src/shared/ai-actions'
import { parseAiAssistantReply } from '../src/shared/ipc'
import { DEFAULT_ALERT_RULES } from '../src/shared/alert-rules'

let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }

// registry
ok(AI_ACTIONS.map((a) => a.name).join() === 'connection.add,monitor.configure,sftp.open,snippet.create,forward.create', 'registry order (c53+c54)')
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
ok(agent.includes('actionsPrompt()') && agent.includes('sanitizeProposal((raw as Record<string, unknown>).appAction)') && agent.includes('redactForAi(t.content)'), 'interactive agent: prompt + sanitized appAction + redacted context')
console.log(`test-ai-actions: ${n} passed`)
