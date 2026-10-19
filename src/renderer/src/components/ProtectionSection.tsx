import type { ProtectionLevel } from '@shared/protection'
import { PROTECTION_LEVELS } from '@shared/protection'
import { useI18n, type MessageKey } from '../lib/i18n'
import Button from './ui/Button'

const LEVEL_KEY: Record<ProtectionLevel, MessageKey> = {
  normal: 'l4.normal',
  production: 'l4.production',
  readonly: 'l4.readonly'
}

const HINT: Record<ProtectionLevel, MessageKey> = {
  normal: 'l4.hintNormal',
  production: 'l4.hintProd',
  readonly: 'l4.hintRo'
}

export function ProtectionLevelField({
  value,
  onChange,
  name = 'protection-level'
}: {
  value: ProtectionLevel
  onChange: (level: ProtectionLevel) => void
  name?: string
}) {
  const { t } = useI18n()
  return (
    <div className="l4-levels" role="radiogroup" aria-label={t('l4.level')}>
      {PROTECTION_LEVELS.map((level) => (
        <label key={level} className={value === level ? 'is-on' : ''}>
          <input type="radio" name={name} checked={value === level} onChange={() => onChange(level)} />
          {t(LEVEL_KEY[level])}
        </label>
      ))}
    </div>
  )
}

/** Host profile “生产防护” block: level, audit toggle, greyed auto-record, deep links. */
export default function ProtectionSection({
  level,
  auditOn,
  suggestProd,
  onLevel,
  onAudit,
  onOpenAudit,
  onRecordings,
  onElevate,
  onOpenGate,
  autoRecord = false,
  onAutoRecord
}: {
  level: ProtectionLevel
  auditOn: boolean
  suggestProd?: boolean
  onLevel: (level: ProtectionLevel) => void
  onAudit: (on: boolean) => void
  onOpenAudit: () => void
  onRecordings: () => void
  onElevate: () => void
  onOpenGate?: () => void
  autoRecord?: boolean
  onAutoRecord?: (on: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <section className="inv20-card l4-guard" id="l4-guard" data-testid="l4-guard">
      <header className="inv20-card-head">
        <strong>{t('l4.title')}</strong>
      </header>
      <div className="l4-body">
        {suggestProd ? (
          <div className="l4-suggest" data-testid="l4-suggest">
            <span>{t('l4.suggest')}</span>
            <Button variant="primary" onClick={() => onLevel('production')}>
              {t('l4.turnOn')}
            </Button>
          </div>
        ) : null}
        <div className="l4-row">
          <span className="l4-label">{t('l4.level')}</span>
          <ProtectionLevelField value={level} onChange={onLevel} />
        </div>
        <p className="l4-hint">{t(HINT[level])}</p>
        <label className="l4-check">
          <input type="checkbox" checked={auditOn} onChange={(e) => onAudit(e.target.checked)} />
          {t('l4.audit')}
        </label>
        <label className="l4-check">
          <input type="checkbox" checked={autoRecord} onChange={(e) => onAutoRecord?.(e.target.checked)} />
          {t('l4.autoRecord')}
        </label>
        <div className="l4-links">
          <button type="button" onClick={onOpenAudit}>
            {t('l4.openAudit')}
          </button>
          <button type="button" onClick={onRecordings}>
            {t('l4.recordings')}
          </button>
          <button type="button" onClick={onElevate} disabled={level === 'normal'}>
            {t('l4.unlock')}
          </button>
          {onOpenGate ? (
            <button type="button" data-testid="s2b-profile" onClick={onOpenGate}>
              {t('s2b.tab')}
            </button>
          ) : null}
        </div>
        <p className="l4-disclaimer">{t('l4.disclaimer')}</p>
      </div>
    </section>
  )
}
