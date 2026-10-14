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
}

export default function BroadcastTargetPicker({ open, tabs, initialSelected, onCancel, onConfirm }: Props) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected))

  const prodCount = useMemo(() => tabs.filter((x) => selected.has(x.sessionId) && x.isProd).length, [tabs, selected])
  const n = selected.size

  if (!open) return null

  return (
    <Modal open title={t('x3.pickTitle')} onClose={onCancel} width={480} testId="broadcast-target-picker">
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
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onCancel}>
          {t('dlg.cancel')}
        </button>
        <button
          type="button"
          className={prodCount ? 'primary danger' : 'primary'}
          disabled={n < 2}
          onClick={() => onConfirm([...selected])}
        >
          {prodCount ? t('x3.startWithProd', { n, k: prodCount }) : t('x3.start', { n })}
        </button>
      </div>
    </Modal>
  )
}
