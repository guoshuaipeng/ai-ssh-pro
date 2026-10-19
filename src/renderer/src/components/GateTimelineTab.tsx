import { useMemo, useState } from 'react'
import { auditEnabled, gateToCsv, loadGateEvents, type AuditEvent, type GateResult, type GateRule } from '@shared/audit-log'
import { tg, type MessageKey } from '../lib/i18n'
import PanelHeader from './ui/PanelHeader'
import Button from './ui/Button'

const RESULT_KEY: Record<GateResult, MessageKey> = {
  allowed: 's2b.r.allowed',
  confirmed: 's2b.r.confirmed',
  denied: 's2b.r.denied',
  blocked: 's2b.r.blocked',
  cancelled: 's2b.r.cancelled',
  unlock: 's2b.r.unlock',
  restore: 's2b.r.restore'
}

const RULE_KEY: Record<GateRule, MessageKey> = {
  danger: 's2b.rule.danger',
  prod: 's2b.rule.prod',
  readonlyWrite: 's2b.rule.readonlyWrite',
  sftp: 's2b.rule.sftp',
  playbook: 's2b.rule.playbook'
}

const SHORT: Partial<Record<GateResult, MessageKey>> = {
  blocked: 's2b.short.blocked',
  allowed: 's2b.short.allowed',
  confirmed: 's2b.short.confirmed',
  cancelled: 's2b.short.cancelled'
}

function clock(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function gateResultLabel(result: GateResult | undefined, narrow: boolean): string {
  if (!result) return ''
  if (narrow && SHORT[result]) return tg(SHORT[result]!)
  return tg(RESULT_KEY[result])
}

export function GateTimelineRows({
  events,
  narrow,
  onSelect
}: {
  events: AuditEvent[]
  narrow?: boolean
  onSelect?: (event: AuditEvent) => void
}) {
  return (
    <>
      {events.map((e) => (
        <button key={e.id} type="button" className="s2b-row" data-testid="s2b-row" title={e.detail} onClick={() => onSelect?.(e)}>
          <span className="s2b-time">{clock(e.at)}</span>
          <span className="s2b-kind">{tg('s2b.k.gate')}</span>
          <span className={`s2b-chip is-${e.gateResult ?? 'allowed'}`}>{gateResultLabel(e.gateResult, Boolean(narrow))}</span>
          <span className="s2b-rule">{e.gateRule ? tg(RULE_KEY[e.gateRule]) : ''}</span>
          <span className="s2b-host">{e.host}</span>
          <span className="s2b-sum">{e.detail}</span>
        </button>
      ))}
    </>
  )
}

export default function GateTimelineTab({
  focusId,
  hostKey,
  onEditProtection,
  onOpenAudit
}: {
  focusId?: string
  hostKey?: string
  onEditProtection: (profileId: string) => void
  onOpenAudit: () => void
}) {
  const [result, setResult] = useState<GateResult | ''>('')
  const [host, setHost] = useState(hostKey ?? '')
  const [rule, setRule] = useState<GateRule | ''>('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(focusId ?? '')
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1024)
  const events = loadGateEvents()
  const rows = useMemo(() => {
    const text = q.trim().toLowerCase()
    return events.filter((e) => {
      if (result && e.gateResult !== result) return false
      if (rule && e.gateRule !== rule) return false
      if (host && e.host !== host && e.profileId !== host) return false
      if (text && !`${e.host} ${e.detail} ${e.gateRule ?? ''}`.toLowerCase().includes(text)) return false
      return true
    })
  }, [events, result, rule, host, q])
  const opened = rows.find((e) => e.id === openId) ?? events.find((e) => e.id === openId)
  return (
    <div className="workspace-panel s2b-panel" data-testid="gate-timeline" onMouseEnter={() => setNarrow(window.innerWidth <= 1024)}>
      <PanelHeader
        title={tg('s2b.tab')}
        actions={
          <>
            <Button variant="primary"
              onClick={() => void window.aiss.files.saveText('gate-log.csv', gateToCsv(rows))}
            >
              {tg('s2b.exportCsv')}
            </Button>
            <button type="button" onClick={onOpenAudit}>{tg('s2b.openAudit')}</button>
          </>
        }
      />
      {!auditEnabled() ? <p className="l7-muted" data-testid="s2b-audit-off">{tg('s2b.auditOffNote')}</p> : null}
      <div className="s2b-filters">
        <select aria-label={tg('s2b.colResult')} value={result} onChange={(e) => setResult(e.target.value as GateResult | '')}>
          <option value="">{tg('l2.all')}</option>
          {(Object.keys(RESULT_KEY) as GateResult[]).map((key) => (
            <option key={key} value={key}>{tg(RESULT_KEY[key])}</option>
          ))}
        </select>
        <input value={host} aria-label={tg('l2.host')} placeholder={tg('l2.host')} onChange={(e) => setHost(e.target.value)} />
        <select aria-label={tg('s2b.colRule')} value={rule} onChange={(e) => setRule(e.target.value as GateRule | '')}>
          <option value="">{tg('l2.all')}</option>
          {(Object.keys(RULE_KEY) as GateRule[]).map((key) => (
            <option key={key} value={key}>{tg(RULE_KEY[key])}</option>
          ))}
        </select>
        <input value={q} aria-label={tg('m2.search')} placeholder={tg('m2.search')} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="workspace-panel-body">
        {rows.length === 0 ? (
          <div data-testid="s2b-empty">
            <p>{tg('s2b.empty')}</p>
            <p className="l7-muted">{tg('s2b.emptyHint')}</p>
          </div>
        ) : (
          <GateTimelineRows events={rows} narrow={narrow} onSelect={(e) => setOpenId(e.id)} />
        )}
        {opened ? (
          <div className="s2b-detail" data-testid="s2b-detail">
            <p>{opened.detail}</p>
            <p className="l7-muted">{opened.protection ?? ''}</p>
            <button type="button" onClick={() => opened.profileId && onEditProtection(opened.profileId)}>
              {tg('s2b.openProtection')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
