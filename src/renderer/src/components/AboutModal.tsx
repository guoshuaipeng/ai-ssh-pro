import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useI18n } from '../lib/i18n'

type Props = {
  open: boolean
  onClose: () => void
}

export default function AboutModal({ open, onClose }: Props) {
  const { t } = useI18n()
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.aiss.app
      .getVersion()
      .then((v) => {
        if (!cancelled) setVersion(v)
      })
      .catch(() => {
        if (!cancelled) setVersion('')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Modal
      open={open}
      title={t('about.title')}
      onClose={onClose}
      width={420}
      footer={
        <button type="button" className="primary" onClick={onClose}>
          {t('about.ok')}
        </button>
      }
    >
      <div className="about-modal">
        <div className="about-modal-brand">AI-SSH-Pro</div>
        <p className="about-modal-desc">{t('about.desc')}</p>
        <p className="about-modal-version">
          {t('about.version')} <strong>{version ? `v${version}` : '…'}</strong>
        </p>
        <button
          type="button"
          className="about-modal-link"
          onClick={() => {
            void window.aiss.app.openGithub().catch(() => {
              /* ignore */
            })
          }}
        >
          {t('about.github')}
        </button>
      </div>
    </Modal>
  )
}
