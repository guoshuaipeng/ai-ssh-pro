/** L1 playbooks: ordered steps, parallel or serial runs, confirm gates. Hosts are chosen at run time. */
import { assessCommandRisk } from './command-risk'
import type { ProtectionLevel } from './protection'
import { expandTemplate } from './template-vars'

export type PlaybookStepType = 'command' | 'snippet' | 'toolbox'

export type PlaybookVar = {
  name: string
  label?: string
  defaultValue?: string
  required: boolean
  sensitive: boolean
  quote: boolean
  unused?: boolean
}

export type PlaybookOrigin = {
  kind: 'alert' | 'error'
  alertId?: string
  hostKey: string
  hostTitle: string
  ruleId?: string
  at: number
}

export type PlaybookStep = {
  id: string
  type: PlaybookStepType
  command?: string
  snippetId?: string
  confirm: boolean
  stopOnError: boolean
  timeoutSec: number
  title?: string
  aiGenerated?: boolean
  lockedConfirm?: boolean
  checkPlaceholder?: boolean
}

export type Playbook = {
  id: string
  name: string
  description: string
  steps: PlaybookStep[]
  updatedAt: number
  lastRunAt?: number
  sample?: boolean
  draft?: boolean
  origin?: PlaybookOrigin
  targetHint?: string[]
  vars?: PlaybookVar[]
}

export type PlaybookFile = {
  version: 1
  name: string
  description?: string
  steps: Array<{
    id?: string
    type?: PlaybookStepType
    command?: string
    snippetId?: string
    confirm?: boolean
    stopOnError?: boolean
    timeoutSec?: number
    title?: string
  }>
  vars?: PlaybookVar[]
}

export const PLAYBOOK_LS_KEY = 'aiss.playbooks.v1'
export const DEFAULT_PARALLEL = 5
export const AUTOSAVE_MS = 800

export type PlaybookHost = {
  id: string
  name: string
  user: string
  host: string
  level: ProtectionLevel
  sessionId?: string
}

export type CellState = 'pending' | 'queued' | 'running' | 'ok' | 'fail' | 'skipped' | 'waiting'

export type ResultCell = {
  hostId: string
  stepId: string
  state: CellState
  code: number | null
  ms: number
  stdout: string
  stderr: string
  error?: string
}

export type PlaybookRunResult = {
  id: string
  playbookId: string
  name: string
  startedAt: number
  finishedAt: number
  mode: 'parallel' | 'serial'
  cells: ResultCell[]
  aborted: boolean
}

export type ConfirmAnswer = 'run' | 'skip' | 'skip-rest' | 'abort'

