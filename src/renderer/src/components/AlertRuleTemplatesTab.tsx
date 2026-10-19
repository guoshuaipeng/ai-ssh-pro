import { useMemo, useState } from 'react'
import {
  ALERT_PACKS,
  alertingMasterOn,
  defaultRulesSegment,
  enableAlertPack,
  packStatus,
  removeAlertPack,
  setPackEnabled,
  updatePackRule,
  type AlertPackId
} from '@shared/alert-rule-packs'
import type { AlertRulesState, AlertScope } from '@shared/alert-rules'
import { useI18n, type MessageKey } from '../lib/i18n'
import { showToast } from '../lib/toast'
import Modal from './Modal'
import PanelHeader from './ui/PanelHeader'
import Button from './ui/Button'

const PACK_NAME: Record<AlertPackId, MessageKey> = {
  'pack.cpu-high': 'l2c.pack.cpu',
  'pack.disk-full': 'l2c.pack.disk',
  'pack.proc-svc': 'l2c.pack.proc'
}
const PACK_DESC: Record<AlertPackId, MessageKey> = {
  'pack.cpu-high': 'l2c.pack.cpuDesc',
  'pack.disk-full': 'l2c.pack.diskDesc',
  'pack.proc-svc': 'l2c.pack.procDesc'
}

type HostOpt = { id: string; title: string }

