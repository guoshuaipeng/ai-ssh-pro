import { QUICK_STEPS } from '@shared/onboarding'
import { useI18n } from '../lib/i18n'
import Button from './ui/Button'

export default function QuickStartWizard({
  open,
  step,
  resume,
  failReason,
  onNew,
  onDemo,
  onImport,
  onConnect,
  onLater,
  onHome,
  onTerm,
  onSkip,
  onEdit,
  onDone
}: {
  open: boolean
  step: number
  resume?: boolean
  failReason?: string
  onNew: () => void
  onDemo: () => void
  onImport: () => void
  onConnect: () => void
  onLater: () => void
  onHome: () => void
  onTerm: () => void
  onSkip: () => void
  onEdit: () => void
  onDone: () => void
}) {
  const { t } = useI18n()
  if (!open) return null
  const n = Math.min(QUICK_STEPS, Math.max(1, step))
  return (
    <div className="ux60-layer" data-testid="ux60">
      <div className="ux60-card" role="dialog" aria-label={t('ux60.title')}>
        <header className="ux60-head">
          <strong>{t('ux60.title')}</strong>
          <span>{t('ux60.stepOf', { i: n, n: QUICK_STEPS })}</span>
          <button type="button" aria-label={t('ux60.skip')} onClick={onSkip}>×</button>
        </header>
        {n === 1 ? (
          <>
            <h3>{t('ux60.s1.title')}</h3>
            <p>{t('ux60.s1.body')}</p>
            <div className="ux60-actions">
              {resume ? (
                <Button variant="primary" onClick={onConnect}>{t('ux60.continue')}</Button>
              ) : (
                <Button variant="primary" data-testid="ux60-new" onClick={onNew}>{t('ux60.s1.new')}</Button>
              )}
              <button type="button" data-testid="ux60-demo" onClick={onDemo}>{t('ux60.s1.demo')}</button>
            </div>
            <div className="ux60-actions is-secondary">
              <button type="button" onClick={onImport}>{t('ux60.s1.import')}</button>
              <button type="button" onClick={onSkip}>{t('ux60.skip')}</button>
            </div>
          </>
        ) : null}
        {n === 2 ? (
          <>
            <h3>{t('ux60.s2.title')}</h3>
            <p>{t('ux60.s2.body')}</p>
            {failReason ? (
              <p className="l2-error" data-testid="ux60-fail">
                {t('ux60.s2.fail', { reason: failReason })}
                <button type="button" onClick={onConnect}>{t('upd.retry')}</button>
                <button type="button" onClick={onEdit}>{t('ctx.edit')}</button>
              </p>
            ) : null}
            <div className="ux60-actions">
              <Button variant="primary" data-testid="ux60-connect" onClick={onConnect}>{t('ux60.s2.connect')}</Button>
              <button type="button" onClick={onLater}>{t('ux60.s2.later')}</button>
            </div>
            <div className="ux60-actions is-secondary">
              <button type="button" onClick={onSkip}>{t('ux60.skip')}</button>
            </div>
          </>
        ) : null}
        {n === 3 ? (
          <>
            <h3>{t('ux60.s3.title')}</h3>
            <p>{t('ux60.s3.body')}</p>
            <div className="ux60-actions">
              <Button variant="primary" data-testid="ux60-home" onClick={onHome}>{t('ux60.s3.home')}</Button>
              <button type="button" onClick={onTerm}>{t('ux60.s3.term')}</button>
            </div>
            <div className="ux60-actions is-secondary">
              <button type="button" onClick={onDone}>{t('ux60.done')}</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