export type ConfirmRequest = {
  host: PlaybookHost
  step: PlaybookStep
  command: string
  dangerous: boolean
  /** Production hosts must type the host name before a confirm or dangerous step. */
  requireHostName: boolean
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function newStepId(now = Date.now()): string {
  return `st-${now}-${Math.random().toString(36).slice(2, 7)}`
}

export function blankStep(now = Date.now()): PlaybookStep {
  return { id: newStepId(now), type: 'command', command: '', confirm: false, stopOnError: true, timeoutSec: 60 }
}

export function clampParallel(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PARALLEL
  return Math.min(32, Math.max(1, Math.floor(n)))
}

export function autosaveDue(editedAt: number, now: number, wait = AUTOSAVE_MS): boolean {
  return now - editedAt >= wait
}

export function hostSelectable(host: PlaybookHost): boolean {
  return host.level !== 'readonly'
}

export function substituteVars(command: string, host: { host: string; user: string }): string {
  return command.replace(/\{\{\s*host\s*\}\}/g, host.host).replace(/\{\{\s*user\s*\}\}/g, host.user)
}

export function stepCommand(step: PlaybookStep, snippets: Array<{ id: string; body: string }>): string {
  if (step.type === 'snippet') return snippets.find((s) => s.id === step.snippetId)?.body ?? ''
  if (step.type === 'toolbox') return ''
  return step.command ?? ''
}

export function stepNeedsConfirm(step: PlaybookStep, command: string, level: ProtectionLevel): { dangerous: boolean; requireHostName: boolean; confirm: boolean } {
  const dangerous = Boolean(command.trim() && assessCommandRisk(command))
  const flagged = step.confirm || dangerous
  return {
    dangerous,
    requireHostName: level === 'production' && flagged,
    confirm: flagged
  }
}

export function loadPlaybooks(store: Pick<Storage, 'getItem'> = globalThis.localStorage): Playbook[] {
  try {
    const raw = store.getItem(PLAYBOOK_LS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Playbook[]
    return Array.isArray(list) ? list.map(normalizePlaybook).filter((p): p is Playbook => Boolean(p)) : []
  } catch {
    return []
  }
}

export function savePlaybooks(list: Playbook[], store: Store = globalThis.localStorage): void {
  store.setItem(PLAYBOOK_LS_KEY, JSON.stringify(list))
}

export function upsertPlaybook(list: Playbook[], playbook: Playbook): Playbook[] {
  const i = list.findIndex((p) => p.id === playbook.id)
  if (i < 0) return [playbook, ...list]
  const next = list.slice()
  next[i] = playbook
  return next
}

function normalizeStep(raw: unknown, index: number): PlaybookStep | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<PlaybookStep>
  const type: PlaybookStepType = o.type === 'snippet' || o.type === 'toolbox' ? o.type : 'command'
  const timeout = typeof o.timeoutSec === 'number' && o.timeoutSec > 0 ? Math.min(600, Math.floor(o.timeoutSec)) : 60
  const step: PlaybookStep = {
    id: typeof o.id === 'string' && o.id ? o.id : `st-${index}`,
    type,
    command: typeof o.command === 'string' ? o.command : '',
    snippetId: typeof o.snippetId === 'string' ? o.snippetId : undefined,
    confirm: Boolean(o.confirm),
    stopOnError: o.stopOnError !== false,
    timeoutSec: timeout
  }
  if (typeof o.title === 'string' && o.title) step.title = o.title.slice(0, 60)
  if (o.aiGenerated) step.aiGenerated = true
  if (o.lockedConfirm) step.lockedConfirm = true
  if (o.checkPlaceholder) step.checkPlaceholder = true
  return step
}

export function normalizePlaybook(raw: unknown): Playbook | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<Playbook>
  if (typeof o.name !== 'string' || !o.name.trim()) return null
  const steps = Array.isArray(o.steps) ? o.steps.map(normalizeStep).filter((s): s is PlaybookStep => Boolean(s)) : []
  const playbook: Playbook = {
    id: typeof o.id === 'string' && o.id ? o.id : `pb-${Date.now()}`,
    name: o.name.trim(),
    description: typeof o.description === 'string' ? o.description : '',
    steps,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    lastRunAt: typeof o.lastRunAt === 'number' ? o.lastRunAt : undefined,
    sample: Boolean(o.sample) || undefined
  }
  if (o.draft) playbook.draft = true
  if (o.origin && typeof o.origin === 'object' && (o.origin.kind === 'alert' || o.origin.kind === 'error') && typeof o.origin.hostKey === 'string') {
    playbook.origin = {
      kind: o.origin.kind,
      alertId: typeof o.origin.alertId === 'string' ? o.origin.alertId : undefined,
      hostKey: o.origin.hostKey,
      hostTitle: typeof o.origin.hostTitle === 'string' ? o.origin.hostTitle : o.origin.hostKey,
      ruleId: typeof o.origin.ruleId === 'string' ? o.origin.ruleId : undefined,
      at: typeof o.origin.at === 'number' ? o.origin.at : playbook.updatedAt
    }
  }
  if (Array.isArray(o.targetHint)) playbook.targetHint = o.targetHint.filter((id): id is string => typeof id === 'string')
  if (Array.isArray(o.vars)) {
    playbook.vars = o.vars
      .filter((v): v is PlaybookVar => Boolean(v) && typeof v.name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v.name) && v.name !== 'host' && v.name !== 'user')
      .map((v) => ({
        name: v.name,
        label: typeof v.label === 'string' ? v.label.slice(0, 40) : undefined,
        defaultValue: v.sensitive ? undefined : typeof v.defaultValue === 'string' ? v.defaultValue : undefined,
        required: v.required !== false,
        sensitive: Boolean(v.sensitive),
        quote: v.quote !== false,
        unused: v.unused || undefined
      }))
  }
  return playbook
}

export function exportPlaybook(playbook: Playbook): string {
  const file: PlaybookFile = {
    version: 1,
    name: playbook.name,
    description: playbook.description,
    steps: playbook.steps.map((s) => ({
      id: s.id,
      type: s.type,
      command: s.command,
      snippetId: s.snippetId,
      confirm: s.confirm,
      stopOnError: s.stopOnError,
      timeoutSec: s.timeoutSec,
      title: s.title
    }))
  }
  if (playbook.vars?.length) {
    file.vars = playbook.vars.map((v) => ({
      name: v.name,
      label: v.label,
      defaultValue: v.sensitive ? undefined : v.defaultValue,
      required: v.required,
      sensitive: v.sensitive,
      quote: v.quote
    }))
  }
  return JSON.stringify(file, null, 2)
}

