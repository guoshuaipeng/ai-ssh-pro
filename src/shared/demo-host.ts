/**
 * G1 demo host: a read-only, fully simulated Linux host so new users can try the app without a server.
 * Pure functions only (no Node / DOM) so the main process, the renderer and tests share them.
 */

export const DEMO_PROFILE_ID = 'demo-host'
export const DEMO_HOST = 'demo.ai-ssh-pro.local'
export const DEMO_USER = 'demo'
export const DEMO_SESSION_PREFIX = 'demo:'

export function isDemoSessionId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(DEMO_SESSION_PREFIX)
}

export const DEMO_PROMPT = '\x1b[32mdemo@demo-host\x1b[0m:\x1b[34m~\x1b[0m$ '

export function demoProfileLabel(locale: string): string {
  return locale === 'zh-CN' ? '演示主机 (demo)' : 'Demo host (demo)'
}

/** Unrenamed demo hosts follow the UI language. A user rename sets demoRenamed and wins. */
export function isUnrenamedDemo(profile: { id?: string; demoRenamed?: boolean }): boolean {
  return profile.id === DEMO_PROFILE_ID && !profile.demoRenamed
}

export function profileDisplayLabel(
  profile: { id: string; label?: string; host?: string; username?: string; demoRenamed?: boolean },
  locale: string
): string {
  if (isUnrenamedDemo(profile)) return demoProfileLabel(locale)
  const label = profile.label?.trim()
  if (label) return label
  if (profile.username && profile.host) return `${profile.username}@${profile.host}`
  return profile.host || '—'
}

/** Session export uses the current UI language for an unrenamed demo host. */
export function labelForSessionExport(profile: { id: string; label: string; demoRenamed?: boolean }, locale: string): string {
  return isUnrenamedDemo(profile) ? demoProfileLabel(locale) : profile.label
}

export const DEMO_WELCOME_ZH = '这是演示主机。你可以安全地试用终端、告警与剧本——不会连接真实服务器。'
export const DEMO_WELCOME_EN = 'This is a demo host. Try the terminal, alerts, and playbooks safely — no real server is contacted.'
export const DEMO_WELCOME_HINT_ZH = '在设置中可切换界面语言；欢迎语会随之更新。'
export const DEMO_WELCOME_HINT_EN = 'Switch UI language in Settings; this welcome text follows it.'

/** UX-41: demo banner follows the UI language. Other hosts get nothing from the client. */
export function demoWelcome(locale: string): string {
  const zh = locale === 'zh-CN' || locale === 'zh'
  const welcome = zh ? DEMO_WELCOME_ZH : DEMO_WELCOME_EN
  const hint = zh ? DEMO_WELCOME_HINT_ZH : DEMO_WELCOME_HINT_EN
  return `${welcome}\r\n${hint}\r\n`
}

export function demoWelcomeForProfile(profileId: string | undefined, locale: string): string | null {
  if (profileId !== DEMO_PROFILE_ID) return null
  return demoWelcome(locale)
}

export type DemoCommandResult = { output: string; code: number; clear?: boolean }

const FILES: Record<string, string> = {
  'readme.txt': 'This is the AI-SSH-Pro demo host.\nNothing here is real; try the toolbar buttons (Monitor, Toolbox, SFTP) too.\n',
  'deploy.sh': '#!/usr/bin/env bash\nset -e\ngit pull\nnpm ci\nsystemctl restart app\n',
  '/etc/os-release': 'NAME="Ubuntu"\nVERSION="22.04.4 LTS (Jammy Jellyfish)"\nID=ubuntu\nPRETTY_NAME="Ubuntu 22.04.4 LTS"\n',
  '/etc/hostname': 'demo-host\n',
  '/var/log/app.log': [
    '2026-10-14T09:58:01 app[2210]: listening on :8080',
    '2026-10-14T09:59:12 app[2210]: GET /api/health 200 3ms',
    '2026-10-14T10:00:03 app[2210]: ERROR connect ECONNREFUSED 127.0.0.1:6379 (redis)',
    '2026-10-14T10:00:04 app[2210]: retrying redis connection in 5s',
    ''
  ].join('\n')
}

