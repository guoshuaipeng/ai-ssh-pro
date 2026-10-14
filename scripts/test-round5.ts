import assert from 'node:assert/strict'
import {
  SHORTCUTS,
  extractSnippetVars,
  fillSnippetVars,
  filterSnippets,
  formatBatchReport,
  searchTokens
} from '../src/shared/workspace-features'

assert.deepEqual(extractSnippetVars('tail -n {{lines}} {{ file }} && echo {{lines}}'), ['lines', 'file'])
assert.deepEqual(extractSnippetVars('echo {{}} {{1bad}} ${HOME}'), [])
assert.equal(fillSnippetVars('tail -n {{lines}} {{file}}', { lines: '50', file: '/var/log/syslog' }), 'tail -n 50 /var/log/syslog')
assert.equal(fillSnippetVars('echo {{a}} {{b}}', { a: '1' }), 'echo 1 {{b}}')
assert.equal(fillSnippetVars('echo {{a}}', { a: '$1' }), 'echo $1', 'replacement must be literal')

const snips = [
  { title: '磁盘', body: 'df -h' },
  { title: 'Docker logs', body: 'docker logs -f {{name}}' },
  { title: 'nginx reload', body: 'sudo nginx -s reload' }
]
assert.equal(filterSnippets(snips, '').length, 3)
assert.deepEqual(filterSnippets(snips, 'DOCKER').map((s) => s.title), ['Docker logs'])
assert.deepEqual(filterSnippets(snips, 'nginx sudo').map((s) => s.title), ['nginx reload'])
assert.equal(filterSnippets(snips, 'nginx docker').length, 0)

assert.deepEqual(searchTokens('  Web   OPS '), ['web', 'ops'])

const report = formatBatchReport({
  command: 'uptime',
  startedAt: 0,
  results: [
    { sessionId: 'a', label: 'demo-web-01', host: '10.0.0.11', port: 22, username: 'ops', ok: true, code: 0, stdout: 'up 3 days\n', stderr: '', elapsedMs: 42 },
    { sessionId: 'b', label: 'demo-db', host: '10.0.1.21', port: 22, username: 'dba', ok: false, code: null, stdout: '', stderr: '', error: 'timeout', elapsedMs: 20000, timedOut: true }
  ]
})
assert.match(report, /^# uptime/)
assert.match(report, /== demo-web-01 \(ops@10\.0\.0\.11:22\) OK exit=0 42ms/)
assert.match(report, /up 3 days/)
assert.match(report, /demo-db .* FAILED .*error=timeout/)

assert.equal(new Set(SHORTCUTS.map((s) => s.id)).size, SHORTCUTS.length)
console.log('round5 ok')