export function importPlaybook(raw: string, now = Date.now()): { ok: true; playbook: Playbook } | { ok: false; reason: string } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'json' }
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'shape' }
  const o = data as Partial<PlaybookFile>
  if (o.version !== 1) return { ok: false, reason: 'version' }
  const playbook = normalizePlaybook({
    id: `pb-${now}`,
    name: o.name,
    description: o.description,
    steps: o.steps,
    vars: o.vars,
    updatedAt: now
  })
  if (!playbook) return { ok: false, reason: 'name' }
  if (!playbook.steps.length) return { ok: false, reason: 'steps' }
  return { ok: true, playbook }
}

export function samplePlaybooks(now = Date.now()): Playbook[] {
  return [
    {
      id: 'sample-disk',
      name: '查看磁盘占用',
      description: '只读检查，不含删除。',
      sample: true,
      updatedAt: now,
      steps: [
        { id: 's1', type: 'command', command: 'df -h', confirm: false, stopOnError: true, timeoutSec: 30 },
        { id: 's2', type: 'command', command: 'du -xhd1 /var 2>/dev/null | sort -h | tail -n 20', confirm: false, stopOnError: false, timeoutSec: 60 }
      ]
    },
    {
      id: 'sample-nginx',
      name: '检查 nginx',
      description: '状态检查；重载需要确认。',
      sample: true,
      updatedAt: now - 1,
      steps: [
        { id: 'n1', type: 'command', command: 'df -h', confirm: false, stopOnError: false, timeoutSec: 30 },
        { id: 'n2', type: 'command', command: 'systemctl is-active nginx', confirm: true, stopOnError: true, timeoutSec: 20 },
        { id: 'n3', type: 'command', command: 'curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1/ || true', confirm: false, stopOnError: false, timeoutSec: 20 }
      ]
    }
  ]
}

export function ensureSamples(list: Playbook[], now = Date.now()): Playbook[] {
  if (list.length) return list
  return samplePlaybooks(now)
}

export type ExecOutcome = { code: number | null; stdout: string; stderr: string; error?: string }

