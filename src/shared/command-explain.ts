/**
 * Offline command explainer: breaks a shell line into segments (| && || ;) and describes
 * each program and its common flags in Chinese / English. No network, no model call.
 */
import { assessCommandRisk, type RiskReasonKey } from './command-risk'

type Text = [zh: string, en: string]
type Entry = { d: Text; f?: Record<string, Text> }

const DB: Record<string, Entry> = {
  ls: { d: ['列出目录内容', 'List directory contents'], f: { l: ['长格式（权限/大小/时间）', 'long format (perms/size/time)'], a: ['包含隐藏文件', 'include hidden files'], h: ['人类可读的大小', 'human-readable sizes'], t: ['按修改时间排序', 'sort by modification time'], r: ['逆序', 'reverse order'], R: ['递归子目录', 'recurse into subdirectories'], S: ['按大小排序', 'sort by size'] } },
  cd: { d: ['切换当前目录', 'Change the current directory'] },
  pwd: { d: ['显示当前目录', 'Print the current directory'] },
  cat: { d: ['输出文件内容', 'Print file contents'], f: { n: ['显示行号', 'number lines'] } },
  less: { d: ['分页查看文件', 'View a file page by page'] },
  head: { d: ['查看文件开头', 'Show the beginning of a file'], f: { n: ['指定行数', 'number of lines'] } },
  tail: { d: ['查看文件末尾', 'Show the end of a file'], f: { f: ['持续跟踪新内容', 'follow new output'], n: ['指定行数', 'number of lines'], F: ['跟踪并在文件轮转后重新打开', 'follow and reopen after rotation'] } },
  grep: { d: ['按模式搜索文本', 'Search text by pattern'], f: { i: ['忽略大小写', 'ignore case'], r: ['递归目录', 'recurse directories'], R: ['递归目录（跟随链接）', 'recurse, following symlinks'], n: ['显示行号', 'show line numbers'], v: ['反向匹配', 'invert match'], E: ['扩展正则', 'extended regex'], c: ['只输出匹配数', 'count matches only'], l: ['只列出文件名', 'list file names only'], w: ['整词匹配', 'match whole words'] } },
  find: { d: ['按条件查找文件', 'Find files by conditions'] },
  rm: { d: ['删除文件或目录', 'Remove files or directories'], f: { r: ['递归删除目录', 'remove directories recursively'], R: ['递归删除目录', 'remove directories recursively'], f: ['强制，不提示', 'force, no prompts'], i: ['逐个确认', 'prompt before each removal'], v: ['显示过程', 'verbose'] } },
  cp: { d: ['复制文件或目录', 'Copy files or directories'], f: { r: ['递归复制目录', 'copy directories recursively'], a: ['归档模式（保留属性）', 'archive mode (keep attributes)'], v: ['显示过程', 'verbose'], f: ['强制覆盖', 'force overwrite'] } },
  mv: { d: ['移动或重命名', 'Move or rename'], f: { f: ['强制覆盖', 'force overwrite'], i: ['覆盖前确认', 'prompt before overwrite'], v: ['显示过程', 'verbose'] } },
  mkdir: { d: ['创建目录', 'Create directories'], f: { p: ['自动创建父目录', 'create parent directories'] } },
  touch: { d: ['创建空文件或更新时间戳', 'Create an empty file or update timestamps'] },
  chmod: { d: ['修改文件权限', 'Change file permissions'], f: { R: ['递归', 'recursive'] } },
  chown: { d: ['修改文件属主', 'Change file owner'], f: { R: ['递归', 'recursive'] } },
  ln: { d: ['创建链接', 'Create links'], f: { s: ['符号链接', 'symbolic link'], f: ['覆盖已存在的目标', 'replace existing target'] } },
  df: { d: ['查看磁盘空间', 'Show disk space usage'], f: { h: ['人类可读的大小', 'human-readable sizes'], T: ['显示文件系统类型', 'show filesystem type'], i: ['显示 inode 使用', 'show inode usage'] } },
  du: { d: ['统计目录占用空间', 'Estimate directory space usage'], f: { h: ['人类可读的大小', 'human-readable sizes'], s: ['只显示总计', 'summary only'], a: ['包含文件', 'include files'] } },
  free: { d: ['查看内存使用', 'Show memory usage'], f: { h: ['人类可读', 'human-readable'], m: ['以 MB 显示', 'in MB'], g: ['以 GB 显示', 'in GB'] } },
  top: { d: ['实时查看进程与负载', 'Live view of processes and load'] },
  htop: { d: ['交互式进程查看器', 'Interactive process viewer'] },
  ps: { d: ['列出进程', 'List processes'], f: { e: ['所有进程', 'all processes'], f: ['完整格式', 'full format'], a: ['所有终端的进程', 'processes of all terminals'], u: ['面向用户的格式', 'user-oriented format'], x: ['包含无终端进程', 'include processes without a tty'] } },
  kill: { d: ['向进程发送信号', 'Send a signal to a process'], f: { '9': ['SIGKILL 强制结束', 'SIGKILL, force kill'], '15': ['SIGTERM 正常结束', 'SIGTERM, graceful stop'] } },
  killall: { d: ['按名称结束进程', 'Kill processes by name'] },
  pkill: { d: ['按模式结束进程', 'Kill processes by pattern'] },
  uptime: { d: ['查看运行时间与负载', 'Show uptime and load average'] },
  uname: { d: ['查看系统信息', 'Show system information'], f: { a: ['全部信息', 'all information'], r: ['内核版本', 'kernel release'] } },
  whoami: { d: ['显示当前用户', 'Print the current user'] },
  id: { d: ['显示用户与组 ID', 'Show user and group IDs'] },
  hostname: { d: ['显示主机名', 'Show the host name'] },
  ip: { d: ['查看/配置网络接口与路由', 'Show/configure network interfaces and routes'] },
  ifconfig: { d: ['查看网络接口', 'Show network interfaces'] },
  ping: { d: ['测试网络连通性', 'Test network reachability'], f: { c: ['发送次数', 'number of packets'] } },
  curl: { d: ['发起 HTTP 等请求', 'Make HTTP (and other) requests'], f: { I: ['只取响应头', 'headers only'], L: ['跟随重定向', 'follow redirects'], s: ['静默模式', 'silent'], o: ['输出到文件', 'write to file'], X: ['指定请求方法', 'request method'], H: ['添加请求头', 'add header'], d: ['请求体数据', 'request body'], k: ['忽略证书校验', 'skip TLS verification'], v: ['详细输出', 'verbose'] } },
  wget: { d: ['下载文件', 'Download files'], f: { O: ['输出文件名', 'output file name'], q: ['静默', 'quiet'], c: ['断点续传', 'resume download'] } },
  ss: { d: ['查看套接字/端口', 'Show sockets / ports'], f: { t: ['TCP', 'TCP'], u: ['UDP', 'UDP'], l: ['只看监听', 'listening only'], n: ['不解析名称', 'numeric, no name lookup'], p: ['显示进程', 'show processes'] } },
  netstat: { d: ['查看网络连接与端口', 'Show network connections and ports'], f: { t: ['TCP', 'TCP'], u: ['UDP', 'UDP'], l: ['只看监听', 'listening only'], n: ['不解析名称', 'numeric'], p: ['显示进程', 'show processes'] } },
  systemctl: { d: ['管理 systemd 服务', 'Manage systemd services'] },
  service: { d: ['管理系统服务', 'Manage system services'] },
  journalctl: { d: ['查看 systemd 日志', 'Read the systemd journal'], f: { u: ['指定服务单元', 'filter by unit'], f: ['持续跟踪', 'follow'], n: ['最近 N 行', 'last N lines'], x: ['附加解释', 'add explanations'], e: ['跳到末尾', 'jump to the end'] } },
  tar: { d: ['打包/解包归档', 'Create/extract archives'], f: { c: ['创建归档', 'create archive'], x: ['解包', 'extract'], z: ['gzip 压缩', 'gzip'], j: ['bzip2 压缩', 'bzip2'], v: ['显示过程', 'verbose'], f: ['指定归档文件', 'archive file'], t: ['列出内容', 'list contents'] } },
  zip: { d: ['压缩为 zip', 'Create a zip archive'], f: { r: ['递归目录', 'recurse directories'] } },
  unzip: { d: ['解压 zip', 'Extract a zip archive'] },
  ssh: { d: ['连接远程主机', 'Connect to a remote host'], f: { p: ['端口', 'port'], i: ['私钥文件', 'identity file'], L: ['本地端口转发', 'local port forward'], J: ['跳板机', 'jump host'] } },
  scp: { d: ['通过 SSH 复制文件', 'Copy files over SSH'], f: { r: ['递归目录', 'recursive'], P: ['端口', 'port'] } },
  rsync: { d: ['增量同步文件', 'Incrementally sync files'], f: { a: ['归档模式', 'archive mode'], v: ['显示过程', 'verbose'], z: ['传输压缩', 'compress in transit'], P: ['进度并支持续传', 'progress + partial'], n: ['演练，不实际执行', 'dry run'] } },
  docker: { d: ['管理 Docker 容器与镜像', 'Manage Docker containers and images'] },
  kubectl: { d: ['管理 Kubernetes 集群', 'Manage Kubernetes clusters'] },
  git: { d: ['Git 版本控制', 'Git version control'] },
  apt: { d: ['Debian/Ubuntu 软件包管理', 'Debian/Ubuntu package manager'] },
  'apt-get': { d: ['Debian/Ubuntu 软件包管理', 'Debian/Ubuntu package manager'] },
  yum: { d: ['RHEL/CentOS 软件包管理', 'RHEL/CentOS package manager'] },
  dnf: { d: ['Fedora/RHEL 软件包管理', 'Fedora/RHEL package manager'] },
  echo: { d: ['输出文本', 'Print text'] },
  wc: { d: ['统计行数/字数/字节', 'Count lines / words / bytes'], f: { l: ['只统计行数', 'lines only'] } },
  sort: { d: ['排序文本行', 'Sort lines'], f: { n: ['按数值', 'numeric'], r: ['逆序', 'reverse'], u: ['去重', 'unique'], h: ['按人类可读大小', 'human-numeric'] } },
  uniq: { d: ['合并相邻重复行', 'Collapse adjacent duplicate lines'], f: { c: ['显示次数', 'count occurrences'] } },
  awk: { d: ['按列处理文本', 'Process text by columns'] },
  sed: { d: ['流式编辑文本', 'Stream-edit text'], f: { i: ['原地修改文件', 'edit files in place'], n: ['不自动打印', 'no auto-print'], E: ['扩展正则', 'extended regex'] } },
  xargs: { d: ['把输入作为参数执行命令', 'Build command arguments from input'] },
  vim: { d: ['文本编辑器', 'Text editor'] },
  vi: { d: ['文本编辑器', 'Text editor'] },
  nano: { d: ['文本编辑器', 'Text editor'] },
  which: { d: ['查找命令位置', 'Locate a command'] },
  history: { d: ['查看命令历史', 'Show command history'] },
  crontab: { d: ['管理定时任务', 'Manage cron jobs'], f: { l: ['列出', 'list'], e: ['编辑', 'edit'] } },
  mount: { d: ['挂载文件系统', 'Mount filesystems'] },
  lsblk: { d: ['列出块设备', 'List block devices'] },
  dd: { d: ['按块复制数据', 'Copy data block by block'] },
  mkfs: { d: ['创建文件系统（格式化）', 'Create a filesystem (format)'] },
  reboot: { d: ['重启主机', 'Reboot the host'] },
  shutdown: { d: ['关机或定时关机', 'Power off or schedule shutdown'] },
  iptables: { d: ['配置防火墙规则', 'Configure firewall rules'] },
  mysql: { d: ['MySQL 命令行客户端', 'MySQL command-line client'] },
  psql: { d: ['PostgreSQL 命令行客户端', 'PostgreSQL command-line client'] },
  'redis-cli': { d: ['Redis 命令行客户端', 'Redis command-line client'] },
  nginx: { d: ['Nginx 服务器（-t 检查配置）', 'Nginx server (-t tests config)'], f: { t: ['检查配置', 'test configuration'], s: ['发送信号（reload/stop）', 'send signal (reload/stop)'] } }
}

