/** A3: read-only inspection command set (demo hosts return canned output). */
export type InspectCheckId = 'disk' | 'mem' | 'systemd' | 'security' | 'logs'

export const INSPECT_CHECKS: ReadonlyArray<{
  id: InspectCheckId
  zh: string
  en: string
  cmd: string
  defaultOn: boolean
}> = [
  {
    id: 'disk',
    zh: '磁盘',
    en: 'Disk',
    cmd: "df -hP -x tmpfs -x devtmpfs -x overlay 2>/dev/null | head -n 40",
    defaultOn: true
  },
  {
    id: 'mem',
    zh: '内存/Swap',
    en: 'Memory/Swap',
    cmd: "free -h; echo '@@'; swapon --show 2>/dev/null; echo '@@'; cat /proc/meminfo | head -n 20",
    defaultOn: true
  },
  {
    id: 'systemd',
    zh: '失败服务 (systemd)',
    en: 'Failed services (systemd)',
    cmd: "systemctl --failed --no-pager 2>/dev/null | head -n 40; echo '@@'; systemctl list-units --state=failed --no-pager 2>/dev/null | head -n 40",
    defaultOn: true
  },
  {
    id: 'security',
    zh: '安全基线 (SSH/空密码/待更新)',
    en: 'Security baseline (SSH / empty passwords / updates)',
    cmd: "grep -E '^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication)' /etc/ssh/sshd_config 2>/dev/null; echo '@@'; awk -F: '($2==\"\"){print $1}' /etc/shadow 2>/dev/null | head; echo '@@'; (apt-get -s upgrade 2>/dev/null | grep -c '^Inst ') || (yum check-update -q 2>/dev/null | wc -l) || echo 0",
    defaultOn: true
  },
  {
    id: 'logs',
    zh: '最近错误日志',
    en: 'Recent error logs',
    cmd: "journalctl -p err -n 30 --no-pager 2>/dev/null || dmesg -T 2>/dev/null | tail -n 30 || true",
    defaultOn: false
  }
]

export const DEMO_INSPECT_OUTPUT: Record<InspectCheckId, string> = {
  disk: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        40G   28G   10G  74% /\n/dev/sdb1       100G   92G    8G  92% /data',
  mem: '              total        used        free      shared  buff/cache   available\nMem:           7.7Gi       5.1Gi       0.4Gi       0.2Gi       2.2Gi       2.1Gi\nSwap:          2.0Gi       0.8Gi       1.2Gi\n@@\nNAME     TYPE SIZE USED PRIO\n/swap    file    2G 800M   -2\n@@\nMemTotal:        8000000 kB\nMemAvailable:    2100000 kB',
  systemd: '  UNIT             LOAD   ACTIVE SUB    DESCRIPTION\n● nginx.service    loaded failed failed A high performance web server\n\nLOAD   = Reflects whether unit definition was properly loaded.\nACTIVE = The high-level unit activation state, i.e. generalization of SUB.\nSUB    = The low-level unit activation state, values depend on unit type.\n1 loaded units listed.',
  security: 'PermitRootLogin yes\nPasswordAuthentication yes\nPubkeyAuthentication yes\n@@\n\n@@\n12',
  logs: 'Oct 14 08:01:02 demo kernel: Out of memory: Kill process 1234 (java)\nOct 14 08:12:44 demo sshd[99]: Failed password for root from 203.0.113.10'
}

export function buildInspectPrompt(hostTitle: string, collected: Record<string, string>): string {
  const body = Object.entries(collected)
    .map(([k, v]) => `### ${k}\n\`\`\`\n${v.slice(0, 4000)}\n\`\`\``)
    .join('\n\n')
  return `你是资深 Linux 运维。根据下列只读巡检输出，给出简洁的中文体检报告。
主机：${hostTitle}
要求：
1. 总体评分 0-100
2. 按严重/警告/正常列出问题（每条：标题｜证据摘要｜建议命令，建议命令只给出不要执行）
3. 输出 Markdown

${body}`
}
