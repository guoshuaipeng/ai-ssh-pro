import { useEffect, useRef } from 'react'
import { useI18n } from '../lib/i18n'
import BrandMark from './BrandMark'

type Props = {
  onImport: () => void
  onNew: () => void
  onDemo: () => void
  onDismiss: () => void
}

/** PF-1: center-pane welcome card. Not a fullscreen modal. Three CTAs are equal Secondary. */
export default function WelcomePanel({ onImport, onNew, onDemo, onDismiss }: Props) {
  const { t } = useI18n()
  const importRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    importRef.current?.focus()
  }, [])

  return (
    <div className="welcome-stage" data-testid="welcome-panel">
      <section className="welcome-card" aria-labelledby="welcome-headline">
        <BrandMark />
        <p className="welcome-kicker">{t('pf1.welcome')}</p>
        <h1 id="welcome-headline" className="welcome-headline">
          {t('pf1.headline')}
        </h1>
        <p className="welcome-tagline">{t('brand.tagline')}</p>
        <div className="welcome-cta-row">
          <button
            ref={importRef}
            type="button"
            className="secondary"
            data-testid="welcome-import"
            data-command="importSessions"
            onClick={onImport}
          >
            {t('pf1.import')}
          </button>
          <button type="button" className="secondary" data-testid="welcome-new" data-command="connection" onClick={onNew}>
            {t('pf1.new')}
          </button>
          <button type="button" className="secondary" data-testid="welcome-demo" data-command="demoHost" onClick={onDemo}>
            {t('pf1.demo')}
          </button>
        </div>
        <div className="welcome-foot">
          <p className="welcome-hint">{t('pf1.hint')}</p>
          <button type="button" className="link-btn welcome-later" data-testid="welcome-later" onClick={onDismiss}>
            {t('pf1.later')}
          </button>
        </div>
      </section>
    </div>
  )
}
