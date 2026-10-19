import type { TaskId, TaskState } from '@shared/retention-tasks'
import { pendingTasks } from '@shared/retention-tasks'
import { useI18n, type MessageKey } from '../lib/i18n'
import Button from './ui/Button'

const COPY: Record<TaskId, { title: MessageKey; desc: MessageKey }> = {
  connect: { title: 'g3.connect', desc: 'g3.connectDesc' },
  monitor: { title: 'g3.monitor', desc: 'g3.monitorDesc' },
  ai: { title: 'g3.ai', desc: 'g3.aiDesc' },
  transfer: { title: 'g3.transfer', desc: 'g3.transferDesc' }
}

type Props = {
  state: TaskState
  onGo: (id: TaskId) => void
  onDismiss: (id: TaskId) => void
  onDismissAll: () => void
}

/** G3: small cards over the terminal corner. They do not cover the command bar or take a modal. */
export default function RetentionTasks({ state, onGo, onDismiss, onDismissAll }: Props) {
  const { t } = useI18n()
  const pending = pendingTasks(state)
  if (!pending.length || state.dismissedForever) return null
  return (
    <aside className="g3-stack" data-testid="retention-tasks" aria-label={t('g3.title')}>
      <div className="g3-head">
        <strong>{t('g3.title')}</strong>
        <button type="button" onClick={onDismissAll}>
          {t('g3.dismissAll')}
        </button>
      </div>
      {pending.map((id) => (
        <article key={id} className="g3-card" data-testid={`task-${id}`}>
          <div>
            <strong>{t(COPY[id].title)}</strong>
            <p>{t(COPY[id].desc)}</p>
          </div>
          <div className="g3-actions">
            <Button variant="primary" onClick={() => onGo(id)}>
              {t('g3.go')}
            </Button>
            <button type="button" onClick={() => onDismiss(id)}>
              {t('g3.dismiss')}
            </button>
          </div>
        </article>
      ))}
    </aside>
  )
}
