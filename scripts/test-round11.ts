import assert from 'node:assert/strict'
import {
  buildKillCommand,
  buildLogCommand,
  buildServiceCommand,
  classifyToolError,
  clampLogLines,
  filterLogLines,
  filterProcesses,
  filterServices,
  forwardTargetHost,
  highlightSegments,
  isValidLogPath,
  isValidUnitName,
  logLevel,
  parseListenPorts,
  parseProcessList,
  parseServiceList,
  pushSample,
  sparklinePoints,
  suggestLocalPort,
  PROCESS_LIST_CMD,
  SERVICE_LIST_CMD,
  PORTS_CMD
} from '../src/shared/server-tools'

export const PS_FIXTURE = [
  '    1 root       0.0  0.1  11800 3-02:11:09 /sbin/init splash',
  '  812 mysql     12.5  9.8 812340    02:11:09 /usr/sbin/mysqld --daemonize',
  ' 4242 www-data  73.2  2.1  65432       11:09 nginx: worker process',
  ' 5150 ops        0.3  0.0   4096       00:05 bash -c echo 中文 ok',
  'garbage line'
].join('\n')

const procs = parseProcessList(PS_FIXTURE)
assert.equal(procs.length, 4)
assert.deepEqual(procs[2], { pid: 4242, user: 'www-data', cpu: 73.2, mem: 2.1, rssKb: 65432, etime: '11:09', command: 'nginx: worker process' })
assert.equal(procs[3].command, 'bash -c echo 中文 ok')
assert.deepEqual(filterProcesses(procs, '').map((p) => p.pid), [4242, 812, 5150, 1])
assert.deepEqual(filterProcesses(procs, '', 'mem').map((p) => p.pid), [812, 4242, 1, 5150])
assert.deepEqual(filterProcesses(procs, '', 'pid').map((p) => p.pid), [1, 812, 4242, 5150])
assert.deepEqual(filterProcesses(procs, 'NGINX').map((p) => p.pid), [4242])
assert.deepEqual(filterProcesses(procs, 'mysql').map((p) => p.pid), [812])
assert.deepEqual(filterProcesses(procs, '812').map((p) => p.pid), [812])
assert.equal(procs.length, 4, 'filter does not mutate')

assert.equal(buildKillCommand(4242, 'TERM'), 'kill -TERM 4242 2>&1')
assert.equal(buildKillCommand(4242, 'KILL', true), 'sudo -n kill -KILL 4242 2>&1')
assert.throws(() => buildKillCommand(1, 'TERM'), /invalid-pid/)
assert.throws(() => buildKillCommand('4242; rm -rf /', 'TERM'), /invalid-pid/)
assert.throws(() => buildKillCommand(4.5, 'TERM'), /invalid-pid/)
assert.throws(() => buildKillCommand(42, 'STOP; reboot'), /invalid-signal/)

export const SVC_FIXTURE = [
  'cron.service                 loaded active   running Regular background program processing daemon',
  '● nginx.service              loaded failed   failed  A high performance web server',
  'mysql.service                loaded inactive dead    MySQL Community Server',
  'systemd-journald.service     loaded active   running Journal Service',
  'user@1000.service            loaded active   running User Manager for UID 1000',
  'dev-sda.device loaded active plugged disk'
].join('\n')
const svcs = parseServiceList(SVC_FIXTURE)
assert.equal(svcs.length, 5)
assert.deepEqual(svcs[1], { unit: 'nginx.service', load: 'loaded', active: 'failed', sub: 'failed', description: 'A high performance web server' })
assert.deepEqual(filterServices(svcs, '', 'failed').map((s) => s.unit), ['nginx.service'])
assert.deepEqual(filterServices(svcs, '', 'running').length, 3)
assert.deepEqual(filterServices(svcs, '', 'inactive').map((s) => s.unit), ['mysql.service'])
assert.deepEqual(filterServices(svcs, 'journal').map((s) => s.unit), ['systemd-journald.service'])
assert.ok(isValidUnitName('user@1000.service') && isValidUnitName('systemd-fsck@dev-disk-by\\x2duuid.service'))
assert.ok(!isValidUnitName("nginx.service'; reboot; '") && !isValidUnitName('nginx') && !isValidUnitName('-x.service'))
assert.equal(buildServiceCommand('nginx.service', 'restart', true), "sudo -n systemctl restart -- 'nginx.service' 2>&1")
assert.match(buildServiceCommand('nginx.service', 'status'), /^LC_ALL=C SYSTEMD_COLORS=0 systemctl status --no-pager --lines=30 -- 'nginx.service' 2>&1$/)
assert.throws(() => buildServiceCommand('nginx.service', 'mask'), /invalid-action/)
assert.throws(() => buildServiceCommand('$(reboot).service', 'start'), /invalid-unit/)

