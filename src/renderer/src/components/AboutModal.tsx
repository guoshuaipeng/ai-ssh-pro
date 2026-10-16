import { useEffect, useState } from 'react'
import { PRODUCT_NAME } from '@shared/product'
import Modal from './Modal'
import AboutBlock from './AboutBlock'
import { useI18n } from '../lib/i18n'

type Props = {
  open: boolean
  onClose: () => void
  onCheckUpdate: () => void
  onWhatsNew: () => void
  checking?: boolean
  version: string
  isDev?: boolean
}

/** Same about block as Settings → About. Esc / × closes; no OK footer. */
export default function AboutModal({ open, onClose, onCheckUpdate, onWhatsNew, checking, version, isDev }: Props) {
  const { t } = useI18n()
  const [liveVersion, setLiveVersion] = useState(version)

  useEffect(() => {
    if (version) setLiveVersion(version)
  }, [version])

  useEffect(() => {
    if (!open || version) return
    let cancelled = false
    void window.aiss.app.getVersion().then((v) => {
      if (!cancelled) setLiveVersion(v)
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, version])

  return (
    <Modal open={open} title={t('about.title', { name: PRODUCT_NAME })} onClose={onClose} width={460}>
      <AboutBlock
        version={liveVersion}
        isDev={isDev}
        checking={checking}
        onCheckUpdate={onCheckUpdate}
        onWhatsNew={onWhatsNew}
        onGithub={() => {
          void window.aiss.app.openGithub().catch(() => undefined)
        }}
      />
    </Modal>
  )
}
