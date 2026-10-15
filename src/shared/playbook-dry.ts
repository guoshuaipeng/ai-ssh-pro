/** W2 dry-run: expand commands and S2 verdicts locally. Sends nothing. */
import { assessCommandRisk } from './command-risk'
import { stepCommand, type Playbook, type PlaybookHost, type PlaybookStep } from './playbook'
import { expandTemplate, type ExpandResult } from './template-vars'

export type DryVerdict = 'direct' | 'confirm' | 'typeHost' | 'danger' | 'blocked' | 'offline' | 'missing' | 'toolbox'

export type DryRow = {
  hostId: string
  stepId: string | null
  stepTitle: string
  command: string
  display: string
  verdict: DryVerdict
  missing: string[]
  unquotedSpecial: boolean
  requireHostName: boolean
}

export type DrySummary = {
  steps: number
  confirms: number
  hostNameChecks: number
  blockedHosts: number
  missing: number
  runnableHosts: number
  offlineHosts: number
}

export type DryRunResult = {
  rows: DryRow[]
  summary: DrySummary
  okToStart: boolean
  nothingSent: true
}

function verdictFor(step: PlaybookStep, expanded: ExpandResult, host: PlaybookHost, offline: boolean): Pick<DryRow, 'verdict' | 'requireHostName'> {
  if (host.level === 'readonly') return { verdict: 'blocked', requireHostName: false }
  if (offline) return { verdict: 'offline', requireHostName: false }
  if (step.type === 'toolbox') return { verdict: 'toolbox', requireHostName: false }
  if (expanded.missing.length || expanded.multilineNoQuote) return { verdict: 'missing', requireHostName: false }
  const danger = Boolean(expanded.text.trim() && assessCommandRisk(expanded.text))
  if (host.level === 'production') {
    if (danger) return { verdict: 'danger', requireHostName: true }
    if (step.confirm || step.lockedConfirm) return { verdict: 'typeHost', requireHostName: true }
    return { verdict: 'confirm', requireHostName: false }
  }
  if (danger) return { verdict: 'danger', requireHostName: false }
  if (step.confirm || step.lockedConfirm) return { verdict: 'confirm', requireHostName: false }
  return { verdict: 'direct', requireHostName: false }
}

export function expandStepCommand(
  step: PlaybookStep,
  host: PlaybookHost,
  snippets: Array<{ id: string; body: string }>,
  values: Record<string, string>,
  playbook: Playbook
): ExpandResult {
  const template = stepCommand(step, snippets)
  return expandTemplate(template, values, playbook.vars ?? [], { host: host.host, user: host.user })
}

/** Pure local expansion. `exec` is intentionally not a parameter. */
export function dryRunPlaybook(opts: {
  playbook: Playbook
  hosts: PlaybookHost[]
  values?: Record<string, string>
  snippets?: Array<{ id: string; body: string }>
  online?: (host: PlaybookHost) => boolean
}): DryRunResult {
  const snippets = opts.snippets ?? []
  const values = opts.values ?? {}
  const rows: DryRow[] = []
  const online = opts.online ?? ((h: PlaybookHost) => Boolean(h.sessionId))
  for (const host of opts.hosts) {
    const offline = !online(host)
    if (host.level === 'readonly') {
      rows.push({
        hostId: host.id,
        stepId: null,
        stepTitle: '',
        command: '',
        display: '',
        verdict: 'blocked',
        missing: [],
        unquotedSpecial: false,
        requireHostName: false
      })
      continue
    }
    if (offline) {
      rows.push({
        hostId: host.id,
        stepId: null,
        stepTitle: '',
        command: '',
        display: '',
        verdict: 'offline',
        missing: [],
        unquotedSpecial: false,
        requireHostName: false
      })
      continue
    }
    for (const step of opts.playbook.steps) {
      const expanded = expandStepCommand(step, host, snippets, values, opts.playbook)
      const gate = verdictFor(step, expanded, host, false)
      rows.push({
        hostId: host.id,
        stepId: step.id,
        stepTitle: step.title || step.command || step.type,
        command: expanded.text,
        display: expanded.display,
        verdict: gate.verdict,
        missing: expanded.missing,
        unquotedSpecial: expanded.unquotedSpecial,
        requireHostName: gate.requireHostName
      })
    }
  }
  const blockedHosts = new Set(rows.filter((r) => r.verdict === 'blocked').map((r) => r.hostId)).size
  const offlineHosts = new Set(rows.filter((r) => r.verdict === 'offline').map((r) => r.hostId)).size
  const missing = rows.filter((r) => r.verdict === 'missing').length
  const confirms = rows.filter((r) => r.verdict === 'confirm' || r.verdict === 'typeHost' || r.verdict === 'danger').length
  const hostNameChecks = rows.filter((r) => r.requireHostName).length
  const steps = rows.filter((r) => r.verdict === 'direct' || r.verdict === 'confirm' || r.verdict === 'typeHost' || r.verdict === 'danger').length
  const runnableHosts = new Set(
    rows.filter((r) => r.verdict === 'direct' || r.verdict === 'confirm' || r.verdict === 'typeHost' || r.verdict === 'danger').map((r) => r.hostId)
  ).size
  const blockedByQuote = rows.some((r) => r.verdict === 'missing' && false)
  void blockedByQuote
  const okToStart = missing === 0 && runnableHosts > 0 && opts.playbook.steps.length > 0 && !rows.some((r) => r.verdict === 'missing')
  return {
    rows,
    summary: { steps, confirms, hostNameChecks, blockedHosts, missing, runnableHosts, offlineHosts },
    okToStart,
    nothingSent: true
  }
}

export function auditVarDetail(playbook: Playbook, values: Record<string, string>): string {
  const parts = (playbook.vars ?? []).map((v) => `${v.name}=${v.sensitive ? '••••' : values[v.name] ?? ''}`)
  return parts.filter(Boolean).join(' ')
}
