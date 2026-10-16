/** W4: per-alert timeline and a redacted Markdown postmortem. No AI calls. */
import { redactAuditText, type AuditEvent } from './audit-log'

export const TIMELINE_LS_KEY = 'aiss.alert.timeline.v1'
export const TIMELINE_MAX_PER_ALERT = 200
export const TIMELINE_MAX_ALERTS = 200
export const TIMELINE_KEEP_MS = 90 * 24 * 60 * 60 * 1000
export const CONCURRENT_BEFORE_MS = 5 * 60 * 1000
export const CONCURRENT_AFTER_MS = 10 * 60 * 1000

export type TimelineKind =
  | 'alert.fired'
  | 'alert.locate'
  | 'ai.explain'
  | 'command.insert'
  | 'command.run'
  | 'playbook.draft'
  | 'playbook.dryrun'
  | 'playbook.run'
  | 'file.save'
  | 'file.sync'
  | 'file.rollback'
  | 'concurrent'
  | 'alert.dismiss'
  | 'alert.handled'
  | 'alert.recovered'
  | 'note'
  | 'gate'
  | 'alert.maintenance.start'
  | 'alert.maintenance.end'
  | 'alert.maintenance.expire'

export type TimelineEvent = {
  id: string
  alertId: string
  at: number
  kind: TimelineKind
  hostKey: string
  summary: string
  detail?: string
  concurrent?: boolean
  exitCode?: number | null
  output?: string
  diff?: string
  gateResult?: string
  gateRule?: string
}

