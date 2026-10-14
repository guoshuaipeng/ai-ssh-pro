import { useI18n } from '../lib/i18n'
import Modal from './Modal'
import { summarizeNotes } from '../lib/update-check'

type Props = {
  open: boolean
  version: string
  notes?: string
  onDownload: () => void
  onLater: () => void
  onSkip: () => void
}

/** V2: "New version vX" dialog — buttons right to left: Download (primary), Later, Skip this version. */
export default function UpdateModal({ open, version, notes, onDownload, onLater, onSkip }: Props) {
  const { t } = useI18n()
  const lines = summarizeNotes(notes)
  return (
    <Modal
      open={open}
      title={t('upd.title', { version })}
      onClose={onLater}
      width={480}
      footer={
        <div className="update-modal-actions">
          <button type="button" className="ghost" onClick={onSkip}>
            {t('upd.skip')}
          </button>
          <button type="button" onClick={onLater}>
            {t('upd.later')}
          </button>
          <button type="button" className="primary" onClick={onDownload}>
            {t('upd.download')}
          </button>
        </div>
      }
    >
      <div className="update-modal" data-testid="update-modal">
        {lines.length ? (
          <ul>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : (
          <p>{t('upd.noNotes')}</p>
        )}
      </div>
    </Modal>
  )
}
