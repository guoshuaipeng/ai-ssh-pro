import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TaskId, TaskState } from '@shared/retention-tasks'
import { pendingTasks, TASK_IDS } from '@shared/retention-tasks'
import { chipPlacement } from '@shared/first-week'
import { useI18n, type MessageKey } from '../lib/i18n'

const COPY: Record<TaskId, { title: MessageKey; desc: MessageKey }> = {
  connect: { title: 'g3.connect', desc: 'g3.connectDesc' },
  monitor: { title: 'g3.monitor', desc: 'g3.monitorDesc' },
  ai: { title: 'g3.ai', desc: 'g3.aiDesc' },
  transfer: { title: 'g3.transfer', desc: 'g3.transferDesc' }
}

type Props = {
  state: TaskState
  mode: 'chip' | 'panel'
  onGotIt: () => void
  onNever: () => void
  onGo?: (id: TaskId) => void
  onDismiss?: (id: TaskId) => void
}

/**
 * UX-57: bottom-right card (or a 48px bar at 1024). No backdrop, so the health grid stays clickable.
 * The right-rail task button is a separate entry and does not stack another copy of this chip.
 */
export default function FirstWeekChip({ state, mode, onGotIt, onNever, onGo, onDismiss }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const pending = pendingTasks(state)
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1366 : window.innerWidth))
  const done = TASK_IDS.length - pending.length

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    document.body.classList.add('g3-chip-on')
    const onPointer = (e: MouseEvent) => {
      const node = e.target
      if (!(node instanceof Node)) return
      if (ref.current?.contains(node)) return
      onGotIt()
    }
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.body.classList.remove('g3-chip-on')
      document.removeEventListener('mousedown', onPointer)
    }
  }, [onGotIt])

  if (!pending.length && mode === 'chip') return null
  const bar = chipPlacement(width) === 'bar'
  const node = (
    <aside
      ref={ref}
      className={`g3-chip${bar ? ' is-bar' : ''}${mode === 'panel' ? ' g3-panel' : ''}`}
      data-testid="first-week-chip"
      data-placement={bar ? 'bar' : 'corner'}
      aria-label={t('g3.chipTitle')}
    >
      <div className="g3-chip-row">
        <strong>
          {t('g3.chipTitle')} · {done}/{TASK_IDS.length}
        </strong>
        {pending[0] ? <span className="g3-chip-task">{t(COPY[pending[0]].title)}</span> : null}
        <button type="button" data-testid="g3-got-it" onClick={onGotIt}>
          {t('g3.gotIt')}
        </button>
        <button type="button" data-testid="g3-never" onClick={onNever}>
          {t('g3.never')}
        </button>
        <button type="button" aria-label={t('g3.dismiss')} onClick={onGotIt}>
          ×
        </button>
      </div>
      {mode === 'panel' && !bar
        ? pending.map((id) => (
            <article key={id} className="g3-card" data-testid={`task-${id}`}>
              <div>
                <strong>{t(COPY[id].title)}</strong>
                <p>{t(COPY[id].desc)}</p>
              </div>
              <div className="g3-actions">
                <button type="button" className="primary" onClick={() => onGo?.(id)}>
                  {t('g3.go')}
                </button>
                <button type="button" onClick={() => onDismiss?.(id)}>
                  {t('g3.dismiss')}
                </button>
              </div>
            </article>
          ))
        : null}
    </aside>
  )
  return createPortal(node, document.body)
}
