// c62: tests GENERATED from the ActionDef table. Adding an action to AI_ACTIONS makes it go
// through every check below; the only per-action input is one valid sample (SAMPLES).
import { readFileSync } from 'node:fs'
import {
  AI_ACTIONS, SECRET_KEY_RE, actionsPrompt, auditForAction, cardReducer, initialValues, isRiskyAction,
  missingFields, runAction, sanitizeProposal, type ActionDef, type CardState
} from '../src/shared/ai-actions'
import { createCommandBus, type CommandInput } from '../src/shared/command-bus'
import type { SavedSessionProfile } from '../src/shared/ipc'

let n = 0
const ok = (c: unknown, m: string) => { if (!c) throw new Error('AssertionError: ' + m); n++ }

/** One valid value set per action (the card would accept it and every pre-check passes). */
const SAMPLES: Record<string, Record<string, string>> = {
  'connection.add': { host: '10.0.0.9', username: 'ops', port: '22', auth: 'key' },
  'monitor.configure': { metric: 'cpu', threshold: '85', sustainMin: '5', enabled: 'on' },
  'sftp.open': { target: 'web-01', path: '/var/log' },
  'snippet.create': { title: 'disk', command: 'df -h' },
  'forward.create': { localPort: '8080', remoteHost: '127.0.0.1', remotePort: '80' },
  'connection.open': { targets: 'web-01' },
  'history.fill': { query: 'nginx' },
  'playbook.create': { name: 'pb', commands: 'uptime; df -h' },
  'sftp.transfer': { target: 'web-01', direction: 'download', remotePath: '/etc/hosts', localPath: '/tmp/hosts' },
  'batch.prefill': { targets: 'web-01, web-02', command: 'uptime' },
  'monitor.open': { target: 'web-01' },
  'playbook.fromRecent': { name: 'recent' },
  'alert.explain': { target: 'web-01' },
  'connection.organize': { target: 'web-01', folder: 'Prod' }
}
const P = (id: string, label: string, extra: Partial<SavedSessionProfile> = {}): SavedSessionProfile => ({ id, label, host: label + '.lan', port: 22, username: 'u', ...extra })
const PROFILES = [P('1', 'web-01'), P('2', 'web-02'), P('3', 'web-03'), P('4', 'web-04'), P('d', 'demo-box', { demo: true })]
const t = (k: string, vars?: Record<string, string | number>) => (vars ? `${k}:${JSON.stringify(vars)}` : k)

type Harness = { calls: CommandInput[]; audits: string[]; run: (v: Record<string, string>, opts?: { session?: string | null; result?: { ok: boolean; message?: string }; noHandler?: boolean }) => Promise<{ ok: boolean; message?: string }> }
function harness(def: ActionDef): Harness {
  const calls: CommandInput[] = []
  const audits: string[] = []
  return {
    calls,
    audits,
    run: async (v, opts = {}) => {
      const bus = createCommandBus()
      if (!opts.noHandler) bus.register(def.command, (input) => { calls.push(input); return opts.result ?? { ok: true, message: 'done' } })
      const ctx = { bus, profiles: PROFILES, activeSessionId: opts.session === undefined ? 's1' : opts.session, t }
      // --probe-fail: run twice, so the run-once / audit-once checks must fail
      if (process.argv.includes('--probe-fail')) await runAction(def.name, v, ctx)
      const r = await runAction(def.name, v, ctx)
      audits.push(auditForAction(def.name, v, r).detail) // App appends exactly one audit line per confirmed run
      return r
    }
  }
}
/** Drive the card like a user: confirm (twice when the rule says so), then run once. */
async function confirmFlow(def: ActionDef, values: Record<string, string>, h: Harness) {
  let s: CardState = { phase: 'editing', values, showMissing: false }
  s = cardReducer(def, s, { type: 'confirm' })
  const armedFirst = Boolean(s.armed)
  if (armedFirst) s = cardReducer(def, s, { type: 'confirm' })
  if (s.phase === 'running') {
    const again = cardReducer(def, s, { type: 'confirm' }) // double click while running
    ok(again === s, `${def.name}: confirm while running is ignored`)
    const r = await h.run(values)
    s = cardReducer(def, s, { type: 'finish', ok: r.ok, message: r.message })
    ok(cardReducer(def, s, { type: 'confirm' }).phase === s.phase || s.phase === 'error', `${def.name}: done card cannot run again`)
  }
  return { s, armedFirst }
}

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(Object.keys(SAMPLES).sort().join() === AI_ACTIONS.map((a) => a.name).sort().join(), 'every action has exactly one sample (add one when adding an action)')

