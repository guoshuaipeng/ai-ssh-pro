import type { ReactNode } from 'react'

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

/** UX-08: icon + one sentence + primary action (+ secondary actions). */
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
  icon?: ReactNode
  title: string
  desc?: string
  primary?: Action
  secondary?: Action[]
  testId?: string
  compact?: boolean
  children?: ReactNode
}) {
  const extra = (secondary ?? []).slice(0, 2)
  return (
    <div className={`empty-state${compact ? ' empty-state--compact' : ''}`} data-testid={testId} role="status">
      {icon ? (
        <div className="empty-state-icon" aria-hidden>
          {icon}
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
