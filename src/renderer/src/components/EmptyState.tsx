import type { ReactNode } from 'react'

type Action = { label: string; onClick: () => void; testId?: string; /** G2 tour anchor */ tour?: string }

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
  icon?: string
  title: string
  desc?: string
  primary?: Action
  secondary?: Action[]
  testId?: string
  compact?: boolean
  children?: ReactNode
}) {
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
        <button type="button" className="primary empty-state-primary" data-testid={primary.testId} data-tour={primary.tour} onClick={primary.onClick}>
          {primary.label}
        </button>
      ) : null}
      {secondary?.length ? (
        <div className="empty-state-secondary">
          {secondary.map((a, i) => (
            <span key={a.label}>
              {i > 0 ? <span className="empty-state-sep" aria-hidden> · </span> : null}
              <button type="button" className="link-btn" data-testid={a.testId} onClick={a.onClick}>
                {a.label}
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  )
}
