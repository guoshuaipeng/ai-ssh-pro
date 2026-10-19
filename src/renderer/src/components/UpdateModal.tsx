import { useI18n } from '../lib/i18n'
import Modal from './Modal'
import Button from './ui/Button'
import { summarizeNotes } from '../lib/update-check'

type Props = {
  open: boolean
  version: string
  notes?: string
  sourceLabel?: string
  onDownload: () => void
  onLater: () => void
  onSkip: () => void
}

/** V2: "New version vX" dialog — buttons right to left: Download (primary), Later, Skip this version. */
export default function UpdateModal({ open, version, notes, sourceLabel, onDownload, onLater, onSkip }: Props) {
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
          <Button variant="ghost" onClick={onSkip}>
            {t('upd.skip')}
          </Button>
          <Button variant="secondary" onClick={onLater}>
            {t('upd.later')}
          </Button>
          <Button variant="primary" onClick={onDownload}>
            {t('upd.download')}
          </Button>
        </div>
      }
    >
      <div className="update-modal" data-testid="update-modal">
        {sourceLabel ? <p className="update-source" data-testid="update-source">{t('upd.source', { source: sourceLabel })}</p> : null}
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