export default function AlertRuleTemplatesTab({
  state,
  hosts,
  folderId,
  initialSegment,
  focusPackId,
  onChange,
  onOpenWorkbench
}: {
  state: AlertRulesState
  hosts: HostOpt[]
  folderId?: string
  initialSegment?: 'mine' | 'templates'
  focusPackId?: string
  onChange: (next: AlertRulesState) => void
  onOpenWorkbench: () => void
}) {
  const { t } = useI18n()
  const [segment, setSegment] = useState<'mine' | 'templates'>(initialSegment ?? defaultRulesSegment(state))
  const [focus, setFocus] = useState(focusPackId ?? '')
  const [pending, setPending] = useState<AlertPackId | null>(null)
  const [scope, setScope] = useState<AlertScope>('all')
  const [hostIds, setHostIds] = useState<string[]>([])
  const [threshold, setThreshold] = useState(90)
  const [sustain, setSustain] = useState(2)
  const [unit, setUnit] = useState('sshd')
  const [openAfter, setOpenAfter] = useState(false)
  const masterOn = alertingMasterOn(state)
  const pack = pending ? ALERT_PACKS.find((p) => p.id === pending) : undefined

  const openEnable = (id: AlertPackId) => {
    const row = ALERT_PACKS.find((p) => p.id === id)
    if (!row) return
    if (packStatus(state, id).enabled) {
      setSegment('mine')
      setFocus(id)
      showToast(t('l2c.toastDup'))
      return
    }
    setPending(id)
    setScope('all')
    setHostIds([])
    setThreshold(row.threshold)
    setSustain(row.sustainMin)
    setUnit(row.unit ?? 'sshd')
    setOpenAfter(false)
  }

  const commit = () => {
    if (!pending) return
    const result = enableAlertPack(state, pending, {
      scope,
      hostIds,
      folderId,
      threshold,
      sustainMin: sustain,
      unit
    })
    if (result.status === 'duplicate') {
      setSegment('mine')
      setFocus(pending)
      showToast(t('l2c.toastDup'))
    } else {
      onChange(result.state)
      setSegment('mine')
      setFocus(pending)
      showToast(masterOn ? t('l2c.toastWrote') : t('l2c.toastMasterOff'), masterOn ? undefined : { action: { label: t('l2c.goEnable'), run: () => onChange({ ...result.state, notify: { ...result.state.notify, systemNotify: true } }) } })
      if (openAfter) onOpenWorkbench()
    }
    setPending(null)
  }

  const mineRows = useMemo(() => {
    const builtin = state.rules.filter((r) => r.packId)
    const extra = state.packRules ?? []
    return [...builtin, ...extra]
  }, [state])

  return (
    <div className="workspace-panel l2c-panel" data-testid="alert-rule-templates">
      <PanelHeader
        title={t('o2.rulesTitle')}
        actions={
          <>
            <Button variant="primary" onClick={() => setSegment('templates')}>
              {t('l2c.seg.templates')}
            </Button>
          </>
        }
      />
      <div className="l2c-seg" role="tablist">
        <button type="button" className={segment === 'mine' ? 'is-on' : ''} onClick={() => setSegment('mine')}>
          {t('l2c.seg.mine')} {mineRows.length || ''}
        </button>
        <button type="button" data-testid="l2c-templates" className={segment === 'templates' ? 'is-on' : ''} onClick={() => setSegment('templates')}>
          {t('l2c.seg.templates')}
        </button>
      </div>
      {segment === 'templates' ? (
        <div className="workspace-panel-body l2c-body">
          <p className="l7-muted">{t('l2c.pageHint')}</p>
          {ALERT_PACKS.map((row) => {
            const status = packStatus(state, row.id)
            return (
              <article key={row.id} className="l2c-card" data-testid={`l2c-pack-${row.id}`}>
                <div className="l2c-card-main">
                  <strong>{t(PACK_NAME[row.id])}</strong>
                  <p>{t(PACK_DESC[row.id])}</p>
                  {status.customized ? <span className="l2c-note">{t('l2c.customized')}</span> : null}
                </div>
                <button type="button" className="l2c-enable" data-testid={`l2c-enable-${row.id}`} onClick={() => openEnable(row.id)}>
                  {status.enabled ? t('l2c.enabled') : t('l2c.enable')}
                </button>
              </article>
            )
          })}
          <p className="l7-muted">{t('l2c.mineHint')}</p>
        </div>
      ) : (
        <div className="workspace-panel-body l2c-body">
          <label className="l4-check">
            <input
              type="checkbox"
              checked={masterOn}
              onChange={(e) => onChange({ ...state, notify: { ...state.notify, systemNotify: e.target.checked } })}
            />
            {t('o2.notifySystem')}
          </label>
          {!masterOn ? <p className="l7-muted">{t('l2c.masterOff')}</p> : null}
          {mineRows.length === 0 ? (
            <p className="l7-muted">{t('l2c.pageHint')}</p>
          ) : (
            mineRows.map((row) => (
              <article key={row.id} className={`l2c-card${focus === row.packId ? ' is-focus' : ''}`} data-testid="l2c-mine-row">
                <div className="l2c-card-main">
                  <strong>
                    {row.packId && PACK_NAME[row.packId as AlertPackId] ? t(PACK_NAME[row.packId as AlertPackId]) : row.id}
                    <span className="l2c-badge">{t('l2c.badge')}</span>
                  </strong>
                  {'unit' in row && row.unit ? (
                    <label className="l2c-inline">
                      {t('l2c.unit')}
                      <input
                        value={row.unit}
                        onChange={(e) => row.packId && onChange(updatePackRule(state, row.packId, { unit: e.target.value }))}
                      />
                    </label>
                  ) : row.id !== 'offline' ? (
                    <label className="l2c-inline">
                      {t('o2.colThreshold')}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={row.threshold}
                        onChange={(e) => row.packId && onChange(updatePackRule(state, row.packId, { threshold: Number(e.target.value) || row.threshold }))}
                      />
                    </label>
                  ) : null}
                </div>
                <div className="workspace-panel-actions">
                  <button type="button" onClick={() => row.packId && onChange(setPackEnabled(state, row.packId, !row.enabled))}>
                    {row.enabled ? t('l2c.disable') : t('l2c.enable')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!row.packId) return
                      const prev = state
                      onChange(removeAlertPack(state, row.packId))
                      showToast(t('l2c.deleted'), { action: { label: t('tab.list.undo'), run: () => onChange(prev) } })
                    }}
                  >
                    {t('l2c.delete')}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}
      <Modal open={Boolean(pack)} title={pack ? t('l2c.modalTitle', { name: t(PACK_NAME[pack.id]) }) : ''} onClose={() => setPending(null)} width={480} testId="l2c-enable-modal">
        {pack ? (
          <div className="l2c-modal">
            <p>{t('l2c.modalBody', { n: pack.ruleCount })}</p>
            <div className="l2c-scope" role="radiogroup" aria-label={t('l7b.scope')}>
              <label><input type="radio" name="l2c-scope" checked={scope === 'all'} onChange={() => setScope('all')} />{t('l2c.scopeAll')}</label>
              <label><input type="radio" name="l2c-scope" checked={scope === 'group'} disabled={!folderId} onChange={() => setScope('group')} />{t('l2c.scopeGroup')}</label>
              <label><input type="radio" name="l2c-scope" checked={scope === 'hosts'} onChange={() => setScope('hosts')} />{t('l2c.scopePick')}</label>
            </div>
            {scope === 'hosts' ? (
              <div className="l2c-hosts">
                {hosts.map((h) => (
                  <label key={h.id}>
                    <input
                      type="checkbox"
                      checked={hostIds.includes(h.id)}
                      onChange={(e) => setHostIds((cur) => (e.target.checked ? [...cur, h.id] : cur.filter((id) => id !== h.id)))}
                    />
                    {h.title}
                  </label>
                ))}
              </div>
            ) : null}
            {pack.metric === 'proc' ? (
              <label className="l2c-inline">
                {t('l2c.unit')}
                <input value={unit} onChange={(e) => setUnit(e.target.value)} />
              </label>
            ) : (
              <label className="l2c-inline">
                {t('o2.colThreshold')}
                <input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || threshold)} />
                <span>{t('o2.colSustain')}</span>
                <input type="number" min={0} max={60} value={sustain} onChange={(e) => setSustain(Number(e.target.value) || 0)} />
              </label>
            )}
            <label className="l4-check">
              <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} />
              {t('l2c.openWorkbench')}
            </label>
            <p className="l2c-warn">{t('l2c.noAuto')}</p>
            {!masterOn ? <p className="l7-muted">{t('l2c.masterOff')}</p> : null}
            <div className="modal-actions">
              <button type="button" onClick={() => setPending(null)}>{t('dlg.cancel')}</button>
              <Button variant="primary" data-testid="l2c-confirm" disabled={scope === 'hosts' && hostIds.length === 0} onClick={commit}>
                {t('l2c.confirmEnable')}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
