import type { ReactNode } from 'react'
import Icon from './Icon'
import {
  EMPTY_ICON_SIZE,
  EMPTY_ICON_SIZE_COMPACT,
  EMPTY_ICON_STROKE,
  EMPTY_ICONS,
  type EmptyIconKey
} from './emptyIcons'

type Action = {
  label: string
  onClick: () => void
  testId?: string
  /** G2 tour anchor */
  tour?: string
  avoid?: boolean
  /** Same command id as the welcome card (importSessions / connection / demoHost). */
  command?: string
}

function isEmptyIconKey(icon: EmptyIconKey | Exclude<ReactNode, string | number>): icon is EmptyIconKey {
  return typeof icon === 'string' && Object.prototype.hasOwnProperty.call(EMPTY_ICONS, icon)
}

/** UX-08 / UI-N6: one icon slot, one sentence, a primary action, then secondary links. */
export default function EmptyState({
  icon,
  title,
  desc,
  primary,
  secondary,
  testId,
  compact,
  children
}: {
  /** Surface key from emptyIcons, or a ready glyph. Strings that are not keys are not drawn. */
  icon?: EmptyIconKey | Exclude<ReactNode, string | number>
  title: string
  desc?: string
  primary?: Action
  secondary?: Action[]
  testId?: string
  compact?: boolean
  children?: ReactNode
}) {
  const extra = (secondary ?? []).slice(0, 2)
  const glyph =
    icon && isEmptyIconKey(icon) ? (
      <Icon
        name={EMPTY_ICONS[icon]}
        size={compact ? EMPTY_ICON_SIZE_COMPACT : EMPTY_ICON_SIZE}
        strokeWidth={EMPTY_ICON_STROKE}
      />
    ) : (
      icon
    )
  return (
    <div className={`empty-state${compact ? ' empty-state--compact' : ''}`} data-testid={testId} role="status">
      {glyph ? (
        <div className="empty-state-icon" aria-hidden>
          {glyph}
        </div>
      ) : null}
      <div className="empty-state-title">{title}</div>
      {desc ? <div className="empty-state-desc">{desc}</div> : null}
      {primary ? (
        <button type="button" className="primary empty-state-primary" data-testid={primary.testId} data-tour={primary.tour} data-command={primary.command} data-tour-avoid={primary.avoid ? '' : undefined} onClick={primary.onClick}>
          {primary.label}
        </button>
      ) : null}
      {extra.length ? (
        <div className="empty-state-secondary" data-tour-avoid>
          {extra.map((a) => (
            <button key={a.label} type="button" className="link-btn" data-testid={a.testId} data-command={a.command} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  )
}
