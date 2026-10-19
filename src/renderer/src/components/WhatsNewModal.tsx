import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import Modal from './Modal'
import type { TitlebarMenuAction } from './TitlebarMenus'
import { changelogFor } from '@shared/changelog'
import Button from './ui/Button'

type Props = {
  open: boolean
  version: string
  onClose: () => void
  onAction: (action: TitlebarMenuAction) => void
}

export const WHATS_NEW_AUTO_KEY = 'aiss.whatsNewAuto'

/** V3: what changed in this version, each row says where to find it (clickable when it can open the feature). */
export default function WhatsNewModal({ open, version, onClose, onAction }: Props) {
  const { t, locale } = useI18n()
  const [noAuto, setNoAuto] = useState(() => localStorage.getItem(WHATS_NEW_AUTO_KEY) === '0')
  const pick = (b: { zh: string; en: string }) => (locale === 'zh-CN' ? b.zh : b.en)
  const entries = changelogFor(version)
  return (
    <Modal
      open={open}
      title={t('wn.title', { version })}
      onClose={onClose}
      width={560}
      footer={
        <div className="wn-foot">
          <label className="wn-noauto">
            <input
              type="checkbox"
              checked={noAuto}
              onChange={(e) => {
                setNoAuto(e.target.checked)
                localStorage.setItem(WHATS_NEW_AUTO_KEY, e.target.checked ? '0' : '1')
              }}
            />
            {t('wn.noAuto')}
          </label>
          <Button variant="primary" onClick={onClose}>
            {t('wn.ok')}
          </Button>
        </div>
      }
    >
      <div className="wn-panel" data-testid="whats-new">
        {entries.length ? (
          <ul className="wn-list">
            {entries.map((it, i) => (
              <li key={i} className="wn-item">
                <span className="wn-icon" aria-hidden>
                  {it.icon}
                </span>
                <div className="wn-text">
                  <span>{pick(it.text)}</span>
                  {it.where ? (
                    it.action ? (
                      <button
                        type="button"
                        className="wn-where wn-where--link"
                        onClick={() => {
                          onClose()
                          window.setTimeout(() => onAction(it.action!), 0)
                        }}
                      >
                        {pick(it.where)}
                      </button>
                    ) : (
                      <span className="wn-where">{pick(it.where)}</span>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wn-intro">{t('wn.empty')}</p>
        )}
      </div>
    </Modal>
  )
}