export const SS_FIXTURE = [
  'tcp   LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*    users:(("systemd-resolve",pid=609,fd=14))',
  'tcp   LISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=900,fd=3))',
  'tcp   LISTEN 0      128             [::]:22           [::]:*    users:(("sshd",pid=900,fd=4))',
  'tcp   LISTEN 0      511                *:8080             *:*',
  'tcp   LISTEN 0      80         127.0.0.1:3306      0.0.0.0:*    users:(("mysqld",pid=812,fd=21))',
  'udp   UNCONN 0      0      127.0.0.53%lo:53        0.0.0.0:*    users:(("systemd-resolve",pid=609,fd=13))',
  'tcp   ESTAB  0      0          10.0.0.5:22      10.0.0.9:51234'
].join('\n')
const ports = parseListenPorts(SS_FIXTURE)
assert.deepEqual(
  ports.map((p) => `${p.proto} ${p.address}:${p.port} ${p.process ?? '-'}`),
  ['tcp :::22 sshd', 'tcp 0.0.0.0:22 sshd', 'tcp 127.0.0.53:53 systemd-resolve', 'udp 127.0.0.53:53 systemd-resolve', 'tcp 127.0.0.1:3306 mysqld', 'tcp 0.0.0.0:8080 -']
)
assert.equal(ports.find((p) => p.port === 3306)!.pid, 812)
const ns = parseListenPorts(
  [
    'Active Internet connections (only servers)',
    'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name',
    'tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      1234/nginx: master',
    'tcp6       0      0 :::443                  :::*                    LISTEN      1234/nginx: master',
    'udp        0      0 0.0.0.0:68              0.0.0.0:*                           700/dhclient'
  ].join('\n')
)
assert.deepEqual(ns.map((p) => `${p.proto} ${p.address}:${p.port} ${p.process}/${p.pid}`), ['udp 0.0.0.0:68 dhclient/700', 'tcp 0.0.0.0:80 nginx:/1234', 'tcp :::443 nginx:/1234'])
assert.deepEqual(parseListenPorts(''), [])
assert.equal(forwardTargetHost('0.0.0.0'), '127.0.0.1')
assert.equal(forwardTargetHost('::'), '127.0.0.1')
assert.equal(forwardTargetHost('10.0.0.5'), '10.0.0.5')
assert.equal(suggestLocalPort(22), 10022)
assert.equal(suggestLocalPort(3306), 3306)

assert.equal(clampLogLines(5), 10)
assert.equal(clampLogLines(99999), 2000)
assert.equal(clampLogLines(undefined), 200)
assert.ok(isValidLogPath('/var/log/nginx/error.log'))
assert.ok(!isValidLogPath('/var/log/../../etc/shadow') && !isValidLogPath("/var/log/x'; reboot") && !isValidLogPath('var/log/x') && !isValidLogPath('/var/log/a b'))
assert.equal(buildLogCommand({ source: 'file', path: '/var/log/syslog', lines: 100 }), "tail -n 100 -- '/var/log/syslog' 2>&1")
assert.equal(buildLogCommand({ source: 'unit', unit: 'nginx.service', lines: 50, sudo: true }), "sudo -n journalctl --no-pager -o short-iso -n 50 -u 'nginx.service' 2>&1")
assert.equal(buildLogCommand({ source: 'journal' }), 'journalctl --no-pager -o short-iso -n 200 2>&1')
assert.throws(() => buildLogCommand({ source: 'file', path: '/etc/../x' }), /invalid-path/)
assert.throws(() => buildLogCommand({ source: 'unit', unit: 'x' }), /invalid-unit/)
assert.throws(() => buildLogCommand({ source: 'shell' as 'file' }), /invalid-source/)

export const LOG_FIXTURE = [
  '2026-10-14T10:00:01+0800 web nginx[1]: started',
  '2026-10-14T10:00:02+0800 web nginx[1]: [warn] upstream response is buffered',
  '2026-10-14T10:00:03+0800 web nginx[1]: [error] connect() failed (111: Connection refused) while connecting to upstream',
  '',
  '2026-10-14T10:00:04+0800 web app[9]: 用户登录 ok'
].join('\n')
assert.equal(logLevel('connect() failed'), 'error')
assert.equal(logLevel('[warn] x'), 'warn')
assert.equal(logLevel('all good'), 'info')
assert.equal(filterLogLines(LOG_FIXTURE, { query: '' }).length, 4)
assert.equal(filterLogLines(LOG_FIXTURE, { query: 'UPSTREAM' }).length, 2)
assert.equal(filterLogLines(LOG_FIXTURE, { query: '', level: 'warn' }).length, 2)
assert.equal(filterLogLines(LOG_FIXTURE, { query: '', level: 'error' }).length, 1)
assert.equal(filterLogLines(LOG_FIXTURE, { query: '登录' }).length, 1)
assert.deepEqual(highlightSegments('Error: foo error', 'error'), [
  { text: 'Error', hit: true },
  { text: ': foo ', hit: false },
  { text: 'error', hit: true }
])
assert.deepEqual(highlightSegments('abc', ''), [{ text: 'abc', hit: false }])

assert.equal(sparklinePoints([], 100, 20), '')
assert.equal(sparklinePoints([0, 50, 100], 100, 20), '0,20 50,10 100,0')
assert.equal(sparklinePoints([150, -5], 10, 10), '0,0 10,10')
assert.equal(sparklinePoints([40], 100, 20), '0,12 100,12')
let hist: number[] = []
for (let i = 0; i < 70; i++) hist = pushSample(hist, i, 60)
assert.equal(hist.length, 60)
assert.equal(hist[0], 10)
assert.equal(hist[59], 69)

assert.equal(classifyToolError('sudo: a password is required'), 'sudo-password')
assert.equal(classifyToolError('System has not been booted with systemd as init system (PID 1). Can\'t operate.'), 'no-systemd')
assert.equal(classifyToolError('Failed to restart nginx.service: Access denied'), 'permission')
assert.equal(classifyToolError('kill: (999) - No such process'), 'not-found')
assert.equal(classifyToolError('all fine'), null)
for (const c of [PROCESS_LIST_CMD, SERVICE_LIST_CMD, PORTS_CMD]) assert.ok(!c.includes('\n'))
console.log('round11 ok')
