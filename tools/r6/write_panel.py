from pathlib import Path

panel = r'''import Select from './ui/Select'
import { useEffect, useMemo, useRef, useState } from 'react'
import { auditWindowBounds, setAuditExportContext, type AuditExportSeed } from '@shared/audit-export'
import {
  filterAudit,
  type AuditEvent,
  type AuditSource,
  type AuditType,
  auditPolicyText
} from '@shared/audit-log'
import { useI18n } from '../lib/i18n'
import EmptyState from './EmptyState'
import PanelHeader from './ui/PanelHeader'
import Button from './ui/Button'
import { openContextMenu } from './ContextMenu'
import DateField from './ui/DateField'
import { auditRangeSince, type AuditRange } from '@shared/audit-range'

const SOURCE_OPTS: Array<AuditSource | ''> = ['', 'AI', 'user', 'terminal', 'snippet', 'batch', 'broadcast', 'playbook', 'sftp']

function outcomeKey(e: AuditEvent): 'allowed' | 'blocked' | 'cancelled' {
  const r = e.gateResult ?? e.outcome
  if (r === 'blocked' || r === 'denied') return 'blocked'
  if (r === 'cancelled') return 'cancelled'
  return 'allowed'
}

export default function AuditLogPanel({
  events,
  host,
  enabled,
  onToggle,
  onClose,
  onClear,
  onExport,
  focusId
}: {
  events: AuditEvent[]
  host?: string
  /** 2.3: row to scroll to and highlight */
  focusId?: string
  enabled: boolean
  onToggle: (on: boolean) => void
  onClose: () => void
  onClear?: () => void
  onExport: (seed: AuditExportSeed) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [type, setType] = useState<AuditType | ''>('')
  const [source, setSource] = useState<AuditSource | ''>('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [range, setRange] = useState<AuditRange>('all')
  const pickRange = (r: AuditRange) => {
    setRange(r)
    if (r === 'custom') return
    setSince(auditRangeSince(r, new Date()))
    setUntil('')
  }
  useEffect(() => {
    setAuditExportContext({
      host: host || '',
      type,
      range: since || until ? 'custom' : '7d',
      since,
      until
    })
    return () => setAuditExportContext(null)
  }, [host, type, since, until])
  const rows = useMemo(() => {
    const bounds = since || until ? auditWindowBounds({ range: 'custom', since, until }) : {}
    const list = filterAudit(events, { host, type, source, text, since: bounds.since, until: bounds.until })
    // keep the focused row visible even past the 200-row cap
    if (focusId) {
      const k = list.findIndex((e) => e.id === focusId)
      if (k >= 200) return [list[k], ...list.slice(0, k), ...list.slice(k + 1)]
    }
    return list
  }, [events, host, type, source, text, since, until, focusId])
  const focusMissing = Boolean(focusId && !events.some((e) => e.id === focusId))
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusId) return
    wrapRef.current?.querySelector(`[data-audit-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: 'center' })
  }, [focusId, rows])
  const policyLabel = (e: AuditEvent) => {
    const parts: string[] = []
    if (typeof e.tabNo === 'number') parts.push(`#${e.tabNo}`)
    if (e.policyChosen || e.policyEffective) {
      const a = e.policyChosen ? t(`policy.${e.policyChosen}` as 'policy.ask') : ''
      const b = e.policyEffective ? t(`policy.${e.policyEffective}` as 'policy.ask') : ''
      parts.push(a && b && a !== b ? `${a}→${b}` : a || b)
    }
    if (e.policySource) {
      const short =
        e.policySource === 'global' ? t('au2.srcGlobal') : e.policySource === 'host' ? t('au2.srcHost') : t('au2.srcTemp')
      parts.push(short)
    }
    if (e.policyCappedBy) parts.push(t('au2.capped', { by: t(`l4.${e.policyCappedBy}` as 'l4.readonly') }))
    if (e.protection && e.protection !== 'normal') parts.push(t(`l4.${e.protection}` as 'l4.production'))
    return parts.join(' · ') || '—'
  }
  return (
    <div className="workspace-panel" data-testid="audit-log">
      <PanelHeader
        title={
          <>
            {t('l4.auditTitle')}
            {host ? <span className="l7-meta">{host}</span> : null}
          </>
        }
        actions={
          <>
            <Button
              data-testid="s1b-open"
              onClick={() => onExport({ host: host || '', type, range: since || until ? 'custom' : '7d', since, until })}
            >
              {t('s1b.open')}
            </Button>
            <Button
              variant="icon"
              icon="menu"
              data-testid="audit-more"
              aria-haspopup="menu"
              aria-label={t('au2.more')}
              title={t('au2.more')}
              onClick={(ev) => {
                const r = ev.currentTarget.getBoundingClientRect()
                openContextMenu(ev, [
                  { id: 'toggle', label: `${enabled ? '✓ ' : ''}${t('l4.audit')}`, onSelect: () => onToggle(!enabled) },
                  ...(onClear ? ['sep' as const, { id: 'clear', label: t('audit.clear'), danger: true, onSelect: onClear }] : [])
                ], { anchor: { x: Math.max(8, r.right - 200), y: r.bottom + 2 } })
              }}
            />
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
          </>
        }
      />
      {!enabled ? (
        <div className="l7-mute" data-testid="audit-off">
          <span>{t('l4.auditOff')}</span>
          <Button variant="primary" onClick={() => onToggle(true)}>
            {t('l4.auditEnable')}
          </Button>
        </div>
      ) : null}
      <div className="l2-filters">
        <Select
          testId="audit-type"
          ariaLabel={t('l2.rule')}
          value={type}
          onChange={(v) => setType(v as AuditType | '')}
          options={[
            { value: '', label: t('l2.all') },
            { value: 'command', label: 'command' },
            { value: 'gate', label: 'gate' },
            { value: 'ai.action', label: 'ai.action' },
            { value: 'alert.execute', label: 'alert.execute' },
            { value: 'danger', label: 'danger' },
            { value: 'playbook.run', label: 'playbook.run' },
            { value: 'forward.remote', label: 'forward.remote' }
          ]}
        />
        <Select
          testId="audit-source"
          ariaLabel={t('au2.source')}
          value={source}
          onChange={(v) => setSource(v as AuditSource | '')}
          options={SOURCE_OPTS.map((v) => ({
            value: v,
            label: v === '' ? t('au2.sourceAll') : v === 'AI' ? t('au2.sourceAi') : v
          }))}
        />
        <input className="au2-search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('m2.search')} aria-label={t('m2.search')} />
        <Select
          testId="audit-range"
          ariaLabel={t('au2.range')}
          value={range}
          onChange={(v) => pickRange(v as AuditRange)}
          options={[
            { value: 'all', label: t('au2.rangeAll') },
            { value: '1d', label: t('au2.range1d') },
            { value: '7d', label: t('au2.range7d') },
            { value: '30d', label: t('au2.range30d') },
            { value: 'custom', label: t('au2.rangeCustom') }
          ]}
        />
        {range === 'custom' ? (
          <span className="au2-dates" data-testid="audit-dates">
            <DateField testId="audit-since" value={since} max={until || undefined} onChange={setSince} ariaLabel={t('m2.since')} placeholder={t('df.start')} />
            <span className="l7-meta">{t('au2.to')}</span>
            <DateField testId="audit-until" value={until} min={since || undefined} onChange={setUntil} ariaLabel={t('m2.until')} placeholder={t('df.end')} />
          </span>
        ) : null}
        <span className="l7-meta au2-count" data-testid="audit-count">{t('au2.count', { n: rows.length })}</span>
        {/* entry points kept for automation and assistive tech; visually they live in "更多" */}
        {onClear ? (
          <button type="button" className="sr-only" tabIndex={-1} data-testid="audit-clear" onClick={onClear}>{t('audit.clear')}</button>
        ) : null}
        <input id="audit-enable" className="sr-only" tabIndex={-1} type="checkbox" checked={enabled} aria-label={t('l4.audit')} onChange={(e) => onToggle(e.target.checked)} />
      </div>
      {focusMissing ? (
        <div className="l7-mute" data-testid="audit-focus-missing">
          <span>{t('exec.notFound')}</span>
        </div>
      ) : null}
      <div className="workspace-panel-body audit-table-wrap" ref={wrapRef}>
        {rows.length === 0 ? (
          <EmptyState
            testId="audit-empty"
            icon="audit"
            title={t('pf4.auditTitle')}
            desc={t('pf4.auditDesc')}
            primary={{
              label: t('pf4.auditCta'),
              onClick: () => (enabled ? document.querySelector<HTMLButtonElement>('[data-testid="audit-more"]')?.click() : onToggle(true))
            }}
          />
        ) : (
          <table className="audit-table" data-testid="audit-table">
            <thead>
              <tr>
                <th>{t('l4.colTime')}</th>
                <th>{t('l4.colType')}</th>
                <th>{t('l2.host')}</th>
                <th>{t('au2.colSource')}</th>
                <th>{t('au2.colTab')}</th>
                <th>{t('l4.colOutcome')}</th>
                <th>{t('au2.colPolicy')}</th>
                <th>{t('l4.colDetail')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((e) => {
                const out = outcomeKey(e)
                return (
                  <tr
                    key={e.id}
                    data-audit-id={e.id}
                    data-audit-source={e.source || ''}
                    data-audit-tab={typeof e.tabNo === 'number' ? String(e.tabNo) : ''}
                    data-audit-outcome={out}
                    className={e.id === focusId ? 'is-focus' : undefined}
                    aria-current={e.id === focusId ? 'true' : undefined}
                  >
                    <td>{new Date(e.at).toLocaleString()}</td>
                    <td>{e.type}</td>
                    <td title={e.host}>{e.host}</td>
                    <td>
                      <span className={`au2-chip au2-src${e.source === 'AI' ? ' is-ai' : ''}`} data-testid="audit-row-source">
                        {e.source === 'AI' ? t('au2.sourceAi') : e.source || '—'}
                      </span>
                    </td>
                    <td>
                      {typeof e.tabNo === 'number' ? (
                        <span className="au2-chip au2-tab" data-testid="audit-row-tab">{`#${e.tabNo}`}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`au2-outcome is-${out}`} data-testid="audit-row-outcome">
                        {t(`au2.out.${out}` as 'au2.out.allowed')}
                      </span>
                    </td>
                    <td className="au2-policy" title={auditPolicyText(e)} data-testid="audit-row-policy">
                      {policyLabel(e)}
                    </td>
                    <td className="au2-detail" title={e.detail}>
                      {e.detail}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
'''

Path('src/renderer/src/components/AuditLogPanel.tsx').write_text(panel, encoding='utf-8', newline='\n')
print('panel written', len(panel))
