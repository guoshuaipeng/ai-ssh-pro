/**
 * W9: shipped read-only snippet templates and sample playbooks.
 * Opening a template does not run a remote command. 「另存为」 copies into the user library.
 */
import type { CommandSnippet } from './ipc'
import {
  isBuiltinPlaybookId,
  samplePlaybooks,
  saveAsPlaybook,
  type Playbook
} from './playbook'

export const BUILTIN_SNIPPET_PREFIX = 'builtin:snip:'

/** zh-CN first, English second — pick with pickBi / localizeBuiltin. */
export type BiText = readonly [zh: string, en: string]

export type BuiltinSnippet = {
  id: string
  title: BiText
  summary: BiText
  /** SN2: category (系统 / 磁盘 / 内存 / 进程 / 网络 / 日志 / Docker / 服务) */
  tag?: BiText
  body: string
  builtin: true
}

export type LocalizedBuiltinSnippet = CommandSnippet & {
  summary: string
  tag?: string
  builtin: true
}

export function pickBi(text: BiText, locale: string): string {
  return /^en\b/i.test(locale) ? text[1] : text[0]
}

export function localizeBuiltin(s: BuiltinSnippet, locale: string): LocalizedBuiltinSnippet {
  return {
    id: s.id,
    title: pickBi(s.title, locale),
    summary: pickBi(s.summary, locale),
    ...(s.tag ? { tag: pickBi(s.tag, locale) } : {}),
    body: s.body,
    builtin: true
  }
}

/** Bilingual labels. Bodies are read-only diagnostics — no secrets, no writes, no restarts or deletes.
 * SN2: each has a category tag; parameters use the {{name}} variables already used by snippets. */