async function main() {
for (const def of AI_ACTIONS) {
  const sample = { ...initialValues(def, {}), ...SAMPLES[def.name] }
  const keys = def.fields.map((f) => f.key)
  // config sanity
  ok(app.includes(`bus.register('${def.command}'`), `${def.name}: command ${def.command} is registered on the app bus`)
  ok(Object.values(def.args).every((k) => keys.includes(k)), `${def.name}: every arg maps to a field`)
  ok(!def.target || keys.includes(def.target.field), `${def.name}: target field exists`)
  ok((def.checks ?? []).every((c) => !c.field || keys.includes(c.field)), `${def.name}: check fields exist`)
  ok(missingFields(def, sample).length === 0, `${def.name}: sample is complete`)

  // 1 secrets: never accepted from the model, never in the prompt, never in the audit
  const leaky = { ...SAMPLES[def.name], password: 'P@ss-1', passphrase: 'pp', token: 'tk', privateKeyPath: 'C:/k', apiSecret: 's' }
  const sp = sanitizeProposal({ name: def.name, params: leaky })!
  ok(sp && Object.keys(sp.params).every((k) => !SECRET_KEY_RE.test(k)) && !JSON.stringify(sp).includes('P@ss-1'), `${def.name}: secret params stripped`)
  ok(def.fields.filter((f) => f.type === 'secret').every((f) => initialValues(def, { [f.key]: 'x' })[f.key] === ''), `${def.name}: secret fields start empty`)
  const line = actionsPrompt().split('\n').find((l) => l.startsWith(`- ${def.name}:`)) ?? ''
  const promptKeys = (line.match(/params \{ (.*) \}$/)?.[1] ?? '').split(', ').filter(Boolean).map((p) => p.split(/[*=]/)[0])
  ok(line && def.fields.filter((f) => f.type === 'secret').every((f) => !promptKeys.includes(f.key)) && promptKeys.every((k) => !SECRET_KEY_RE.test(k)), `${def.name}: prompt lists no secret field`)
  ok(!auditForAction(def.name, { ...sample, password: 'P@ss-1', privateKeyPath: 'C:/k' }, { ok: true }).detail.includes('P@ss-1'), `${def.name}: audit never carries secrets`)

  // 2 missing params: card stays open, nothing runs, no audit
  const req = def.fields.filter((f) => f.required && (!f.showIf || f.showIf({})))
  if (req.length) {
    const h = harness(def)
    const { s } = await confirmFlow(def, initialValues(def, {}), h)
    ok(s.phase === 'editing' && s.showMissing && h.calls.length === 0 && h.audits.length === 0, `${def.name}: missing ${req.map((f) => f.key)} -> asks, no run, no audit`)
  }

  // 3 cancel: nothing runs, a later confirm is ignored
  {
    const h = harness(def)
    let s: CardState = cardReducer(def, { phase: 'editing', values: sample, showMissing: false }, { type: 'cancel' })
    s = cardReducer(def, s, { type: 'confirm' })
    ok(s.phase === 'cancelled' && h.calls.length === 0 && h.audits.length === 0, `${def.name}: cancel -> no run, no audit`)
  }

  // 4+5+6 happy path: second confirm only when risky; command runs exactly once; one audit line
  {
    const h = harness(def)
    const { s, armedFirst } = await confirmFlow(def, sample, h)
    ok(armedFirst === isRiskyAction(def, sample), `${def.name}: second confirm iff the risk rule says so`)
    ok(s.phase === 'done' && h.calls.length === 1 && h.audits.length === 1, `${def.name}: runs once, audits once`)
    const c = h.calls[0]!
    ok(Object.keys(c.args).sort().join() === Object.keys(def.args).sort().join(), `${def.name}: command gets exactly the mapped args`)
    ok(!def.target || c.profiles.length >= 1, `${def.name}: command gets resolved profile(s)`)
  }
  if (def.risk && !('always' in def.risk)) {
    const rk = def.risk
    const risky = { ...sample, [rk.field]: 'equals' in rk ? rk.equals : PROFILES.slice(0, rk.listAtLeast).map((p) => p.label).join(', ') }
    const h = harness(def)
    const { s, armedFirst } = await confirmFlow(def, risky, h)
    ok(armedFirst && s.phase === 'done' && h.calls.length === 1 && h.audits.length === 1, `${def.name}: risky variant needs a second confirm, then runs once`)
    const h2 = harness(def)
    let s2: CardState = cardReducer(def, { phase: 'editing', values: risky, showMissing: false }, { type: 'confirm' })
    s2 = cardReducer(def, s2, { type: 'cancel' })
    ok(s2.phase === 'cancelled' && h2.calls.length === 0, `${def.name}: cancel while armed -> nothing runs`)
  }

  // 7 failure paths: each pre-condition stops before the command and still audits once
  {
    const h = harness(def)
    const r = await h.run(sample, { result: { ok: false, message: 'boom' } })
    ok(!r.ok && r.message === 'boom' && h.audits.length === 1 && h.audits[0]!.endsWith(' · boom'), `${def.name}: command failure is reported and audited`)
    const r2 = await h.run(sample, { noHandler: true })
    ok(!r2.ok && r2.message === 'aa.noExecutor', `${def.name}: unregistered command -> noExecutor`)
  }
  if (def.requires === 'activeSession') {
    const h = harness(def)
    const r = await h.run(sample, { session: null })
    ok(!r.ok && r.message === 'aa.noSession' && h.calls.length === 0, `${def.name}: no session -> noSession, command not called`)
  }
  if (def.target) {
    const h = harness(def)
    const r = await h.run({ ...sample, [def.target.field]: 'no-such-host' })
    ok(!r.ok && r.message!.startsWith('aa.noTarget') && h.calls.length === 0, `${def.name}: unknown target -> noTarget, command not called`)
    if (def.target.notDemoKey) {
      const r3 = await h.run({ ...sample, [def.target.field]: 'demo-box' })
      ok(!r3.ok && r3.message === def.target.notDemoKey && h.calls.length === 0, `${def.name}: demo host refused`)
    }
  }
  for (const c of def.checks ?? []) {
    const h = harness(def)
    const broken = { ...sample, ...(c.field ? { [c.field]: c.validator === 'nonEmpty' ? ' ' : '../x' } : { remotePath: 'relative/../x' }) }
    const r = await h.run(broken)
    ok(!r.ok && r.message === c.messageKey && h.calls.length === 0, `${def.name}: check ${c.validator} fails -> ${c.messageKey}, command not called`)
  }
}
}
main().then(() => console.log(`test-ai-action-standard: ${n} passed (${AI_ACTIONS.length} actions)`)).catch((e) => { console.error(e); process.exit(1) })
