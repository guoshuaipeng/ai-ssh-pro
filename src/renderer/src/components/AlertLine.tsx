import type { FiredAlert } from '@shared/alert-rules'
import { ageBucket } from '@shared/alert-workbench'
import { useI18n, type MessageKey } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { openContextMenu, type ContextMenuItem } from './ContextMenu'
import Icon from './Icon'

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
  onExplain,
  explainDisabled,
  explainTitle,
  onFixPlaybook,
  onMarkDone,
  onIgnore,
  onBoard
}: {
  alert: FiredAlert
  selected?: boolean
  compact?: boolean
  now: number
  onSelect?: () => void
  onOpen?: () => void
  onLocate?: () => void
  onExplain?: () => void
  /** Sparkles stays visible but grey when AI is not configured. */
  explainDisabled?: boolean
  explainTitle?: string
  /** W1b: row overflow / context menu. Does not draft by itself. */
  onFixPlaybook?: () => void
  onMarkDone?: () => void
  onIgnore?: () => void
  onBoard?: () => void
}) {
  const { t } = useI18n()
  const age = ageBucket(alert.at, now)
  const value = alert.ruleId === 'offline' ? t('l2.offline') : `${Math.round(alert.value)}%`
  const canResolve = alert.status === 'active'
  const openRowMenu = (e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }) => {
    const items: ContextMenuItem[] = []
    if (onFixPlaybook) items.push({ id: 'w1-row-fix', label: t('w1.create'), onSelect: onFixPlaybook })
    if (onMarkDone) items.push({ id: 'w1-row-done', label: t('w1.rowMenu.markDone'), disabled: !canResolve, onSelect: onMarkDone })
    if (onIgnore) items.push({ id: 'w1-row-ignore', label: t('w1.rowMenu.ignore'), disabled: !canResolve, onSelect: onIgnore })
    items.push('sep')
    if (onBoard) items.push({ id: 'w1-row-board', label: t('w1.rowMenu.board'), onSelect: onBoard })
    items.push({
      id: 'w1-row-copy',
      label: t('w1.rowMenu.copy'),
      onSelect: () => {
        const text = `${alert.hostTitle} · ${alert.ruleId} · ${value}`
        void navigator.clipboard.writeText(text).then(() => showToast(t('ctx.copied')))
      }
    })
    openContextMenu(e, items)
  }
  const showMenu = Boolean(onFixPlaybook || onMarkDone || onIgnore || onBoard)
  return (
    <div
      className={`alert-line${selected ? ' is-selected' : ''}${alert.status === 'active' ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      role="option"
      aria-selected={selected}
      data-testid="alert-line"
      data-alert-id={alert.id}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={showMenu ? openRowMenu : undefined}
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
            data-testid="w1-row-locate"
            title={t('o4.locate')}
            aria-label={t('o4.locate')}
            onClick={(e) => {
              e.stopPropagation()
              onLocate()
            }}
          >
            <Icon name="crosshair" size={14} />
            <span className="alert-line-lbl">{t('o4.locate')}</span>
          </button>
        ) : null}
        {onExplain ? (
          <button
            type="button"
            className="alert-line-btn"
            data-testid="w1-row-explain"
            title={explainTitle || t('a4.interpret')}
            aria-label={t('a4.interpret')}
            disabled={explainDisabled}
            onClick={(e) => {
              e.stopPropagation()
              if (!explainDisabled) onExplain()
            }}
          >
            <Icon name="sparkles" size={14} />
            <span className="alert-line-lbl">{t('a4.interpret')}</span>
          </button>
        ) : null}
        {showMenu ? (
          <button
            type="button"
            className="alert-line-btn alert-line-more"
            data-testid="w1-row-more"
            title={t('toolbar.more')}
            aria-label={t('toolbar.more')}
            onClick={(e) => {
              e.stopPropagation()
              openRowMenu(e)
            }}
          >
            <span aria-hidden>⋯</span>
          </button>
        ) : null}
      </span>
    </div>
  )
}
