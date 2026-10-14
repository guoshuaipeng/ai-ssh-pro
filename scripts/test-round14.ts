/** v0.3.14: tool tabs, toolbar minimal, connection placeholder, AI layout defaults, UX-25 IP check. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let n = 0
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg)
  n++
}

const root = join(import.meta.dirname, '..')
const app = readFileSync(join(root, 'src/renderer/src/App.tsx'), 'utf8')
const conn = readFileSync(join(root, 'src/renderer/src/components/ConnectionConfigModal.tsx'), 'utf8')
const layout = readFileSync(join(root, 'src/renderer/src/lib/layout-prefs.ts'), 'utf8')
const toolbar = readFileSync(join(root, 'src/renderer/src/components/AppToolbar.tsx'), 'utf8')
const aipanel = readFileSync(join(root, 'src/renderer/src/components/AIPanel.tsx'), 'utf8')
const modal = readFileSync(join(root, 'src/renderer/src/components/Modal.tsx'), 'utf8')
const checkUx = readFileSync(join(root, 'scripts/check-ux.ts'), 'utf8')

ok(app.includes("| 'monitor'") && app.includes("| 'toolbox'"), 'TabView has monitor/toolbox')
ok(app.includes('openToolTab') || app.includes('openToolTabRef'), 'openToolTab present')
ok(modal.includes('embedded?: boolean'), 'Modal supports embedded')
ok(conn.includes('192.0.2.10') && !conn.includes('172.19.161.225'), 'UX-25 doc IP placeholder')
ok(checkUx.includes('UX-25'), 'check-ux has IP rule')
ok(layout.includes('aiWidth: 320') && layout.includes('AI_MIN = 280'), 'UX-26 ai width defaults')
ok(/showAi:\s*false/.test(layout), 'UX-26 showAi default false')
ok(aipanel.includes('ai-empty-state') || aipanel.includes('ai.emptyTitle'), 'UX-26 empty state')
ok(!toolbar.includes("id: 'portForward'") || toolbar.indexOf('OPS_BUTTONS') < 0, 'toolbar check')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsEnd = toolbar.indexOf(']', opsStart)
const ops = toolbar.slice(opsStart, opsEnd)
ok(ops.includes('resourceMonitor') && ops.includes('serverTools') && ops.includes('sftp'), 'minimal ops present')
ok(!ops.includes('portForward') && !ops.includes('batchExec') && !ops.includes('snippets'), 'forward/batch/snippets not in default ops')
ok(app.includes("t.view === 'monitor'") && app.includes('embedded'), 'monitor tab render')

console.log(`test-round14 ok: ${n} checks`)