const LS = 'app  backups  deploy.sh  logs  notes.txt  README.md  readme.txt'
const LS_LA = [
  'total 32',
  'drwxr-xr-x 6 demo demo 4096 Oct 14 09:30 .',
  'drwxr-xr-x 3 root root 4096 Oct  1 08:00 ..',
  '-rw-r--r-- 1 demo demo  220 Oct  1 08:00 .bashrc',
  'drwxr-xr-x 4 demo demo 4096 Oct 14 09:30 app',
  'drwxr-xr-x 2 demo demo 4096 Oct 13 23:00 backups',
  '-rwxr-xr-x 1 demo demo   78 Oct 12 18:21 deploy.sh',
  'drwxr-xr-x 2 demo demo 4096 Oct 14 10:00 logs',
  '-rw-r--r-- 1 demo demo   64 Oct 14 09:00 notes.txt',
  '-rw-r--r-- 1 demo demo  180 Oct 14 09:00 README.md',
  '-rw-r--r-- 1 demo demo  118 Oct  1 08:00 readme.txt'
].join('\n')

const DF_H = [
  'Filesystem      Size  Used Avail Use% Mounted on',
  '/dev/vda1        40G   20G   20G  50% /',
  '/dev/vdb1        99G   89G  9.9G  90% /data',
  'tmpfs           3.9G     0  3.9G   0% /dev/shm'
].join('\n')

const FREE_H = [
  '               total        used        free      shared  buff/cache   available',
  'Mem:           7.5Gi       2.8Gi       0.9Gi       1.0Mi       3.7Gi       5.6Gi',
  'Swap:          1.9Gi       0.5Gi       1.4Gi'
].join('\n')

const TOP = [
  'top - 10:02:11 up 1 day,  2:03,  1 user,  load average: 0.52, 0.40, 0.30',
  'Tasks: 142 total,   1 running, 141 sleeping,   0 stopped,   0 zombie',
  '%Cpu(s): 12.5 us,  3.1 sy,  0.0 ni, 84.0 id,  0.4 wa,  0.0 hi,  0.0 si',
  'MiB Mem :   7680.0 total,    921.4 free,   2867.2 used,   3891.4 buff/cache',
  '',
  '    PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND',
  '   4242 www-data  20   0   65432  21504  73.2   2.1   0:11.09 nginx',
  '    812 mysql     20   0  812340 770048  12.5   9.8 130:11.09 mysqld',
  '   2210 demo      20   0  998112 120320   4.0   1.5   3:02.44 node',
  '      1 root      20   0   11800   8192   0.0   0.1   0:02.11 systemd'
].join('\n')

const PS_AUX = [
  'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
  'root           1  0.0  0.1  11800  8192 ?        Ss   Oct13   0:02 /sbin/init',
  'mysql        812 12.5  9.8 812340 770048 ?       Ssl  Oct13 130:11 /usr/sbin/mysqld',
  'demo        2210  4.0  1.5 998112 120320 ?       Ssl  09:58   3:02 node /home/demo/app/server.js',
  'www-data    4242 73.2  2.1  65432 21504 ?        S    09:30   0:11 nginx: worker process'
].join('\n')

const NGINX_STATUS = [
  '● nginx.service - A high performance web server and a reverse proxy server',
  '     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)',
  '     Active: failed (Result: exit-code) since Tue 2026-10-14 09:59:40 UTC; 2min ago',
  '    Process: 3001 ExecStartPre=/usr/sbin/nginx -t -q -g daemon on; master_process on; (code=exited, status=1/FAILURE)',
  '',
  'Oct 14 09:59:40 demo-host nginx[3001]: nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)',
  'Oct 14 09:59:40 demo-host systemd[1]: nginx.service: Failed with result \'exit-code\'.'
].join('\n')

