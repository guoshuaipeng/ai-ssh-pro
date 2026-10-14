/** Server resource probe: one POSIX shell line over an exec channel, parsed locally (Linux /proc). */
export const RESOURCE_PROBE_CMD =
  "LC_ALL=C; cat /proc/loadavg; echo '@@'; nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo; echo '@@'; " +
  "head -n1 /proc/stat; sleep 0.5; head -n1 /proc/stat; echo '@@'; free -b; echo '@@'; " +
  "df -kP -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null | head -n 30; echo '@@'; cat /proc/uptime"

export type DiskUsage = { fs: string; mount: string; totalKb: number; usedKb: number; percent: number }
export type ResourceSnapshot = {
  load: [number, number, number] | null
  cores: number | null
  cpuPercent: number | null
  mem: { total: number; used: number; available: number; percent: number } | null
  swap: { total: number; used: number; percent: number } | null
  disks: DiskUsage[]
  uptimeSec: number | null
}

const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 1000) / 10 : 0)

/** UX-43: ≥85% is bad (red), ≥70% is warn, otherwise ok. */
export function resourceLevel(percent: number): 'ok' | 'warn' | 'bad' {
  if (!Number.isFinite(percent)) return 'ok'
  if (percent >= 85) return 'bad'
  if (percent >= 70) return 'warn'
  return 'ok'
}

function cpuFromStat(a: string, b: string): number | null {
  const nums = (l: string) => l.trim().split(/\s+/).slice(1).map(Number)
  if (!/^cpu\s/.test(a) || !/^cpu\s/.test(b)) return null
  const x = nums(a)
  const y = nums(b)
  if (x.length < 4 || y.length < 4 || x.some(Number.isNaN) || y.some(Number.isNaN)) return null
  const idle = (v: number[]) => (v[3] ?? 0) + (v[4] ?? 0)
  const total = (v: number[]) => v.slice(0, 8).reduce((s, n) => s + n, 0)
  const dt = total(y) - total(x)
  const di = idle(y) - idle(x)
  if (dt <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((dt - di) / dt) * 1000) / 10))
}

export function parseResourceSnapshot(stdout: string): ResourceSnapshot {
  const sec = String(stdout ?? '').replace(/\r/g, '').split(/^@@$/m).map((s) => s.trim())
  const out: ResourceSnapshot = { load: null, cores: null, cpuPercent: null, mem: null, swap: null, disks: [], uptimeSec: null }
  const la = (sec[0] ?? '').split(/\s+/).slice(0, 3).map(Number)
  if (la.length === 3 && la.every((n) => Number.isFinite(n))) out.load = [la[0]!, la[1]!, la[2]!]
  const cores = parseInt(sec[1] ?? '', 10)
  if (Number.isFinite(cores) && cores > 0) out.cores = cores
  const stat = (sec[2] ?? '').split('\n').filter((l) => l.startsWith('cpu'))
  if (stat.length >= 2) out.cpuPercent = cpuFromStat(stat[0]!, stat[1]!)
  for (const line of (sec[3] ?? '').split('\n')) {
    const p = line.trim().split(/\s+/)
    if (p[0] === 'Mem:' && p.length >= 4) {
      const total = Number(p[1])
      const available = p.length >= 7 ? Number(p[6]) : total - Number(p[2])
      const used = total - available
      if (total > 0) out.mem = { total, used, available, percent: pct(used, total) }
    } else if (p[0] === 'Swap:' && p.length >= 3) {
      const total = Number(p[1])
      const used = Number(p[2])
      out.swap = { total, used, percent: pct(used, total) }
    }
  }
  for (const line of (sec[4] ?? '').split('\n').slice(1)) {
    const p = line.trim().split(/\s+/)
    if (p.length < 6) continue
    const totalKb = Number(p[1])
    const usedKb = Number(p[2])
    if (!Number.isFinite(totalKb) || totalKb <= 0) continue
    out.disks.push({ fs: p[0]!, mount: p.slice(5).join(' '), totalKb, usedKb, percent: parseInt(p[4]!, 10) || pct(usedKb, totalKb) })
  }
  const up = parseFloat((sec[5] ?? '').split(/\s+/)[0] ?? '')
  if (Number.isFinite(up)) out.uptimeSec = Math.floor(up)
  return out
}

export function formatBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`
}

export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`
}