const PREFIX: Record<string, Text> = {
  sudo: ['以 root 权限执行', 'run as root'],
  nohup: ['退出终端后继续运行', 'keep running after logout'],
  time: ['统计耗时', 'measure run time'],
  watch: ['周期性重复执行', 'run periodically']
}

export type ExplainedFlag = { flag: string; text: string }
export type ExplainedSegment = { program: string; text: string; prefixes: string[]; flags: ExplainedFlag[]; known: boolean }
export type CommandExplanation = { segments: ExplainedSegment[]; risk: RiskReasonKey | null }

function tokenize(seg: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(seg))) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

/** Splits on | && || ; outside quotes. */
export function splitShellSegments(line: string): string[] {
  const parts: string[] = []
  let cur = ''
  let q: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (q) {
      if (c === q) q = null
      cur += c
      continue
    }
    if (c === '"' || c === "'") {
      q = c
      cur += c
      continue
    }
    if (c === '|' || c === ';' || (c === '&' && line[i + 1] === '&')) {
      if (cur.trim()) parts.push(cur.trim())
      cur = ''
      if ((c === '|' && line[i + 1] === '|') || c === '&') i++
      continue
    }
    cur += c
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

export function explainCommand(line: string, locale: 'zh-CN' | 'en' = 'en'): CommandExplanation | null {
  const L = locale === 'zh-CN' ? 0 : 1
  const src = String(line ?? '').trim()
  if (!src) return null
  const segments: ExplainedSegment[] = []
  for (const seg of splitShellSegments(src).slice(0, 6)) {
    const toks = tokenize(seg)
    const prefixes: string[] = []
    while (toks.length && (PREFIX[toks[0]!] || /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0]!))) {
      const t = toks.shift()!
      if (PREFIX[t]) prefixes.push(`${t}: ${PREFIX[t]![L]}`)
    }
    if (!toks.length) continue
    const raw = toks[0]!
    const program = raw.split('/').pop() || raw
    const base = /^mkfs(\.|$)/.test(program) ? 'mkfs' : program
    const entry = DB[base]
    const flags: ExplainedFlag[] = []
    if (entry?.f) {
      const seen = new Set<string>()
      for (const tok of toks.slice(1)) {
        if (!/^-[A-Za-z0-9]+$/.test(tok)) continue
        const letters = /^-\d+$/.test(tok) ? [tok.slice(1)] : tok.slice(1).split('')
        for (const ch of letters) {
          const d = entry.f[ch]
          if (d && !seen.has(ch)) {
            seen.add(ch)
            flags.push({ flag: `-${ch}`, text: d[L] })
          }
        }
      }
    }
    segments.push({ program, text: entry ? entry.d[L] : '', prefixes, flags, known: Boolean(entry) })
  }
  if (!segments.length) return null
  return { segments, risk: assessCommandRisk(src)?.reasonKey ?? null }
}