function helpText(): string {
  return [
    'Demo commands: ls, ls -la, pwd, whoami, hostname, uname -a, date, uptime, df -h, free -h,',
    'top, ps aux, systemctl status <unit>, cat <file>, echo <text>, clear, help.',
    'Try an error too, e.g. "cat /etc/shadow" or "systemctl status nginx", then click "Explain with AI".'
  ].join('\n')
}

/** Output for one line typed into the demo shell. Never executes anything. */
export function demoCommandOutput(line: string, now: Date = new Date()): DemoCommandResult {
  const cmd = line.trim().replace(/^sudo\s+/, '')
  if (!cmd) return { output: '', code: 0 }
  const [prog = '', ...args] = cmd.split(/\s+/)
  const arg = args.join(' ')
  switch (prog) {
    case 'help':
      return { output: helpText(), code: 0 }
    case 'clear':
      return { output: '', code: 0, clear: true }
    case 'ls':
    case 'll':
      return { output: prog === 'll' || /-\w*l/.test(arg) ? LS_LA : LS, code: 0 }
    case 'pwd':
      return { output: '/home/demo', code: 0 }
    case 'whoami':
      return { output: 'demo', code: 0 }
    case 'hostname':
      return { output: 'demo-host', code: 0 }
    case 'id':
      return { output: 'uid=1000(demo) gid=1000(demo) groups=1000(demo),27(sudo)', code: 0 }
    case 'uname':
      return { output: arg.includes('a') ? 'Linux demo-host 5.15.0-105-generic #115-Ubuntu SMP x86_64 GNU/Linux' : 'Linux', code: 0 }
    case 'date':
      return { output: now.toUTCString(), code: 0 }
    case 'uptime':
      return { output: ' 10:02:11 up 1 day,  2:03,  1 user,  load average: 0.52, 0.40, 0.30', code: 0 }
    case 'df':
      return { output: DF_H, code: 0 }
    case 'free':
      return { output: FREE_H, code: 0 }
    case 'top':
    case 'htop':
      return { output: TOP, code: 0 }
    case 'ps':
      return { output: PS_AUX, code: 0 }
    case 'echo':
      return { output: arg.replace(/^["']|["']$/g, ''), code: 0 }
    case 'cat':
    case 'tail':
    case 'less':
    case 'head': {
      const file = args.filter((a) => !a.startsWith('-')).pop() ?? ''
      if (!file) return { output: '', code: 0 }
      if (file === '/etc/shadow') return { output: `${prog}: /etc/shadow: Permission denied`, code: 1 }
      const body = FILES[file] ?? FILES[file.replace(/^~\//, '').replace(/^\/home\/demo\//, '')]
      if (body == null) return { output: `${prog}: ${file}: No such file or directory`, code: 1 }
      return { output: body.replace(/\n$/, ''), code: 0 }
    }
    case 'systemctl': {
      const unit = args.filter((a) => !a.startsWith('-')).slice(1).pop() ?? ''
      if (args[0] === 'status') {
        if (/^nginx(\.service)?$/.test(unit)) return { output: NGINX_STATUS, code: 3 }
        if (/^(mysql|cron|ssh)(\.service)?$/.test(unit)) {
          const u = unit.replace(/\.service$/, '')
          return { output: `● ${u}.service\n     Active: active (running) since Mon 2026-10-13 08:00:00 UTC; 1 day 2h ago`, code: 0 }
        }
        return { output: `Unit ${unit || '(none)'}.service could not be found.`, code: 4 }
      }
      if (['start', 'stop', 'restart', 'reload'].includes(args[0] ?? '')) {
        return { output: `Demo host: "${cmd}" was not executed (read-only).`, code: 0 }
      }
      return { output: SERVICES_TEXT, code: 0 }
    }
    case 'docker':
      return { output: 'bash: docker: command not found', code: 127 }
    case 'exit':
    case 'logout':
      return { output: 'Demo host: use the tab close button to end the session.', code: 0 }
    default:
      return { output: `bash: ${prog}: command not found`, code: 127 }
  }
}

// ---------- fixtures for the monitor / server toolbox (same formats the real probes return) ----------
const SERVICES_TEXT = [
  'cron.service                 loaded active   running Regular background program processing daemon',
  'mysql.service                loaded active   running MySQL Community Server',
  'nginx.service                loaded failed   failed  A high performance web server',
  'ssh.service                  loaded active   running OpenBSD Secure Shell server',
  'app.service                  loaded active   running Demo Node.js app'
].join('\n')

/** Answers the exec commands used by the resource monitor and the server toolbox. `tick` varies CPU a little. */
export function demoExecOutput(command: string, tick = 0): { stdout: string; code: number } {
  if (command.includes('/proc/loadavg')) {
    const busy = 40 + ((tick * 7) % 25)
    return {
      stdout: [
        '0.52 0.40 0.30 1/200 12345', '@@', '4', '@@',
        'cpu  100 0 100 800 0 0 0 0 0 0', `cpu  ${100 + busy} 0 100 ${800 + (100 - busy)} 0 0 0 0 0 0`, '@@',
        '              total        used        free      shared  buff/cache   available',
        'Mem:     8000000000  3000000000  1000000000        1000  4000000000  6000000000',
        'Swap:    2000000000   500000000  1500000000', '@@',
        'Filesystem     1024-blocks      Used Available Capacity Mounted on',
        '/dev/vda1         41152832  20576416  20576416      50% /',
        '/dev/vdb1        103081248  92773123  10308125      90% /data', '@@',
        '93784.12 300000.00', ''
      ].join('\n'),
      code: 0
    }
  }
  if (command.includes('ps -eo')) {
    return {
      stdout: [
        ' 4242 www-data  73.2  2.1  21504       11:09 nginx: worker process',
        '  812 mysql     12.5  9.8 770048 1-02:11:09 /usr/sbin/mysqld --daemonize',
        ' 2210 demo       4.0  1.5 120320    04:13:00 node /home/demo/app/server.js',
        '    1 root       0.0  0.1   8192 1-02:11:09 /sbin/init splash', ''
      ].join('\n'),
      code: 0
    }
  }
  if (command.includes('systemctl list-units')) return { stdout: SERVICES_TEXT + '\n', code: 0 }
  if (command.includes('ss -Htulnp')) {
    return {
      stdout: [
        'tcp   LISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=900,fd=3))',
        'tcp   LISTEN 0      511          0.0.0.0:8080      0.0.0.0:*    users:(("node",pid=2210,fd=19))',
        'tcp   LISTEN 0      80         127.0.0.1:3306      0.0.0.0:*    users:(("mysqld",pid=812,fd=21))', ''
      ].join('\n'),
      code: 0
    }
  }
  if (command.includes('systemctl status')) return { stdout: NGINX_STATUS + '\n', code: 3 }
  if (/(^|\s)(kill|systemctl (start|stop|restart|reload))\s/.test(command)) {
    return { stdout: 'Demo host: nothing was changed (read-only).\n', code: 0 }
  }
  if (command.includes('tail -n') || command.includes('journalctl')) return { stdout: FILES['/var/log/app.log']!, code: 0 }
  if (command.trim() === 'true') return { stdout: '', code: 0 }
  if (command.includes('uptime')) return { stdout: ' 10:02:11 up 1 day,  2:03,  1 user,  load average: 0.52, 0.40, 0.30\n', code: 0 }
  if (command.includes('docker')) return { stdout: 'bash: docker: command not found\n', code: 127 }
  const r = demoCommandOutput(command)
  return { stdout: r.output ? r.output + '\n' : '', code: r.code }
}

/** Directory listing for the demo SFTP view (read-only). Kept for callers that only need home. */
export const DEMO_FILES: ReadonlyArray<{ name: string; dir: boolean; size: number }> = [
  { name: 'app', dir: true, size: 4096 },
  { name: 'backups', dir: true, size: 4096 },
  { name: 'logs', dir: true, size: 4096 },
  { name: 'deploy.sh', dir: false, size: 78 },
  { name: 'readme.txt', dir: false, size: 118 },
  { name: 'README.md', dir: false, size: 180 },
  { name: 'notes.txt', dir: false, size: 64 }
]

/** UX-34: multi-directory simulated tree for demo SFTP. Keys are absolute POSIX paths. */
export type DemoFsEntry = { name: string; dir: boolean; size: number; content?: string }
export const DEMO_TREE: Record<string, ReadonlyArray<DemoFsEntry>> = {
  '/home/demo': [
    { name: 'README.md', dir: false, size: 180, content: 'AI-SSH-Pro demo host\nSimulated files — read only.\n' },
    { name: 'deploy.sh', dir: false, size: 78, content: '#!/usr/bin/env bash\nset -e\ngit pull\nnpm ci\nsystemctl restart app\n' },
    { name: 'notes.txt', dir: false, size: 64, content: 'Try Monitor, Toolbox and SFTP from the toolbar.\n' },
    { name: 'app', dir: true, size: 4096 },
    { name: 'backups', dir: true, size: 4096 },
    { name: 'logs', dir: true, size: 4096 }
  ],
  '/home/demo/app': [
    { name: 'config.yaml', dir: false, size: 92, content: 'port: 8080\nredis: 127.0.0.1:6379\n' },
    { name: 'app.log', dir: false, size: 120, content: 'listening on :8080\n' }
  ],
  '/home/demo/backups': [
    { name: 'dump-2026-10-01.sql', dir: false, size: 2048, content: '-- demo dump\n' }
  ],
  '/home/demo/logs': [
    { name: 'app.log', dir: false, size: 256, content: '2026-10-14 ERROR redis ECONNREFUSED\n' }
  ],
  '/etc/nginx': [
    { name: 'nginx.conf', dir: false, size: 220, content: 'worker_processes auto;\nevents { worker_connections 1024; }\n' },
    { name: 'sites-enabled', dir: true, size: 4096 }
  ],
  '/etc/nginx/sites-enabled': [
    { name: 'default', dir: false, size: 80, content: 'server { listen 80; root /var/www; }\n' }
  ],
  '/var/log': [
    { name: 'syslog', dir: false, size: 512, content: 'Oct 14 10:00:00 demo-host systemd[1]: Started.\n' },
    { name: 'nginx', dir: true, size: 4096 },
    { name: 'app.log', dir: false, size: 128, content: 'app started\n' }
  ],
  '/var/log/nginx': [
    { name: 'access.log', dir: false, size: 96, content: '127.0.0.1 - GET / 200\n' }
  ]
}

export function demoNormalizePath(path: string): string {
  let p = String(path || '').replace(/\\/g, '/').trim()
  if (!p || p === '~' || p === '.') return '/home/demo'
  if (p.endsWith('/') && p !== '/') p = p.replace(/\/+$/, '')
  return p
}

export function demoListDir(path: string): DemoFsEntry[] {
  const key = demoNormalizePath(path)
  return [...(DEMO_TREE[key] || [])]
}

export function demoReadFile(path: string): string | null {
  const p = demoNormalizePath(path)
  const idx = p.lastIndexOf('/')
  const parent = idx <= 0 ? '/' : p.slice(0, idx)
  const name = p.slice(idx + 1)
  const list = DEMO_TREE[parent] || []
  const hit = list.find((e) => e.name === name && !e.dir)
  return hit?.content ?? null
}

export function demoStat(path: string): { isDirectory: boolean; size: number } | null {
  const p = demoNormalizePath(path)
  if (DEMO_TREE[p] || p === '/home/demo') return { isDirectory: true, size: 4096 }
  const idx = p.lastIndexOf('/')
  const parent = idx <= 0 ? '/' : p.slice(0, idx)
  const name = p.slice(idx + 1)
  const hit = (DEMO_TREE[parent] || []).find((e) => e.name === name)
  if (!hit) return null
  return { isDirectory: hit.dir, size: hit.size }
}
