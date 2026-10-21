import { useEffect, useRef } from 'react'
import { isHigherChromeOpen } from '@shared/overlay-stack'
import { tg } from '../lib/i18n'
import { closeContextMenu } from './ContextMenu'
import Button from './ui/Button'

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
  const backdropRef = useRef<HTMLDivElement>(null)
  // HK2: a menu opened before the modal (e.g. tab context menu) must not float above it.
  useEffect(() => {
    if (open && !embedded) closeContextMenu()
  }, [open, embedded])
  useEffect(() => {
    if (!open || embedded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isHigherChromeOpen(document)) return
      const backs = document.querySelectorAll('.modal-backdrop')
      if (backs.length && backs[backs.length - 1] !== backdropRef.current) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
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
    <div
      className="modal modal-backdrop"
      role="presentation"
      ref={backdropRef}
      onClick={onClose}
      data-testid={testId ? testId + '-backdrop' : undefined}
    >
      <div
        className="modal-panel"
        style={{ width: `min(92vw, ${width}px)` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
          <Button variant="icon" icon="x" className="modal-close" onClick={onClose} aria-label={tg('common.close')} />
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}