export const BUILTIN_SNIPPETS: readonly BuiltinSnippet[] = [
  { id: 'builtin:snip:disk', tag: ['磁盘', 'Disk'], title: ['查看磁盘', 'Check disk'], summary: ['只读查看挂载占用，不删除文件', 'Read-only mount usage; does not delete files'], body: 'df -h', builtin: true },
  { id: 'builtin:snip:mem', tag: ['内存', 'Memory'], title: ['查看内存', 'Check memory'], summary: ['只读查看内存与交换分区', 'Read-only memory and swap'], body: 'free -h', builtin: true },
  { id: 'builtin:snip:listen', tag: ['网络', 'Network'], title: ['查看监听端口', 'Listening ports'], summary: ['只读列出监听中的套接字', 'Read-only list of listening sockets'], body: 'ss -lntup || netstat -lntup', builtin: true },
  { id: 'builtin:snip:uptime', tag: ['系统', 'System'], title: ['负载与运行时间', 'Load and uptime'], summary: ['查看运行时长、登录用户数与 1/5/15 分钟负载', 'Uptime, logged-in users and 1/5/15 min load'], body: 'uptime', builtin: true },
  { id: 'builtin:snip:os', tag: ['系统', 'System'], title: ['系统版本与内核', 'OS release and kernel'], summary: ['查看发行版信息与内核版本', 'Distribution release and kernel version'], body: 'cat /etc/os-release 2>/dev/null | head -n 4; uname -r', builtin: true },
  { id: 'builtin:snip:time', tag: ['系统', 'System'], title: ['时间与时区', 'Time and time zone'], summary: ['查看系统时间、时区与 NTP 同步状态', 'System time, time zone and NTP sync'], body: 'timedatectl 2>/dev/null || date', builtin: true },
  { id: 'builtin:snip:topcpu', tag: ['进程', 'Process'], title: ['CPU 占用前十的进程', 'Top 10 processes by CPU'], summary: ['按 CPU 占用排序列出前十个进程', 'Ten processes using the most CPU'], body: 'ps -eo pid,user,%cpu,%mem,etime,comm --sort=-%cpu | head -n 11', builtin: true },
  { id: 'builtin:snip:topmem', tag: ['内存', 'Memory'], title: ['内存占用前十的进程', 'Top 10 processes by memory'], summary: ['按内存占用排序列出前十个进程', 'Ten processes using the most memory'], body: 'ps -eo pid,user,%mem,rss,etime,comm --sort=-%mem | head -n 11', builtin: true },
  { id: 'builtin:snip:findproc', tag: ['进程', 'Process'], title: ['按名称查找进程', 'Find a process by name'], summary: ['列出命令行包含指定关键字的进程', 'Processes whose command line contains a keyword'], body: 'ps -ef | grep -i -- "{{keyword}}" | grep -v grep', builtin: true },
  { id: 'builtin:snip:dusort', tag: ['磁盘', 'Disk'], title: ['目录大小排序', 'Folder sizes, sorted'], summary: ['列出指定目录下一层子目录的大小（只读）', 'Size of each subfolder one level down (read-only)'], body: 'du -xh --max-depth=1 "{{dir}}" 2>/dev/null | sort -h | tail -n 20', builtin: true },
  { id: 'builtin:snip:bigfiles', tag: ['磁盘', 'Disk'], title: ['查找大文件', 'Find large files'], summary: ['在指定目录中查找大于 100M 的文件（只读）', 'Files larger than 100M under a folder (read-only)'], body: 'find "{{dir}}" -xdev -type f -size +100M -exec ls -lh {} + 2>/dev/null | sort -k5 -h | tail -n 20', builtin: true },
  { id: 'builtin:snip:inode', tag: ['磁盘', 'Disk'], title: ['inode 使用情况', 'Inode usage'], summary: ['查看各挂载点的 inode 占用', 'Inode usage per mount point'], body: 'df -i', builtin: true },
  { id: 'builtin:snip:iostat', tag: ['磁盘', 'Disk'], title: ['磁盘 IO', 'Disk I/O'], summary: ['采样 3 次查看磁盘读写与利用率', 'Disk throughput and utilisation, 3 samples'], body: 'iostat -xz 1 3 2>/dev/null || vmstat 1 3', builtin: true },
  { id: 'builtin:snip:openfiles', tag: ['进程', 'Process'], title: ['打开的文件数', 'Open file handles'], summary: ['查看系统已用与上限的文件句柄，以及当前会话上限', 'System file handles in use and limit, plus this shell\u2019s limit'], body: 'cat /proc/sys/fs/file-nr; ulimit -n', builtin: true },
  { id: 'builtin:snip:portwho', tag: ['网络', 'Network'], title: ['端口被谁占用', 'Who is using a port'], summary: ['查看占用指定端口的进程', 'Process bound to a given port'], body: 'ss -lntup | grep -w ":{{port}}" || lsof -i :{{port}}', builtin: true },
  { id: 'builtin:snip:curlhead', tag: ['网络', 'Network'], title: ['HTTP 连通性检查', 'HTTP reachability check'], summary: ['只请求响应头，查看状态码与耗时', 'Fetch headers only: status code and timing'], body: 'curl -sS -o /dev/null -I -w "%{http_code} %{time_total}s\\n" --max-time 10 "{{url}}"', builtin: true },
  { id: 'builtin:snip:dns', tag: ['网络', 'Network'], title: ['DNS 解析', 'DNS lookup'], summary: ['解析指定域名并显示所用的 DNS 服务器', 'Resolve a domain and show the resolver used'], body: 'getent hosts "{{domain}}"; grep -E "^nameserver" /etc/resolv.conf', builtin: true },
  { id: 'builtin:snip:route', tag: ['网络', 'Network'], title: ['路由与网卡地址', 'Routes and addresses'], summary: ['查看路由表与各网卡 IP', 'Routing table and interface addresses'], body: 'ip route; ip -brief addr', builtin: true },
  { id: 'builtin:snip:last', tag: ['日志', 'Logs'], title: ['最近登录记录', 'Recent logins'], summary: ['查看最近 20 次登录', 'Last 20 logins'], body: 'last -n 20 -a 2>/dev/null || last | head -n 20', builtin: true },
  { id: 'builtin:snip:syslog', tag: ['日志', 'Logs'], title: ['系统日志末尾', 'System log tail'], summary: ['查看最近 100 行系统日志', 'Last 100 lines of the system log'], body: 'journalctl -n 100 --no-pager 2>/dev/null || tail -n 100 /var/log/messages 2>/dev/null || tail -n 100 /var/log/syslog', builtin: true },
  { id: 'builtin:snip:journal', tag: ['日志', 'Logs'], title: ['服务日志（journalctl）', 'Service log (journalctl)'], summary: ['查看指定服务最近 200 行日志', 'Last 200 lines of a service log'], body: 'journalctl -u "{{service}}" -n 200 --no-pager', builtin: true },
  { id: 'builtin:snip:svcstatus', tag: ['服务', 'Service'], title: ['服务状态', 'Service status'], summary: ['查看指定服务的运行状态（不启停）', 'Status of a service (does not start or stop it)'], body: 'systemctl status "{{service}}" --no-pager', builtin: true },
  { id: 'builtin:snip:svcfailed', tag: ['服务', 'Service'], title: ['失败的服务', 'Failed services'], summary: ['列出启动失败的 systemd 单元', 'systemd units that failed'], body: 'systemctl --failed --no-pager', builtin: true },
  { id: 'builtin:snip:dockerps', tag: ['Docker', 'Docker'], title: ['容器列表', 'Containers'], summary: ['列出全部容器及状态', 'All containers and their status'], body: 'docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Image}}\\t{{.Ports}}"', builtin: true },
  { id: 'builtin:snip:dockerstats', tag: ['Docker', 'Docker'], title: ['容器资源占用', 'Container resource usage'], summary: ['一次性查看各容器 CPU 与内存', 'CPU and memory per container, one snapshot'], body: 'docker stats --no-stream', builtin: true },
  { id: 'builtin:snip:dockerlogs', tag: ['Docker', 'Docker'], title: ['容器日志末尾', 'Container log tail'], summary: ['查看指定容器最近 200 行日志', 'Last 200 log lines of a container'], body: 'docker logs --tail 200 "{{container}}"', builtin: true }
]

