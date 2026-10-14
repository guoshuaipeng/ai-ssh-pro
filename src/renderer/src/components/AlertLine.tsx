import type { FiredAlert } from '@shared/alert-rules'
import { ageBucket } from '@shared/alert-workbench'
import { useI18n, type MessageKey } from '../lib/i18n'

const AGE_KEY: Record<'just' | 'min' | 'hour' | 'day', MessageKey> = {
  just: 'l2.justNow',
  min: 'l2.agoMin',
  hour: 'l2.agoHour',
  day: 'l2.agoDay'
}

export function alertTone(ruleId: string): 'crit' | 'warn' | 'info' {
  if (ruleId === 'disk' || ruleId === 'offline') return 'crit'
  if (ruleId === 'cpu' || ruleId === 'mem') return 'warn'
  return 'info'
}

export function AlertLine({
  alert,
  selected,
  compact,
  now,
  onSelect,
  onOpen,
  onLocate,
  onExplain
}: {
  alert: FiredAlert
  selected?: boolean
  compact?: boolean
  now: number
  onSelect?: () => void
  onOpen?: () => void
  onLocate?: () => void
  onExplain?: () => void
}) {
  const { t } = useI18n()
  const age = ageBucket(alert.at, now)
  const value = alert.ruleId === 'offline' ? t('l2.offline') : `${Math.round(alert.value)}%`
  return (
    <div
      className={`alert-line${selected ? ' is-selected' : ''}${alert.status === 'active' ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      role="option"
      aria-selected={selected}
      data-testid="alert-line"
      data-alert-id={alert.id}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <span className={`alert-dot alert-dot--${alertTone(alert.ruleId)}`} aria-hidden />
      <span className="alert-line-host" title={alert.hostTitle}>
        {alert.hostTitle}
      </span>
      <span className="alert-line-rule" title={alert.ruleId}>
        {alert.ruleId}
      </span>
      <span className="alert-line-value">{value}</span>
      <span className="alert-line-age">{t(AGE_KEY[age.key], { n: age.n })}</span>
      <span className="alert-line-actions">
        {onLocate ? (
          <button
            type="button"
            className="alert-line-btn"
            title={t('o4.locate')}
            onClick={(e) => {
              e.stopPropagation()
              onLocate()
            }}
          >
            <span className="alert-line-ico" aria-hidden>
              ⌖
            </span>
            <span className="alert-line-lbl">{t('o4.locate')}</span>
          </button>
        ) : null}
        {onExplain ? (
          <button
            type="button"
            className="alert-line-btn"
            title={t('a4.interpret')}
            onClick={(e) => {
              e.stopPropagation()
              onExplain()
            }}
          >
            <span className="alert-line-ico" aria-hidden>
              ✨
            </span>
            <span className="alert-line-lbl">{t('a4.interpret')}</span>
          </button>
        ) : null}
      </span>
    </div>
  )
}