export async function runPlaybook(opts: {
  playbook: Playbook
  hosts: PlaybookHost[]
  mode: 'parallel' | 'serial'
  parallelLimit: number
  snippets?: Array<{ id: string; body: string }>
  values?: Record<string, string>
  now?: number
  confirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>
  exec: (host: PlaybookHost, command: string, timeoutMs: number) => Promise<ExecOutcome>
  onCell?: (cell: ResultCell) => void
}): Promise<PlaybookRunResult> {
  const startedAt = opts.now ?? Date.now()
  const snippets = opts.snippets ?? []
  const cells: ResultCell[] = []
  let aborted = false
  const limit = clampParallel(opts.parallelLimit)
  const put = (cell: ResultCell) => {
    const i = cells.findIndex((c) => c.hostId === cell.hostId && c.stepId === cell.stepId)
    if (i >= 0) cells[i] = cell
    else cells.push(cell)
    opts.onCell?.(cell)
  }

  const runHost = async (host: PlaybookHost) => {
    if (!hostSelectable(host)) {
      for (const step of opts.playbook.steps) {
        put({ hostId: host.id, stepId: step.id, state: 'skipped', code: null, ms: 0, stdout: '', stderr: '', error: 'readonly' })
      }
      return
    }
    let skipRest = false
    for (const step of opts.playbook.steps) {
      if (aborted || skipRest) {
        put({ hostId: host.id, stepId: step.id, state: 'skipped', code: null, ms: 0, stdout: '', stderr: '', error: aborted ? 'aborted' : 'skip-rest' })
        continue
      }
      if (step.type === 'toolbox') {
        put({ hostId: host.id, stepId: step.id, state: 'skipped', code: null, ms: 0, stdout: '', stderr: '', error: 'toolbox-soon' })
        continue
      }
      const expanded = expandTemplate(stepCommand(step, snippets), opts.values ?? {}, opts.playbook.vars ?? [], { host: host.host, user: host.user })
      const command = expanded.text.trim()
      if (!command) {
        put({ hostId: host.id, stepId: step.id, state: 'skipped', code: null, ms: 0, stdout: '', stderr: '', error: 'empty' })
        continue
      }
      const gate = stepNeedsConfirm(step, command, host.level)
      if (gate.confirm) {
        put({ hostId: host.id, stepId: step.id, state: 'waiting', code: null, ms: 0, stdout: '', stderr: '' })
        const answer = await opts.confirm({ host, step, command, dangerous: gate.dangerous, requireHostName: gate.requireHostName })
        if (answer === 'abort') {
          aborted = true
          put({ hostId: host.id, stepId: step.id, state: 'skipped', code: null, ms: 0, stdout: '', stderr: '', error: 'aborted' })
          continue
        }
        if (answer === 'skip-rest') {
          skipRest = true
          put({ hostId: host.id, stepId: step.id, state: 'skipped', code: null, ms: 0, stdout: '', stderr: '', error: 'skip-rest' })
          continue
        }
        if (answer !== 'run') {
          put({ hostId: host.id, stepId: step.id, state: 'skipped', code: null, ms: 0, stdout: '', stderr: '', error: 'skipped' })
          continue
        }
      }
      put({ hostId: host.id, stepId: step.id, state: 'running', code: null, ms: 0, stdout: '', stderr: '' })
      const t0 = Date.now()
      let out: ExecOutcome
      try {
        out = await opts.exec(host, command, step.timeoutSec * 1000)
      } catch (e) {
        out = { code: null, stdout: '', stderr: '', error: e instanceof Error ? e.message : String(e) }
      }
      const failed = Boolean(out.error) || (out.code != null && out.code !== 0)
      put({
        hostId: host.id,
        stepId: step.id,
        state: failed ? 'fail' : 'ok',
        code: out.code,
        ms: Date.now() - t0,
        stdout: out.stdout.slice(0, 32_768),
        stderr: out.stderr.slice(0, 32_768),
        error: out.error
      })
      if (failed && step.stopOnError) skipRest = true
    }
  }

  const selected = opts.hosts
  if (opts.mode === 'serial' || limit === 1) {
    for (const host of selected) {
      if (aborted) {
        for (const step of opts.playbook.steps) {
          put({ hostId: host.id, stepId: step.id, state: 'skipped', code: null, ms: 0, stdout: '', stderr: '', error: 'aborted' })
        }
        continue
      }
      await runHost(host)
    }
  } else {
    let cursor = 0
    const workers = Array.from({ length: Math.min(limit, selected.length) }, async () => {
      for (;;) {
        const i = cursor
        cursor += 1
        const host = selected[i]
        if (!host || aborted) return
        await runHost(host)
      }
    })
    await Promise.all(workers)
  }

  return {
    id: `run-${startedAt}`,
    playbookId: opts.playbook.id,
    name: opts.playbook.name,
    startedAt,
    finishedAt: Date.now(),
    mode: opts.mode,
    cells,
    aborted
  }
}

export function resultToMarkdown(result: PlaybookRunResult, hosts: Array<{ id: string; name: string }>, steps: PlaybookStep[]): string {
  const nameOf = (id: string) => hosts.find((h) => h.id === id)?.name || id
  const lines = [`# ${result.name}`, '', `mode: ${result.mode}`, '']
  lines.push(['host', ...steps.map((s, i) => `step ${i + 1}`)].join(' | '))
  lines.push(['---', ...steps.map(() => '---')].join(' | '))
  const hostIds = [...new Set(result.cells.map((c) => c.hostId))]
  for (const id of hostIds) {
    const cols = steps.map((s) => {
      const cell = result.cells.find((c) => c.hostId === id && c.stepId === s.id)
      if (!cell) return ''
      if (cell.state === 'ok') return `ok ${cell.ms}ms`
      if (cell.state === 'fail') return `fail ${cell.code ?? cell.error ?? ''}`
      return cell.state
    })
    lines.push([nameOf(id), ...cols].join(' | '))
  }
  return lines.join('\n')
}

export const RESULT_LS_KEY = 'aiss.playbook.results.v1'

export function loadResults(store: Pick<Storage, 'getItem'> = globalThis.localStorage): PlaybookRunResult[] {
  try {
    const raw = store.getItem(RESULT_LS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as PlaybookRunResult[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveResult(result: PlaybookRunResult, store: Store = globalThis.localStorage): void {
  const next = [result, ...loadResults(store)].slice(0, 40)
  store.setItem(RESULT_LS_KEY, JSON.stringify(next))
}
