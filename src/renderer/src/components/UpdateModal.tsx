import { useEffect, useRef } from 'react'
import { isHigherChromeOpen } from '@shared/overlay-stack'
import { useI18n, tg } from '../lib/i18n'
import Button from './ui/Button'
import { summarizeNotes } from '../lib/update-check'

type Props = {
  open: boolean
  version: string
  notes?: string
  sourceLabel?: string
  cacheAge?: string
  pan123Url?: string
  onDownload: () => void
  onPan123?: () => void
  onLater: () => void
  onSkip: () => void
}

/** v0.7.0: self-drawn dark update overlay. Formal copy, optional 123 云盘. */
export default function UpdateModal({
  open,
  version,
  notes,
  sourceLabel,
  cacheAge,
  pan123Url,
  onDownload,
  onPan123,
  onLater,
  onSkip
}: Props) {
  const { t } = useI18n()
  const backdropRef = useRef<HTMLDivElement>(null)
  const lines = summarizeNotes(notes)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isHigherChromeOpen(document)) return
      const backs = document.querySelectorAll('.modal-backdrop')
      if (backs.length && backs[backs.length - 1] !== backdropRef.current) return
      e.preventDefault()
      e.stopPropagation()
      onLater()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onLater])

  if (!open) return null

  return (
    <div
      className="modal modal-backdrop update-overlay-backdrop"
      role="presentation"
      ref={backdropRef}
      onClick={onLater}
    >
      <div
        className="update-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-overlay-title"
        data-testid="update-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="update-overlay-head">
          <div>
            <h2 id="update-overlay-title" className="update-overlay-title">
              {t('upd.title')}
            </h2>
            <p className="update-overlay-meta">
              <span data-testid="update-version">v{version}</span>
              {sourceLabel ? (
                <span data-testid="update-source">{t('upd.source', { source: sourceLabel })}</span>
              ) : null}
            </p>
          </div>
          <Button variant="icon" icon="x" className="modal-close" onClick={onLater} aria-label={tg('common.close')} />
        </header>
        <div className="update-overlay-body">
          {lines.length ? (
            <ul>
              {lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="update-overlay-empty">{t('upd.noNotes')}</p>
          )}
          {cacheAge ? (
            <p className="update-overlay-cache" data-testid="update-cache-age">
              {cacheAge}
            </p>
          ) : null}
        </div>
        <footer className="update-overlay-foot">
          <div className="update-overlay-alt">
            {pan123Url && onPan123 ? (
              <Button variant="secondary" onClick={onPan123} data-testid="update-pan123">
                {t('upd.downloadPan123')}
              </Button>
            ) : null}
          </div>
          <div className="update-modal-actions">
            <Button variant="ghost" onClick={onSkip}>
              {t('upd.skip')}
            </Button>
            <Button variant="secondary" onClick={onLater}>
              {t('upd.later')}
            </Button>
            <Button variant="primary" onClick={onDownload} data-testid="update-download">
              {t('upd.download')}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
