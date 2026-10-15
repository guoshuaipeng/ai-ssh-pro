import type { FiredAlert } from '@shared/alert-rules'
import { ageBucket } from '@shared/alert-workbench'
import { alertMenuItems, type AlertMenuCtx, type BuiltNode, type MenuEntry } from '@shared/inline-menus'
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
  fixDisabled,
  fixTitle,
  onMarkDone,
  onIgnore,
  onBoard,
  maintenanceUntil,
  onMaintenance
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
  /** W1b / W1c: row overflow / context menu. Does not draft by itself. */
  onFixPlaybook?: () => void
  fixDisabled?: boolean
  fixTitle?: string
  onMarkDone?: () => void
  onIgnore?: () => void
  onBoard?: () => void
  maintenanceUntil?: number | null
  onMaintenance?: () => void
}) {
  const { t } = useI18n()
  const age = ageBucket(alert.at, now)
  const value = alert.ruleId === 'offline' ? t('l2.offline') : `${Math.round(alert.value)}%`
  const canResolve = alert.status === 'active'
  const rowCtx: AlertMenuCtx = {
    fix: Boolean(onFixPlaybook),
    markDone: Boolean(onMarkDone),
    ignore: Boolean(onIgnore),
    board: Boolean(onBoard),
    maintenance: Boolean(onMaintenance),
    canResolve,
    fixDisabled,
    fixTitle: fixTitle || t('w1.create')
  }
  const pickRow = (id: string) => {
    if (id === 'w1-row-fix') onFixPlaybook?.()
    else if (id === 'w1-row-done') onMarkDone?.()
    else if (id === 'w1-row-ignore') onIgnore?.()
    else if (id === 'w1-row-board') onBoard?.()
    else if (id === 'l2d-row') onMaintenance?.()
    else if (id === 'w1-row-copy') {
      const text = `${alert.hostTitle} · ${alert.ruleId} · ${value}`
      void navigator.clipboard.writeText(text).then(() => showToast(t('ctx.copied')))
    }
  }
  const openRowMenu = (
    e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void },
    entry: MenuEntry
  ) => {
    openContextMenu(e, bindAlertMenu(alertMenuItems(rowCtx, entry), t, pickRow))
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
      onContextMenu={showMenu ? (e) => openRowMenu(e, 'context') : undefined}
    >
      <span className={`alert-dot alert-dot--${alertTone(alert.ruleId)}`} aria-hidden />
      <span className="alert-line-host" title={alert.hostTitle}>
        {alert.hostTitle}
      </span>
      <span className="alert-line-rule" title={alert.ruleId}>
        {alert.ruleId}
      </span>
      <span className="alert-line-value">{value}</span>
      <span className="alert-line-age" title={maintenanceUntil ? t('l2d.until', { time: new Date(maintenanceUntil).toLocaleTimeString() }) : undefined}>
        {t(AGE_KEY[age.key], { n: age.n })}
      </span>
      {maintenanceUntil ? <span className="l2d-badge" data-testid="l2d-row-badge">{t('l2d.badge')}</span> : null}
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
              const rect = e.currentTarget.getBoundingClientRect()
              openRowMenu(
                {
                  clientX: rect.left,
                  clientY: rect.bottom,
                  preventDefault: () => e.preventDefault(),
                  stopPropagation: () => e.stopPropagation()
                },
                'overflow'
              )
            }}
          >
            <span aria-hidden>⋯</span>
          </button>
        ) : null}
      </span>
    </div>
  )
}

function bindAlertMenu(
  nodes: BuiltNode[],
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  onPick: (id: string) => void
): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  for (const node of nodes) {
    if (node.type === 'sep') {
      items.push('sep')
      continue
    }
    if (node.type !== 'item') continue
    items.push({
      id: node.id,
      label: node.label ?? (node.labelKey ? t(node.labelKey as MessageKey, node.labelVars) : node.id),
      disabled: node.disabled,
      danger: node.danger,
      title: node.title ?? (node.titleKey ? t(node.titleKey as MessageKey) : undefined),
      onSelect: () => onPick(node.id)
    })
  }
  return items
}
