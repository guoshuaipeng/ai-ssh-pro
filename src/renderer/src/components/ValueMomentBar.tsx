import { useI18n } from '../lib/i18n'
import type { ValueMomentKind } from '@shared/value-moment'

type Props = {
  kind: ValueMomentKind
  importCount: number
  onConnectAll: () => void
  onView: () => void
  onOpenHome: () => void
  onOpenSftp: () => void
  onNever: () => void
  onDismiss: () => void
}

/** PNG-6: a single non-blocking bar. One primary button. Buttons do not wrap. */
export default function ValueMomentBar({
  kind,
  importCount,
  onConnectAll,
  onView,
  onOpenHome,
  onOpenSftp,
  onNever,
  onDismiss
}: Props) {
  const { t } = useI18n()
  return (
    <div className="value-moment" role="status" data-testid="value-moment" data-kind={kind}>
      <p className="value-moment-text">
        {t(kind === 'import' ? 'png.imported' : 'png.firstBody', { n: importCount })}
        {kind === 'import' ? (
          <span className="value-moment-next" data-testid="png-import-next">
            {' '}
            {t('png.importNext')}
          </span>
        ) : null}
      </p>
      <div className="value-moment-actions">
        {kind === 'import' ? (
          <>
            <button type="button" className="primary" data-testid="png-connect-all" onClick={onConnectAll}>
              {t('png.connectAll')}
            </button>
            <button type="button" className="secondary" data-testid="png-view" onClick={onView}>
              {t('png.view')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="primary" data-testid="png-open-home" onClick={onOpenHome}>
              {t('png.openHome')}
            </button>
            <button type="button" className="secondary" data-testid="png-open-sftp" onClick={onOpenSftp}>
              {t('png.openSftp')}
            </button>
          </>
        )}
        <button type="button" className="link-btn" data-testid="png-never" onClick={onNever}>
          {t('png.never')}
        </button>
        <button type="button" className="value-moment-x" aria-label={t('common.close')} data-testid="png-dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
    </div>
  )
}
