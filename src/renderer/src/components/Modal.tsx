import { useEffect } from 'react'
import { tg } from '../lib/i18n'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** 内容区最大宽度（px） */
  width?: number
  footer?: React.ReactNode
  /** UX-14: render as in-tab panel (no backdrop / chrome) */
  embedded?: boolean
  panelClassName?: string
  testId?: string
}

export default function Modal({ open, title, onClose, children, width = 520, footer, embedded, panelClassName, testId }: Props) {
  useEffect(() => {
    if (!open || embedded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, embedded])

  if (!open) return null

  if (embedded) {
    return (
      <div className={panelClassName || 'workspace-panel tool-tab-panel'} data-testid={testId} role="region" aria-label={title}>
        <div className="modal-body tool-tab-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ width: `min(92vw, ${width}px)` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={tg('common.close')}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}
