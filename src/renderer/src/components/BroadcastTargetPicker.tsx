import { useMemo, useState } from 'react'
import Modal from './Modal'
import { useI18n } from '../lib/i18n'

export type BroadcastTabOption = { sessionId: string; title: string; group?: string; isProd?: boolean }

type Props = {
  open: boolean
  tabs: BroadcastTabOption[]
  initialSelected: string[]
  onCancel: () => void
  onConfirm: (sessionIds: string[]) => void
  /** Turn broadcast off without picking new targets. */
  onStop?: () => void
}

export default function BroadcastTargetPicker({ open, tabs, initialSelected, onCancel, onConfirm, onStop }: Props) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected))

  const liveSelected = useMemo(() => {
    const live = new Set(tabs.map((x) => x.sessionId))
    return [...selected].filter((id) => live.has(id))
  }, [tabs, selected])
  const prodCount = useMemo(
    () => tabs.filter((x) => liveSelected.includes(x.sessionId) && x.isProd).length,
    [tabs, liveSelected]
  )
  const n = liveSelected.length

  if (!open) return null

  return (
    <Modal open title={t('x3.pickTitle')} onClose={onCancel} width={480} testId="broadcast-target-picker">
      <p className="o2-hint" data-testid="x3-lead">
        {t('x3.lead')}
      </p>
      {tabs.length < 2 ? (
        <p className="o2-hint">{t('x3.needTwo')}</p>
      ) : (
        <ul className="x3-list">
          {tabs.map((tab) => (
            <li key={tab.sessionId}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(tab.sessionId)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(tab.sessionId)
                      else next.delete(tab.sessionId)
                      return next
                    })
                  }}
                />
                <span>{tab.title}</span>
                {tab.isProd ? <em className="x3-prod">{t('x3.prod')}</em> : null}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="modal-actions">
        <button type="button" onClick={() => setSelected(new Set(tabs.map((x) => x.sessionId)))} disabled={tabs.length < 2}>
          {t('x3.selectAll')}
        </button>
        <button type="button" onClick={() => setSelected(new Set())}>
          {t('x3.selectNone')}
        </button>
        {onStop ? (
          <button type="button" data-testid="x3-stop" onClick={onStop}>
            {t('x3.stop')}
          </button>
        ) : null}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onCancel}>
          {t('dlg.cancel')}
        </button>
        <button
          type="button"
          className={prodCount ? 'primary danger' : 'primary'}
          disabled={n < 2}
          data-testid="x3-start"
          onClick={() => onConfirm(liveSelected)}
        >
          {prodCount ? t('x3.startWithProd', { n, k: prodCount }) : t('x3.start', { n })}
        </button>
      </div>
    </Modal>
  )
}