export type LibrarySeg = 'all' | 'builtin' | 'mine'

export function isBuiltinSnippetId(id: string): boolean {
  return id.startsWith(BUILTIN_SNIPPET_PREFIX)
}

export function builtinSnippetById(id: string): BuiltinSnippet | undefined {
  return BUILTIN_SNIPPETS.find((row) => row.id === id)
}

export function stripBuiltinSnippets<T extends { id: string }>(list: readonly T[]): T[] {
  return list.filter((row) => !isBuiltinSnippetId(row.id))
}

/** User-library copy. The built-in id is never reused, and the source object is not mutated. */
export function saveAsSnippet(
  source: { title: BiText | string; body: string },
  makeId: () => string,
  title?: string,
  locale = 'zh-CN'
): CommandSnippet {
  const base = typeof source.title === 'string' ? source.title : pickBi(source.title, locale)
  const suffix = /^en\b/i.test(locale) ? ' copy' : ' 副本'
  const name = (title?.trim() || `${base}${suffix}`).slice(0, 120)
  return { id: makeId(), title: name, body: source.body }
}

export function builtinPlaybooks(now = Date.now()): Playbook[] {
  return samplePlaybooks(now).map((playbook) => ({ ...playbook, builtin: true, sample: true }))
}

export function librarySeg<T extends { builtin?: boolean }>(rows: readonly T[], seg: LibrarySeg): T[] {
  if (seg === 'builtin') return rows.filter((row) => row.builtin)
  if (seg === 'mine') return rows.filter((row) => !row.builtin)
  return [...rows]
}

/** Preview / open never starts a remote command and never skips a confirm gate. */
export function builtinOpenPlan(): { remote: false; skipsConfirm: false; runs: false } {
  return { remote: false, skipsConfirm: false, runs: false }
}

export function builtinPlaybookById(id: string, now = Date.now()): Playbook | null {
  if (!isBuiltinPlaybookId(id)) return null
  return builtinPlaybooks(now).find((playbook) => playbook.id === id) ?? null
}

export { saveAsPlaybook }
