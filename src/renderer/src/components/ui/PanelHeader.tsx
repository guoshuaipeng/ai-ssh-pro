import type { ReactNode } from 'react'

type Props = {
  title: ReactNode
  /** Optional muted meta beside the title (counts, filters). */
  meta?: ReactNode
  actions?: ReactNode
  className?: string
  titleClassName?: string
  actionsClassName?: string
  testId?: string
}

/**
 * Shared panel title row (workspace / ops home / tool tabs).
 * Prefer over hand-rolled workspace-panel-toolbar markup for chrome consistency.
 */
export default function PanelHeader({
  title,
  meta,
  actions,
  className,
  titleClassName,
  actionsClassName,
  testId
}: Props) {
  return (
    <div
      className={['workspace-panel-toolbar', 'ui-panel-header', className].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      <h2 className={['workspace-panel-title', titleClassName].filter(Boolean).join(' ')}>
        {title}
        {meta ? <span className="ui-panel-header-meta">{meta}</span> : null}
      </h2>
      {actions ? (
        <div className={['workspace-panel-actions', actionsClassName].filter(Boolean).join(' ')}>{actions}</div>
      ) : null}
    </div>
  )
}