// c62: UI E2E table for AI actions. One row per ActionDef (test-ai-action-standard checks the
// rows match AI_ACTIONS). `--ai-table` runs, for every row:
//   - the generated standard scenarios: missing params, cancel, and (risky rows) the armed first confirm;
//     each also feeds secret params and checks they never reach the card;
//   - the row's named real-result scenarios (normal + error), which click confirm and read back
//     storage / UI / audit.
export const AI_E2E_TABLE = [
  { action: 'connection.add', required: 2, sample: { host: '10.9.8.90', username: 'ops' }, normal: ['e2e-ai-conn'], error: ['e2e-err-missing'] },
  { action: 'monitor.configure', required: 2, uiInvalid: 1, uiInvalidWhy: 'the metric select is rendered with its first option', sample: { metric: 'cpu', threshold: '88' }, normal: ['e2e-monitor'], error: [], noErrorPath: 'a local rule update has no failure branch; missing/cancel are generated' },
  { action: 'sftp.open', required: 1, sample: { target: 'demo', path: '/var/log' }, normal: ['e2e-sftp'], error: ['e2e-err-notfound'] },
  { action: 'snippet.create', required: 2, sample: { title: 'std', command: 'ls' }, normal: ['e2e-snippet-dbl'], error: ['e2e-err-cancel-click'], noErrorPath: 'saving a snippet has no failure branch; cancel-then-click is the error-style path' },
  { action: 'forward.create', required: 2, sample: { localPort: '18080', remotePort: '80' }, normal: ['e2e-forward-ok'], error: ['e2e-err-nosession-fwd', 'e2e-forward'] },
  { action: 'connection.open', required: 1, sample: { targets: 'demo' }, risky: { targets: 'demo-web-01, e2e-web-77, demo-mysql' }, normal: ['e2e-open-batch'], error: ['e2e-err-armed-cancel'] },
  { action: 'history.fill', required: 1, sample: { query: 'nginx' }, normal: ['e2e-hist', 'term-cmd-explain', 'term-cmd-explain-n'], error: ['e2e-err-nosession-hist'] },
  { action: 'playbook.create', required: 2, sample: { name: 'std-pb', commands: 'uptime' }, normal: ['e2e-playbook'], error: ['e2e-err-pb-missing'] },
  { action: 'sftp.transfer', required: 4, uiInvalid: 3, uiInvalidWhy: 'the direction select is rendered with its first option, so the card marks 3 fields', sample: { target: 'demo', direction: 'download', remotePath: '/etc/hosts', localPath: 'C:\\aiss-std\\hosts' }, risky: { target: 'demo', direction: 'upload', remotePath: '/tmp/x', localPath: 'C:\\aiss-std\\x' }, normal: ['e2e-xfer-dl', 'e2e-xfer-ok-dl', 'e2e-xfer-ok-ul'], error: ['e2e-xfer-ul-armed', 'e2e-err-xfer-badpath'] },
  { action: 'batch.prefill', required: 2, sample: { targets: 'demo', command: 'uptime' }, risky: { targets: 'demo', command: 'uptime' }, normal: ['e2e-batch-prefill'], error: ['e2e-err-batch-notfound'] },
  { action: 'monitor.open', required: 1, sample: { target: 'demo' }, normal: ['e2e-monitor-open'], error: ['e2e-err-monitor-notfound'] },
  { action: 'playbook.fromRecent', required: 1, sample: { name: 'std-recent' }, normal: ['e2e-pb-recent'], error: ['e2e-err-pb-recent-empty'] },
  { action: 'alert.explain', required: 0, sample: { target: 'web-01' }, normal: ['e2e-alert-explain'], error: ['e2e-err-alert-notfound'] },
  { action: 'connection.organize', required: 1, sample: { target: 'demo', label: 'x' }, normal: ['e2e-conn-organize'], error: ['e2e-err-org-demo'] }
]

const LEAK = { password: 'P@ss-leak-1', passphrase: 'P@ss-leak-1', token: 'tk-leak-1', privateKeyPath: 'C:/leak/id_rsa' }
const click = (id) => ({ eval: `[...document.querySelectorAll('[data-testid=${id}]')].pop()?.click(); 'x'` })
const open = [{ op: 'aiChat', empty: true }, { op: 'aiChat', empty: true }]
const slug = (a) => a.replace(/\./g, '-').replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

/** expr: JS boolean using card, ph, act, inv, armed, vals, aud (audit lines of this action since the scenario began). */
function expectFor(action, expr) {
  return `(async()=>{const card=[...document.querySelectorAll('[data-testid=ai-action-card]')].pop();const ph=card?.dataset.phase;const act=card?.dataset.action;const inv=card?card.querySelectorAll('[aria-invalid=true]').length:-1;const armed=!!card?.querySelector('[data-testid=ai-action-armed]');const vals=card?[...card.querySelectorAll('input,textarea')].map(i=>i.value).join('|'):'';const leak=/leak/.test(vals)||/leak/.test(card?.textContent||'');const aud=JSON.parse(localStorage.getItem('aiss.audit.v1')||'[]').filter(e=>e.at>=window.__e2eT0&&e.type==='ai.action'&&e.detail.startsWith(${JSON.stringify(action)})).length;const r=act===${JSON.stringify(action)}&&!leak&&(${expr});return r||JSON.stringify({act,ph,inv,armed,aud,leak})})()`
}

/** Generated scenarios. probe=true makes each one expect something false, so it must fail. */
export function stdAiScenarios(probe = false) {
  const out = []
  for (const row of AI_E2E_TABLE) {
    const s = slug(row.action)
    if (row.required > 0) {
      out.push({ name: `e2e-std-${s}-missing`, e2e: true, wait: 300, steps: [...open, { op: 'aiAction', name: row.action, params: { ...LEAK }, ask: 'e2e', say: 'e2e' }, click('ai-action-confirm')], expect: expectFor(row.action, `ph==='editing'&&inv===${(row.uiInvalid ?? row.required) + (probe ? 1 : 0)}&&aud===0`) })
    }
    out.push({ name: `e2e-std-${s}-cancel`, e2e: true, wait: 300, steps: [...open, { op: 'aiAction', name: row.action, params: { ...row.sample, ...LEAK }, ask: 'e2e', say: 'e2e' }, click('ai-action-cancel'), click('ai-action-confirm'), click('ai-action-confirm')], expect: expectFor(row.action, `ph===${probe ? "'done'" : "'cancelled'"}&&aud===0`) })
    if (row.risky) {
      out.push({ name: `e2e-std-${s}-armed`, e2e: true, wait: 300, steps: [...open, { op: 'aiAction', name: row.action, params: { ...row.risky, ...LEAK }, ask: 'e2e', say: 'e2e' }, click('ai-action-confirm')], expect: expectFor(row.action, `ph==='editing'&&${probe ? '!' : ''}armed&&aud===0`) })
    }
  }
  return out
}

/** Every scenario name --ai-table runs: generated first, then each row's named ones. */
export function aiTableScenarioNames() {
  return [...stdAiScenarios().map((x) => x.name), ...AI_E2E_TABLE.flatMap((r) => [...r.normal, ...r.error])]
}
