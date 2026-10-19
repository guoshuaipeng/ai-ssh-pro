import type { HTMLAttributes, ReactNode } from 'react'

type DataAttrs = { [key: `data-${string}`]: string | undefined }

type Props = {
  /** Panel title. Omit for action-only toolbars (no h2 is rendered). */
  title?: ReactNode
  /** Native tooltip on the title (e.g. full path when the title is a basename). */
  titleTooltip?: string
  /** Optional muted meta beside the title (counts, filters). */
  meta?: ReactNode
  /** Content right after the title, grouped with it (e.g. a path). Wrapped in `leadClassName` when set. */
  aside?: ReactNode
  /** Wrap title + aside in a div with this class (keeps existing left-group layouts). */
  leadClassName?: string
  actions?: ReactNode
  className?: string
  titleClassName?: string
  actionsClassName?: string
  /** Extra attributes for the actions row (data-* flags, aria). */
  actionsProps?: HTMLAttributes<HTMLDivElement> & DataAttrs
  testId?: string
}

/**
 * Shared panel title row (workspace / ops home / tool tabs).
 * Prefer over hand-rolled workspace-panel-toolbar markup for chrome consistency.
 */
export default function PanelHeader({
  title,
  titleTooltip,
  meta,
  aside,
  leadClassName,
  actions,
  className,
  titleClassName,
  actionsClassName,
  actionsProps,
  testId
}: Props) {
  const heading =
    title != null ? (
      <h2 className={['workspace-panel-title', titleClassName].filter(Boolean).join(' ')} title={titleTooltip}>
        {title}
        {meta ? <span className="ui-panel-header-meta">{meta}</span> : null}
      </h2>
    ) : null
  const lead = leadClassName ? (
    <div className={leadClassName}>
      {heading}
      {aside}
    </div>
  ) : (
    <>
      {heading}
      {aside}
    </>
  )
  return (
    <div
      className={['workspace-panel-toolbar', 'ui-panel-header', className].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      {lead}
      {actions ? (
        <div {...actionsProps} className={['workspace-panel-actions', actionsClassName].filter(Boolean).join(' ')}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}