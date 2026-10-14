/**
 * v0.3.15 UX checks (UX-14c / 42 / 43 / 44 / 45): source-level gates plus pure helpers.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resourceLevel } from '../src/shared/resource-monitor'
import { filterProcesses, processDisplayName, type ProcInfo } from '../src/shared/server-tools'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const app = read('src/renderer/src/App.tsx')
assert.equal(app.includes('resourceOpen'), false, 'resourceOpen overlay state removed')
assert.equal(app.includes('serverToolsOpen'), false, 'serverToolsOpen overlay state removed')
assert.equal(app.includes('setResourceOpen'), false)
assert.equal(app.includes('setServerToolsOpen'), false)
assert.equal(app.includes('<ResourceMonitorModal'), true, 'embedded monitor remains')
assert.equal(app.includes('open={resourceOpen}'), false)
assert.equal(app.includes('open={serverToolsOpen}'), false)
assert.match(app, /kind === 'forward'/)
assert.match(app, /isDialogOpen\(\)/)
assert.match(app, /dlg\.finishFirst/)
assert.match(app, /openToolTabRef\.current\('toolbox', sid\)/)

const cmd = read('src/renderer/src/components/SessionCommandBar.tsx')
assert.match(cmd, /aiss\.cmdBarOpen/)
assert.match(cmd, /localStorage\.getItem\(CMD_BAR_OPEN_KEY\) === '1'/)
assert.match(cmd, /data-testid="cmd-bar-fab"/)
assert.equal(cmd.includes('session-command-clear'), false, 'clear history is not a standalone button')

const i18n = read('src/renderer/src/lib/i18n.tsx')
for (const s of [
  '打开工具箱',
  'Open toolbox',
  '强制结束 (kill -9)',
  'Force kill (kill -9)',
  '强制结束进程？',
  'Force-kill this process?',
  '强制结束 {name}',
  'Force kill {name}',
  '请先完成当前对话框',
  'Finish the current dialog first',
  '正在读取日志…',
  'Reading logs…',
  '展开命令栏',
  'Expand command bar'
]) {
  assert.ok(i18n.includes(s), 'missing i18n: ' + s)
}

const dialogs = read('src/renderer/src/lib/dialogs.tsx')
assert.match(dialogs, /export function isDialogOpen/)

assert.equal(resourceLevel(84.9), 'warn')
assert.equal(resourceLevel(85), 'bad')
assert.equal(resourceLevel(90), 'bad')
assert.equal(resourceLevel(70), 'warn')
assert.equal(resourceLevel(69.9), 'ok')

assert.equal(processDisplayName('nginx: worker process'), 'nginx')
assert.equal(processDisplayName('/usr/sbin/mysqld --datadir=/var'), 'mysqld')

const procs: ProcInfo[] = [
  { pid: 2, user: 'a', cpu: 1, mem: 1, rssKb: 1, etime: '1', command: 'zeta' },
  { pid: 1, user: 'a', cpu: 9, mem: 1, rssKb: 1, etime: '1', command: 'alpha' }
]
assert.deepEqual(filterProcesses(procs, '', 'name').map((p) => p.command), ['alpha', 'zeta'])

const rm = read('src/renderer/src/components/ResourceMonitorModal.tsx')
assert.match(rm, /resourceLevel/)
assert.match(rm, /height=\{h\}/)
assert.ok(rm.includes('const h = 64'), 'sparkline height')
assert.match(rm, /embedded \?/)

const st = read('src/renderer/src/components/ServerToolsModal.tsx')
assert.match(st, /st\.forceMenu/)
assert.match(st, /st\.forceOk/)
assert.match(st, /st\.reading/)
assert.equal(st.includes('st.sortBy'), false, 'sort dropdown removed')

const css = read('src/renderer/src/styles.css')
assert.match(css, /\.terminal-pane-wrap[\s\S]*padding:\s*8px 12px/)

console.log('test-round15 ok')
