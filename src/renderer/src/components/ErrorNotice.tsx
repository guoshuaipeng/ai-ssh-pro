import type { ReactNode } from 'react'
import { tg } from '../lib/i18n'

/** PF-5 banner: human sentence, collapsed detail, at least one next step. */
export default function ErrorNotice({
  message,
  detail,
  actions,
  testId = 'pf5-notice'
}: {
  message: string
  detail?: string | null
  actions?: ReactNode
  testId?: string
}) {
  const extra = detail && detail.trim() && detail.trim() !== message.trim() ? detail.trim() : ''
  return (
    <div className="pf5-banner" role="alert" data-testid={testId}>
      <p className="pf5-banner-msg">{message}</p>
      {extra ? (
        <details className="pf5-details">
          <summary>{tg('pf5.details')}</summary>
          <pre>{extra}</pre>
        </details>
      ) : null}
      {actions ? <div className="pf5-actions">{actions}</div> : null}
    </div>
  )
}