export type TimelineAlert = {
  id: string
  hostKey: string
  hostTitle: string
  ruleId: string
  value: number
  threshold: number
  at: number
  status: 'active' | 'recovered' | 'ignored'
  recoveredAt?: number
  handledManually?: boolean
  user?: string
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

type Bag = { events: TimelineEvent[]; frozen: Record<string, true> }

function emptyBag(): Bag {
  return { events: [], frozen: {} }
}

export function loadTimelineBag(store: Pick<Storage, 'getItem'> = globalThis.localStorage): Bag {
  try {
    const raw = store.getItem(TIMELINE_LS_KEY)
    if (!raw) return emptyBag()
    const parsed = JSON.parse(raw) as Bag
    return { events: Array.isArray(parsed.events) ? parsed.events : [], frozen: parsed.frozen ?? {} }
  } catch {
    return emptyBag()
  }
}

function saveBag(bag: Bag, store: Store): void {
  store.setItem(TIMELINE_LS_KEY, JSON.stringify(bag))
}

function prune(bag: Bag, now: number): Bag {
  const cutoff = now - TIMELINE_KEEP_MS
  const byAlert = new Map<string, TimelineEvent[]>()
  for (const e of bag.events) {
    const list = byAlert.get(e.alertId) ?? []
    list.push(e)
    byAlert.set(e.alertId, list)
  }
  const alerts = [...byAlert.entries()].map(([id, events]) => ({
    id,
    events,
    latest: Math.max(...events.map((e) => e.at))
  }))
  alerts.sort((a, b) => b.latest - a.latest)
  const keepIds = new Set(alerts.filter((a) => a.latest >= cutoff).slice(0, TIMELINE_MAX_ALERTS).map((a) => a.id))
  const events: TimelineEvent[] = []
  for (const a of alerts) {
    if (!keepIds.has(a.id)) continue
    const sorted = [...a.events].sort((x, y) => x.at - y.at)
    const explicit = sorted.filter((e) => !e.concurrent)
    const concurrent = sorted.filter((e) => e.concurrent)
    const room = Math.max(0, TIMELINE_MAX_PER_ALERT - explicit.length)
    const keptConcurrent = concurrent.slice(Math.max(0, concurrent.length - room))
    events.push(...explicit.slice(-TIMELINE_MAX_PER_ALERT), ...keptConcurrent)
  }
  const frozen: Record<string, true> = {}
  for (const id of Object.keys(bag.frozen)) if (keepIds.has(id)) frozen[id] = true
  return { events, frozen }
}

export function eventsFor(alertId: string, store: Pick<Storage, 'getItem'> = globalThis.localStorage): TimelineEvent[] {
  return loadTimelineBag(store).events.filter((e) => e.alertId === alertId).sort((a, b) => a.at - b.at)
}

export function appendTimeline(
  event: Omit<TimelineEvent, 'id' | 'summary' | 'at'> & { id?: string; summary: string; at?: number },
  store: Store = globalThis.localStorage,
  now = Date.now()
): TimelineEvent {
  const row: TimelineEvent = {
    ...event,
    id: event.id ?? `tl-${now}-${Math.random().toString(36).slice(2, 7)}`,
    at: event.at ?? now,
    summary: redactAuditText(event.summary).slice(0, 500),
    detail: event.detail ? redactAuditText(event.detail).slice(0, 2000) : undefined,
    output: event.output ? redactAuditText(event.output) : undefined,
    diff: event.diff ? redactAuditText(event.diff) : undefined
  }
  const bag = prune(loadTimelineBag(store), now)
  bag.events.push(row)
  saveBag(prune(bag, now), store)
  return row
}

export function ensureFired(alert: TimelineAlert, store: Store = globalThis.localStorage): TimelineEvent[] {
  const have = eventsFor(alert.id, store)
  if (!have.some((e) => e.kind === 'alert.fired')) {
    appendTimeline(
      {
        alertId: alert.id,
        at: alert.at,
        kind: 'alert.fired',
        hostKey: alert.hostKey,
        summary: `${alert.ruleId} ${Math.round(alert.value)}%`
      },
      store,
      alert.at
    )
  }
  return eventsFor(alert.id, store)
}

export function alertWindow(alert: TimelineAlert, now = Date.now()): { start: number; end: number } {
  const closed = alert.recoveredAt ?? (alert.status === 'active' ? now : alert.at)
  return { start: alert.at - CONCURRENT_BEFORE_MS, end: closed + CONCURRENT_AFTER_MS }
}

export function concurrentFromAudit(alert: TimelineAlert, audit: AuditEvent[], now = Date.now()): TimelineEvent[] {
  const window = alertWindow(alert, now)
  return audit
    .filter((e) => (e.profileId === alert.hostKey || e.host === alert.hostTitle || e.host === alert.hostKey) && e.at >= window.start && e.at <= window.end)
    .filter((e) => e.type === 'command' || e.type === 'file' || e.type === 'danger' || e.type === 'alert.execute')
    .map((e) => ({
      id: `con-${e.id}`,
      alertId: alert.id,
      at: e.at,
      kind: 'concurrent' as const,
      hostKey: alert.hostKey,
      summary: redactAuditText(e.detail).slice(0, 240),
      concurrent: true
    }))
}

export function viewTimeline(
  alert: TimelineAlert,
  explicit: TimelineEvent[],
  audit: AuditEvent[],
  opts?: { concurrent?: boolean; gates?: boolean; now?: number }
): TimelineEvent[] {
  const now = opts?.now ?? Date.now()
  const fired: TimelineEvent = explicit.find((e) => e.kind === 'alert.fired') ?? {
    id: `fired-${alert.id}`,
    alertId: alert.id,
    at: alert.at,
    kind: 'alert.fired',
    hostKey: alert.hostKey,
    summary: `${alert.ruleId} ${Math.round(alert.value)}%`
  }
  const restExplicit = explicit.filter((e) => e.id !== fired.id && e.kind !== 'concurrent')
  const gateRows: TimelineEvent[] =
    opts?.gates === false
      ? []
      : audit
          .filter(
            (e) =>
              e.type === 'gate' &&
              (e.alertId === alert.id || e.profileId === alert.hostKey || e.host === alert.hostTitle || e.host === alert.hostKey)
          )
          .map((e) => ({
            id: e.id,
            alertId: alert.id,
            at: e.at,
            kind: 'gate' as const,
            hostKey: e.profileId || alert.hostKey,
            summary: e.detail,
            gateResult: e.gateResult,
            gateRule: e.gateRule,
            concurrent: false
          }))
  const seen = new Set(restExplicit.map((e) => e.id))
  const rest = [...restExplicit, ...gateRows.filter((e) => !seen.has(e.id))]
  const concurrent = opts?.concurrent === false ? [] : concurrentFromAudit(alert, audit, now)
  const known = new Set(rest.map((e) => e.summary))
  const extra = concurrent.filter((e) => !known.has(e.summary))
  const merged = [fired, ...rest, ...extra].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  const omittedConcurrent = Math.max(0, merged.filter((e) => e.concurrent).length - Math.max(0, TIMELINE_MAX_PER_ALERT - merged.filter((e) => !e.concurrent).length))
  if (merged.length <= TIMELINE_MAX_PER_ALERT) return merged
  const keepConcurrent = merged.filter((e) => e.concurrent).slice(omittedConcurrent)
  return [...merged.filter((e) => !e.concurrent), ...keepConcurrent].sort((a, b) => a.at - b.at).slice(-TIMELINE_MAX_PER_ALERT)
}

export type PostmortemOptions = {
  aliasHosts: boolean
  aliasUsers: boolean
  aliasIps: boolean
  keepPathHosts: boolean
  concurrent: boolean
  aiCause: boolean
  commandOutput: boolean
  fileDiff: boolean
  notes: boolean
  lang: 'zh' | 'en'
  version: string
  demo?: boolean
}

export const DEFAULT_POSTMORTEM: PostmortemOptions = {
  aliasHosts: true,
  aliasUsers: true,
  aliasIps: true,
  keepPathHosts: false,
  concurrent: true,
  aiCause: true,
  commandOutput: false,
  fileDiff: false,
  notes: true,
  lang: 'zh',
  version: '0.4.5'
}

const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
const USER_RE = /\b([a-z_][a-z0-9_-]{1,30})@/gi

function letter(n: number): string {
  let s = ''
  let x = n
  do {
    s = String.fromCharCode(65 + (x % 26)) + s
    x = Math.floor(x / 26) - 1
  } while (x >= 0)
  return s
}

export function buildAliasMap(texts: string[], hosts: string[], users: string[]): { hosts: Record<string, string>; users: Record<string, string>; ips: Record<string, string> } {
  const hostMap: Record<string, string> = {}
  hosts.filter(Boolean).forEach((h, i) => {
    if (!hostMap[h]) hostMap[h] = `host-${letter(i)}`
  })
  const userMap: Record<string, string> = {}
  const seenUsers = [...users]
  for (const text of texts) {
    for (const m of text.matchAll(USER_RE)) {
      const name = m[1]!
      if (!seenUsers.includes(name)) seenUsers.push(name)
    }
  }
  seenUsers.filter(Boolean).forEach((u, i) => {
    if (!userMap[u]) userMap[u] = `user-${letter(i)}`
  })
  const ipMap: Record<string, string> = {}
  let octet = 1
  for (const text of texts) {
    for (const ip of text.match(IP_RE) ?? []) {
      if (!ipMap[ip]) {
        ipMap[ip] = `203.0.113.${octet}`
        octet = octet >= 254 ? 1 : octet + 1
      }
    }
  }
  return { hosts: hostMap, users: userMap, ips: ipMap }
}

export function applyAliases(text: string, map: { hosts: Record<string, string>; users: Record<string, string>; ips: Record<string, string> }, opts: PostmortemOptions): string {
  let out = redactAuditText(text)
  if (opts.aliasIps) {
    const ips = Object.keys(map.ips).sort((a, b) => b.length - a.length)
    for (const ip of ips) out = out.split(ip).join(map.ips[ip]!)
  }
  if (opts.aliasUsers) {
    const users = Object.keys(map.users).sort((a, b) => b.length - a.length)
    for (const user of users) out = out.replace(new RegExp(`\\b${user}\\b`, 'g'), map.users[user]!)
  }
  if (opts.aliasHosts) {
    const hosts = Object.keys(map.hosts).sort((a, b) => b.length - a.length)
    for (const host of hosts) {
      if (!opts.keepPathHosts) out = out.split(host).join(map.hosts[host]!)
      else out = out.replace(new RegExp(`(?<![\\w./])${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w./])`, 'g'), map.hosts[host]!)
    }
  }
  return redactAuditText(out)
}

const KIND_LABEL: Record<TimelineKind, { zh: string; en: string }> = {
  'alert.fired': { zh: '告警触发', en: 'Alert fired' },
  'alert.locate': { zh: '定位', en: 'Navigated' },
  'ai.explain': { zh: 'AI 解读', en: 'AI read' },
  'command.insert': { zh: '插入命令', en: 'Inserted' },
  'command.run': { zh: '执行', en: 'Ran' },
  'playbook.draft': { zh: '生成剧本', en: 'Playbook drafted' },
  'playbook.dryrun': { zh: '试运行', en: 'Dry run' },
  'playbook.run': { zh: '剧本运行', en: 'Playbook run' },
  'file.save': { zh: '文件', en: 'File' },
  'file.sync': { zh: '文件', en: 'File' },
  'file.rollback': { zh: '回滚', en: 'Rollback' },
  concurrent: { zh: '同期', en: 'Concurrent' },
  'alert.dismiss': { zh: '已忽略', en: 'Dismissed' },
  'alert.handled': { zh: '手动处理', en: 'Handled manually' },
  'alert.recovered': { zh: '已恢复', en: 'Recovered' },
  note: { zh: '备注', en: 'Note' },
  gate: { zh: '闸门', en: 'Gate' },
  'alert.maintenance.start': { zh: '开始维护', en: 'Maintenance started' },
  'alert.maintenance.end': { zh: '结束维护', en: 'Maintenance ended' },
  'alert.maintenance.expire': { zh: '维护到期', en: 'Maintenance expired' }
}

function fmtTime(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtClock(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function durationLabel(ms: number, lang: 'zh' | 'en'): string {
  const min = Math.max(1, Math.round(ms / 60000))
  return lang === 'en' ? `${min} min` : `${min} 分钟`
}

export function renderPostmortem(alert: TimelineAlert, events: TimelineEvent[], opts: PostmortemOptions = DEFAULT_POSTMORTEM): { markdown: string; aliasMap: Record<string, string> } {
  const lang = opts.lang
  const texts = [alert.hostTitle, alert.user ?? '', ...events.flatMap((e) => [e.summary, e.detail ?? '', e.output ?? '', e.diff ?? ''])]
  const map = buildAliasMap(texts, [alert.hostTitle], alert.user ? [alert.user] : [])
  const alias = (s: string) => applyAliases(s, map, opts)
  const host = alias(alert.hostTitle)
  const rule = alias(alert.ruleId)
  const endAt = alert.recoveredAt ?? events[events.length - 1]?.at ?? alert.at
  const result =
    alert.status === 'active'
      ? lang === 'en'
        ? 'Ongoing (at export)'
        : '进行中（导出时）'
      : alert.status === 'ignored'
        ? lang === 'en'
          ? 'Dismissed'
          : '已忽略'
        : alert.handledManually
          ? lang === 'en'
            ? 'Handled manually'
            : '手动处理'
          : lang === 'en'
            ? 'Recovered (automatic)'
            : '已恢复（自动）'
  const actions = events.filter((e) => e.kind === 'playbook.run' || e.kind === 'command.run' || e.kind === 'file.rollback').map((e) => KIND_LABEL[e.kind][lang])
  const summary = lang === 'en'
    ? `Fired ${rule}, then ${actions.length ? actions.join(', ') : 'no command was run'}, outcome: ${result}.`
    : `触发 ${rule}，随后${actions.length ? actions.join('、') : '未执行命令'}，结果：${result}。`
  const lines: string[] = []
  lines.push(`# ${lang === 'en' ? 'Postmortem' : '复盘'}：${host} ${rule}`)
  lines.push(`- ${lang === 'en' ? 'Time' : '时间'}：${fmtTime(alert.at)} – ${fmtTime(endAt)}（${durationLabel(Math.max(0, endAt - alert.at), lang)}）`)
  lines.push(`- ${lang === 'en' ? 'Rule' : '规则'}：${rule} > ${alert.threshold}%（${lang === 'en' ? 'peak' : '峰值'} ${Math.round(alert.value)}%）`)
  lines.push(`- ${lang === 'en' ? 'Result' : '结果'}：${result}`)
  lines.push('')
  lines.push(`## ${lang === 'en' ? 'Summary' : '摘要'}`)
  lines.push(summary)
  const cause = events.find((e) => e.kind === 'ai.explain')
  if (opts.aiCause && cause) {
    lines.push('')
    lines.push(`## ${lang === 'en' ? 'Cause (AI read)' : '原因（AI 解读）'}`)
    lines.push(alias(cause.detail || cause.summary).slice(0, 200))
  }
  lines.push('')
  lines.push(`## ${lang === 'en' ? 'Timeline' : '时间线'}`)
  lines.push(`| ${lang === 'en' ? 'Time' : '时间'} | ${lang === 'en' ? 'Event' : '事件'} | ${lang === 'en' ? 'Detail' : '说明'} |`)
  lines.push('| --- | --- | --- |')
  for (const e of events) {
    if (e.concurrent && !opts.concurrent) continue
    if (e.kind === 'note' && !opts.notes) continue
    lines.push(`| ${fmtClock(e.at)} | ${KIND_LABEL[e.kind][lang]} | ${alias(e.summary).replace(/\|/g, '/')} |`)
  }
  const commands = events.filter((e) => e.kind === 'command.run' || e.kind === 'command.insert')
  if (commands.length) {
    lines.push('')
    lines.push(`## ${lang === 'en' ? 'Commands' : '执行的命令'}`)
    for (const e of commands) {
      lines.push('```')
      lines.push(alias(e.summary))
      if (e.exitCode != null) lines.push(lang === 'en' ? `exit ${e.exitCode}` : `退出码 ${e.exitCode}`)
      if (opts.commandOutput && e.output) lines.push(alias(e.output).split('\n').slice(0, 20).join('\n'))
      lines.push('```')
    }
  }
  const runs = events.filter((e) => e.kind === 'playbook.draft' || e.kind === 'playbook.dryrun' || e.kind === 'playbook.run')
  if (runs.length) {
    lines.push('')
    lines.push(`## ${lang === 'en' ? 'Playbook runs' : '剧本运行'}`)
    for (const e of runs) lines.push(`- ${alias(e.summary)}`)
  }
  const files = events.filter((e) => e.kind === 'file.save' || e.kind === 'file.sync' || e.kind === 'file.rollback')
  if (files.length) {
    lines.push('')
    lines.push(`## ${lang === 'en' ? 'File changes' : '文件变更'}`)
    for (const e of files) {
      lines.push(`- ${alias(e.summary)}`)
      if (opts.fileDiff && e.diff) lines.push('```\n' + alias(e.diff).split('\n').slice(0, 40).join('\n') + '\n```')
    }
  }
  const notes = events.filter((e) => e.kind === 'note')
  if (opts.notes && notes.length) {
    lines.push('')
    lines.push(`## ${lang === 'en' ? 'Notes' : '备注'}`)
    for (const e of notes) lines.push(`- ${alias(e.summary)}`)
  }
  lines.push('')
  lines.push('---')
  lines.push(lang === 'en' ? `Generated by AI-SSH-Pro ${opts.version} · redacted` : `由 AI-SSH-Pro ${opts.version} 生成 · 已脱敏`)
  if (opts.demo) lines.push(lang === 'en' ? 'Demo data' : '演示数据')
  const markdown = lines.join('\n')
  const aliasMap: Record<string, string> = { ...map.hosts, ...map.users, ...map.ips }
  return { markdown, aliasMap }
}

export function omittedConcurrentCount(events: TimelineEvent[]): number {
  return events.filter((e) => e.concurrent).length > TIMELINE_MAX_PER_ALERT ? events.filter((e) => e.concurrent).length - TIMELINE_MAX_PER_ALERT : 0
}
