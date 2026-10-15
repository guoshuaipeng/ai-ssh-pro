import { useMemo, useState } from 'react'
import {
  MAINT_DEFAULT_H,
  MAINT_PRESETS_H,
  activeWindows,
  canStart,
  endMaintenance,
  formatRemaining,
  loadMaintenance,
  matchCount,
  startMaintenance,
  type MaintenanceScope,
  type MaintenanceWindow
} from '@shared/maintenance'
import { appendAudit } from '@shared/audit-log'
import { appendTimeline, eventsFor } from '@shared/timeline'
import { confirmDialog } from '../lib/dialogs'
import { useI18n } from '../lib/i18n'
import { showToast } from '../lib/toast'
import Modal from './Modal'

export type MaintHostOption = { id: string; title: string; tags: string[]; sessionId?: string }

type Props = {
  hosts: MaintHostOption[]
  presetHostKeys?: string[]
  alerts?: Array<{ id: string; hostKey: string; hostTitle: string }>
  onChanged?: () => void
}

/** L2d center tab. Start is an in-app modal. Ending early confirms in-app. No commands. */
export default function MaintenanceTab({ hosts, presetHostKeys, alerts = [], onChanged }: Props) {
  const { t } = useI18n()
  const [list, setList] = useState<MaintenanceWindow[]>(() => loadMaintenance())
  const [open, setOpen] = useState(() => activeWindows(loadMaintenance()).length === 0)
  const [scope, setScope] = useState<MaintenanceScope>('hosts')
  const [picked, setPicked] = useState<string[]>(presetHostKeys ?? [])
  const [tags, setTags] = useState<string[]>([])
  const [hours, setHours] = useState<number>(MAINT_DEFAULT_H)
  const [custom, setCustom] = useState(false)
  const [customHours, setCustomHours] = useState('3')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const tagOptions = useMemo(() => [...new Set(hosts.flatMap((h) => h.tags))].sort(), [hosts])
  const active = activeWindows(list, now)
  const chosenHours = custom ? Number(customHours) : hours
  const ready = canStart({ scope, hostKeys: picked, tagIds: tags, hours: chosenHours })

  const refresh = () => {
    setList(loadMaintenance())
    setNow(Date.now())
    onChanged?.()
    window.dispatchEvent(new Event('aiss-maintenance-change'))
  }

  const writeRecord = (kind: string, detail: string, window: { scope: MaintenanceScope; hostKeys: string[]; tagIds: string[] }) => {
    const hostIds = new Set(window.hostKeys)
    const tagIds = new Set(window.tagIds)
    const covered = new Set<string>(window.hostKeys)
    for (const host of hosts) {
      const tagged = window.scope === 'tags' && host.tags.some((tag) => tagIds.has(tag))
      if (window.scope === 'hosts' ? hostIds.has(host.id) : tagged) {
        covered.add(host.id)
        covered.add(host.title)
        if (host.sessionId) covered.add(host.sessionId)
      }
    }
    appendAudit({ type: 'alert.maintenance', host: [...covered].join(', ') || '—', source: 'user', outcome: 'allowed', detail: `${kind} ${detail}` })
    for (const alert of alerts) {
      if (!covered.has(alert.hostKey) && !covered.has(alert.hostTitle)) continue
      if (!eventsFor(alert.id).length && kind !== 'alert.maintenance.start') continue
      appendTimeline({
        alertId: alert.id,
        kind: kind as 'alert.maintenance.start',
        hostKey: alert.hostKey,
        summary: detail
      })
    }
  }

  const start = () => {
    const result = startMaintenance({ scope, hostKeys: picked, tagIds: tags, hours: chosenHours, note })
    if (!result.ok) {
      setError(result.reason === 'range' ? t('l2d.range') : t('l2d.empty'))
      return
    }
    writeRecord(result.record.kind, result.record.detail, result.window)
    setOpen(false)
    setNote('')
    refresh()
    showToast(t('l2d.toastStarted', { time: new Date(result.window.endsAt).toLocaleTimeString() }))
  }

  const endEarly = async (row: MaintenanceWindow) => {
    const scopeLabel = row.scope === 'hosts' ? row.hostKeys.join(', ') : row.tagIds.join(', ')
    const ok = await confirmDialog({
      title: t('l2d.endTitle'),
      body: t('l2d.endBody', { scope: scopeLabel }),
      confirmText: t('l2d.endConfirm')
    })
    if (!ok) return
    const ended = endMaintenance(row.id, 'user')
    if (!ended) return
    writeRecord(ended.record.kind, ended.record.detail, ended.window)
    refresh()
    showToast(t('l2d.toastEnded'))
  }

  const catalog = hosts.map((h) => ({ keys: [h.id, h.title], tags: h.tags }))

  return (
    <div className="workspace-panel l2d-panel" data-testid="l2d-panel">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">
          {t('l2d.panelTitle')}
          {active.length ? <span className="l2d-badge" data-testid="l2d-badge-n">{t('l2d.badgeN', { n: active.length })}</span> : null}
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" className="primary" data-testid="l2d-new" onClick={() => setOpen(true)}>
            {t('l2d.new')}
          </button>
        </div>
      </div>
      <div className="workspace-panel-body">
        {active.length === 0 ? <p data-testid="l2d-empty">{t('l2d.empty')}</p> : null}
        {active.map((row) => {
          const label = row.scope === 'hosts' ? row.hostKeys.join(', ') : row.tagIds.join(', ')
          const n = matchCount(row, catalog)
          return (
            <div key={row.id} className="l2d-card" data-testid="l2d-card">
              <div className="l2d-card-head">
                <strong>{row.scope === 'hosts' ? t('l2d.scopeHosts') : t('l2d.scopeTags')} {label}</strong>
                <span>{t('l2d.remaining', { t: formatRemaining(row.endsAt - now) })}</span>
                <button type="button" data-testid="l2d-end" onClick={() => void endEarly(row)}>
                  {t('l2d.endEarly')}
                </button>
              </div>
              <p className="l7-muted">
                {new Date(row.startedAt).toLocaleTimeString()} · {new Date(row.endsAt).toLocaleTimeString()}
                {row.scope === 'tags' ? ` · ${n}` : ''}
                {row.note ? ` · ${row.note}` : ''}
              </p>
            </div>
          )
        })}
      </div>
      <Modal
        open={open}
        title={t('l2d.modalTitle')}
        onClose={() => setOpen(false)}
        testId="l2d-modal"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)}>{t('dlg.cancel')}</button>
            <button type="button" className="primary" data-testid="l2d-start" disabled={!ready} onClick={start}>
              {t('l2d.start')}
            </button>
          </>
        }
      >
        <p className="l7-muted">{t('l2d.hint')}</p>
        <div className="l2d-scope" data-testid="l2d-scope">
          <label><input type="radio" name="l2d-scope" checked={scope === 'hosts'} onChange={() => setScope('hosts')} /> {t('l2d.scopeHosts')}</label>
          <label><input type="radio" name="l2d-scope" checked={scope === 'tags'} onChange={() => setScope('tags')} /> {t('l2d.scopeTags')}</label>
        </div>
        {scope === 'hosts' ? (
          <div className="l2d-chips" data-testid="l2d-hosts">
            {hosts.map((h) => (
              <button
                key={h.id}
                type="button"
                className={picked.includes(h.id) ? 'is-on' : ''}
                onClick={() => setPicked((cur) => (cur.includes(h.id) ? cur.filter((id) => id !== h.id) : [...cur, h.id]))}
              >
                {h.title}
              </button>
            ))}
          </div>
        ) : (
          <div className="l2d-chips" data-testid="l2d-tags">
            {tagOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                className={tags.includes(tag) ? 'is-on' : ''}
                onClick={() => setTags((cur) => (cur.includes(tag) ? cur.filter((id) => id !== tag) : [...cur, tag]))}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        <div className="l2d-duration" data-testid="l2d-duration">
          <span>{t('l2d.duration')}</span>
          {MAINT_PRESETS_H.map((h) => (
            <label key={h}>
              <input type="radio" name="l2d-hours" checked={!custom && hours === h} onChange={() => { setCustom(false); setHours(h) }} />
              {h}h
            </label>
          ))}
          <label>
            <input type="radio" name="l2d-hours" checked={custom} onChange={() => setCustom(true)} />
            {t('l2d.custom')}
          </label>
          {custom ? (
            <input
              data-testid="l2d-custom"
              aria-label={t('l2d.hours')}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
            />
          ) : null}
        </div>
        <label className="settings-row">
          <span>{t('l2d.note')}</span>
          <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error ? <p className="l2-error">{error}</p> : null}
        <p className="l7-muted">{t('l2d.noAuto')}</p>
      </Modal>
    </div>
  )
}
